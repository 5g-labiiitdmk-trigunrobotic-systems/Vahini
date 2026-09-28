/**
 * Onelap Micro GPS Integration Service
 * 
 * Interacts with Onelap Open API (web.onelap.in) to retrieve live telemetry
 * from hardware GPS trackers and seamlessly stream updates to the campus bus live map.
 */

let cachedSessionCookie = null;

function getBasicAuthHeader(phone, password) {
  const credentials = `${phone}:${password}`;
  const base64 = Buffer.from(credentials).toString("base64");
  return `Basic ${base64}`;
}

/**
 * Authenticate and obtain a JSESSIONID cookie from Onelap.
 */
async function authenticateSession({ baseUrl, phone, password }) {
  try {
    const url = `${baseUrl}/api/session`;
    const params = new URLSearchParams();
    params.append("email", phone);
    params.append("password", password);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (res.ok) {
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        const match = setCookie.match(/JSESSIONID=([^;]+)/);
        if (match) {
          cachedSessionCookie = `JSESSIONID=${match[1]}`;
          return cachedSessionCookie;
        }
      }
      return null;
    }
  } catch (err) {
    // ignore session login error and fallback to Basic Auth
  }
  return null;
}

/**
 * Perform an authenticated request to Onelap with dual auth fallback (Basic + Session).
 */
async function onelapRequest(url, { baseUrl, phone, password }) {
  const headers = {
    Accept: "application/json",
  };

  if (cachedSessionCookie) {
    headers["Cookie"] = cachedSessionCookie;
  } else {
    headers["Authorization"] = getBasicAuthHeader(phone, password);
  }

  let res = await fetch(url, { method: "GET", headers });

  // If 401 Unauthorized, try creating session or raw base64
  if (res.status === 401) {
    // 1. Try session auth
    const sessionCookie = await authenticateSession({ baseUrl, phone, password });
    if (sessionCookie) {
      headers["Cookie"] = sessionCookie;
      delete headers["Authorization"];
      res = await fetch(url, { method: "GET", headers });
    } else {
      // 2. Try raw base64 header (without Basic prefix)
      const rawBase64 = Buffer.from(`${phone}:${password}`).toString("base64");
      headers["Authorization"] = rawBase64;
      res = await fetch(url, { method: "GET", headers });
    }
  }

  return res;
}

/**
 * Fetch all devices registered under the user account.
 */
async function fetchDevices({ baseUrl, phone, password }) {
  const url = `${baseUrl}/api/devices`;
  const res = await onelapRequest(url, { baseUrl, phone, password });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Onelap fetchDevices failed (${res.status} ${res.statusText}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Fetch latest position object for a specific deviceId.
 */
async function fetchLatestPosition({ baseUrl, phone, password, deviceId }) {
  const url = `${baseUrl}/api/positions/latest?deviceId=${encodeURIComponent(deviceId)}`;
  const res = await onelapRequest(url, { baseUrl, phone, password });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Onelap fetchLatestPosition failed (${res.status} ${res.statusText}): ${errorText}`);
  }

  return await res.json();
}


/**
 * Normalize Onelap position payload to internal Campus Bus telemetry schema.
 */
function normalizePosition(position, busId) {
  if (!position) return null;

  const lat = Number(position.latitude ?? position.lat);
  const lng = Number(position.longitude ?? position.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  // Speed in km/h (GT06 protocol speed is typically in km/h or knots, Onelap sends km/h)
  const speed = position.speed != null ? Number(position.speed) : null;
  const course = position.course != null ? Number(position.course) : null;
  const satellites = position.attributes?.sat ?? position.attributes?.gsm ?? null;
  const recordedAt = position.deviceTime || position.fixTime || position.serverTime || new Date().toISOString();

  return {
    busId: busId || "BUS-01",
    lat,
    lng,
    speedKmh: speed != null && Number.isFinite(speed) ? Math.max(0, speed) : 0,
    heading: course != null && Number.isFinite(course) ? course : null,
    satellites: satellites != null ? Number(satellites) : null,
    accuracyMeters: position.valid === false ? 25 : 5,
    recordedAt,
    rawAttributes: position.attributes || {},
  };
}

/**
 * Create a managed Onelap background polling service.
 */
function createOnelapService({ config, store, io }) {
  const onelapConfig = config.onelap;
  let timer = null;
  let isPolling = false;
  let lastRecordedAt = null;
  let lastLat = null;
  let lastLng = null;
  let activeDeviceId = onelapConfig?.deviceId && onelapConfig.deviceId !== "your_device_id" ? onelapConfig.deviceId : null;

  const state = {
    enabled: Boolean(onelapConfig?.enabled),
    running: false,
    deviceId: activeDeviceId,
    busId: onelapConfig?.busId || "BUS-01",
    pollIntervalMs: onelapConfig?.pollIntervalMs || 3000,
    lastSyncTime: null,
    lastSuccess: null,
    lastError: null,
    consecutiveErrors: 0,
    lastPosition: null,
  };

  async function resolveDeviceId() {
    if (activeDeviceId && activeDeviceId !== "your_device_id") return activeDeviceId;
    try {
      const devices = await fetchDevices({
        baseUrl: onelapConfig.baseUrl,
        phone: onelapConfig.phone,
        password: onelapConfig.password,
      });
      if (Array.isArray(devices) && devices.length > 0 && devices[0].id) {
        activeDeviceId = String(devices[0].id);
        state.deviceId = activeDeviceId;
        console.log(`[Onelap GPS] Auto-discovered Device #${activeDeviceId} (${devices[0].name || "Onelap Tracker"}) for ${state.busId}`);
        return activeDeviceId;
      }
    } catch (err) {
      // Handled in pollOnce
    }
    return null;
  }

  async function pollOnce() {
    if (isPolling) return;
    isPolling = true;

    try {
      if (!onelapConfig.phone || !onelapConfig.password) {
        throw new Error("Missing Onelap credentials: ONELAP_PHONE and ONELAP_PASSWORD are required in server/.env");
      }

      const targetId = activeDeviceId || await resolveDeviceId();
      if (!targetId) {
        throw new Error("No device registered or active under this Onelap account. Activate your hardware GPS in the Onelap App first.");
      }

      const raw = await fetchLatestPosition({
        baseUrl: onelapConfig.baseUrl,
        phone: onelapConfig.phone,
        password: onelapConfig.password,
        deviceId: targetId,
      });

      const telemetry = normalizePosition(raw, onelapConfig.busId);
      if (!telemetry) {
        throw new Error("Received empty or invalid GPS coordinate payload from Onelap");
      }

      state.lastSyncTime = new Date().toISOString();
      state.lastSuccess = new Date().toISOString();
      state.lastError = null;
      state.consecutiveErrors = 0;
      state.lastPosition = {
        lat: telemetry.lat,
        lng: telemetry.lng,
        speed: telemetry.speedKmh,
        recordedAt: telemetry.recordedAt,
        battery: raw.attributes?.battery,
        satellites: telemetry.satellites,
      };

      // Always update store if new recordedAt or new coordinates
      const isNew = telemetry.recordedAt !== lastRecordedAt ||
                    telemetry.lat !== lastLat ||
                    telemetry.lng !== lastLng;

      if (isNew) {
        lastRecordedAt = telemetry.recordedAt;
        lastLat = telemetry.lat;
        lastLng = telemetry.lng;

        const result = await store.updatePosition({
          busId: telemetry.busId,
          lat: telemetry.lat,
          lng: telemetry.lng,
          speedKmh: telemetry.speedKmh,
          heading: telemetry.heading,
          satellites: telemetry.satellites,
          accuracyMeters: telemetry.accuracyMeters,
          recordedAt: telemetry.recordedAt,
        });

        if (result?.bus && io) {
          io.emit("bus:update", result.bus);
        }
      }
    } catch (err) {
      state.consecutiveErrors++;
      state.lastError = err.message;
      state.lastSyncTime = new Date().toISOString();
      // Only log on 1st error and every 20th error to prevent terminal flooding when hardware is offline
      if (state.consecutiveErrors === 1 || state.consecutiveErrors % 20 === 0) {
        console.warn(`[Onelap GPS] Info: ${err.message} (Will auto-retry every ${state.pollIntervalMs / 1000}s)`);
      }
    } finally {
      isPolling = false;
    }
  }

  function start() {
    if (state.running) return;
    if (!state.enabled) {
      console.log("[Onelap GPS] Ingestion is disabled (Set ONELAP_ENABLED=true in server/.env when ready).");
      return;
    }

    if (!onelapConfig.phone || !onelapConfig.password) {
      console.warn("[Onelap GPS] Missing credentials (ONELAP_PHONE / ONELAP_PASSWORD). Ingestion not started.");
      return;
    }

    state.running = true;
    console.log(`[Onelap GPS] Ingestion service active (Polling every ${state.pollIntervalMs / 1000}s)...`);

    // Immediate initial poll
    pollOnce();
    timer = setInterval(pollOnce, state.pollIntervalMs);
  }


  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    state.running = false;
    console.log("[Onelap GPS] Service stopped.");
  }

  function getStatus() {
    return {
      ...state,
      config: {
        baseUrl: onelapConfig.baseUrl,
        deviceId: onelapConfig.deviceId,
        busId: onelapConfig.busId,
        pollIntervalMs: state.pollIntervalMs,
        phoneConfigured: Boolean(onelapConfig.phone),
      },
    };
  }

  return {
    start,
    stop,
    pollOnce,
    getStatus,
    fetchDevices: () => fetchDevices({
      baseUrl: onelapConfig.baseUrl,
      phone: onelapConfig.phone,
      password: onelapConfig.password,
    }),
  };
}

module.exports = {
  getBasicAuthHeader,
  getAuthHeader: getBasicAuthHeader,
  fetchDevices,
  fetchLatestPosition,
  normalizePosition,
  createOnelapService,
};

