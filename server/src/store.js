const { createSupabase } = require("./db");

const STALE_MS = 90_000;

const DEFAULT_BUSES = [
  {
    id: "BUS-01",
    name: "City Shuttle",
    route: "IIITDM Kurnool ↔ G. Pulla Reddy ↔ Nandyal Check post ↔ C-Camp ↔ Raj Vihar",
    color: "#1E3A8A",
    stops: [
      { id: "campus", name: "IIITDM Kurnool Campus", lat: 15.761093, lng: 78.038980 },
      { id: "gpr", name: "Pulla Reddy Engineering College", lat: 15.774741, lng: 78.058717 },
      { id: "nandyal", name: "Nandyal Check post", lat: 15.797984, lng: 78.052022 },
      { id: "ccamp", name: "C Camp Circle", lat: 15.807002, lng: 78.042479 },
      { id: "rajvihar", name: "Raj Vihar (Kurnool Center)", lat: 15.828735, lng: 78.038423 },
    ],
  },
];

function liveFromRow(row) {
  if (!row) return null;
  const recordedAt = row.recorded_at || row.recordedAt;
  const updatedAt = recordedAt ? new Date(recordedAt).getTime() : Date.now();
  return {
    lat: Number(row.lat),
    lng: Number(row.lng),
    speedKmh: row.speed_kmh == null && row.speedKmh == null ? null : Number(row.speed_kmh ?? row.speedKmh),
    heading: row.heading == null ? null : Number(row.heading),
    satellites: row.satellites == null ? null : Number(row.satellites),
    accuracyMeters: row.accuracy_meters == null && row.accuracyMeters == null ? null : Number(row.accuracy_meters ?? row.accuracyMeters),
    recordedAt: recordedAt || new Date().toISOString(),
    updatedAt,
  };
}

function withLive(bus, live) {
  const updatedAt = live?.updatedAt || null;
  const stale = !updatedAt || Date.now() - updatedAt > STALE_MS;
  return { ...bus, live, stale, online: Boolean(live) && !stale };
}

function formatDateStr(d = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch (_) {
    return "—";
  }
}

function formatHourLabel(hour) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatPeakHour(hour) {
  if (hour === null || hour === undefined || hour < 0) return "None";
  const start = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
  const nextH = (hour + 1) % 24;
  const end = nextH === 0 ? "12 AM" : nextH < 12 ? `${nextH} AM` : nextH === 12 ? "12 PM" : `${nextH - 12} PM`;
  return `${start.replace(" ", "")}–${end}`;
}

// Haversine distance formula to calculate real distance travelled between successive GPS points (km)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function createStore() {
  let supabase = null;
  try {
    supabase = createSupabase();
  } catch (err) {
    console.log("Supabase not configured; using live in-memory store.");
  }

  // Live in-memory cache
  const memoryBuses = new Map(DEFAULT_BUSES.map((b) => [b.id, { ...b }]));
  const memoryLatest = new Map();

  // Analytics & Logs Storage (Pure live data - NO mock/demo seeds)
  const memoryVisits = []; // Array of { id, page, dateStr, hour, timestamp }
  const memoryDailyLogs = new Map(); // dateStr -> logObject
  const memoryAdminLogs = []; // Array of { id, action, details, timestamp }

  async function ensureSeed() {
    if (!supabase) return;
    try {
      const allowedIds = DEFAULT_BUSES.map((b) => b.id);

      // Clean up obsolete buses from Supabase
      const { data: existingBuses } = await supabase.from("buses").select("id");
      if (existingBuses && existingBuses.length > 0) {
        const obsolete = existingBuses.filter((b) => !allowedIds.includes(b.id)).map((b) => b.id);
        if (obsolete.length > 0) {
          await supabase.from("stops").delete().in("bus_id", obsolete);
          await supabase.from("telemetry").delete().in("bus_id", obsolete);
          await supabase.from("buses").delete().in("id", obsolete);
        }
      }

      // Upsert default single bus and its stops
      for (const bus of DEFAULT_BUSES) {
        await supabase.from("buses").upsert({
          id: bus.id,
          name: bus.name,
          route: bus.route,
          color: bus.color,
        });

        await supabase.from("stops").delete().eq("bus_id", bus.id);
        for (const stop of bus.stops) {
          await supabase.from("stops").insert({
            id: stop.id,
            bus_id: bus.id,
            name: stop.name,
            lat: stop.lat,
            lng: stop.lng,
          });
        }
      }
    } catch (err) {
      console.warn("Supabase seed warning:", err.message);
    }
  }

  async function listBuses() {
    if (supabase) {
      try {
        const { data: buses, error } = await supabase.from("buses").select("*").order("id");
        if (!error && buses && buses.length > 0) {
          const { data: stops } = await supabase.from("stops").select("*");
          const { data: latestRows } = await supabase.from("bus_latest").select("*");

          const stopsByBus = new Map();
          for (const stop of stops || []) {
            const list = stopsByBus.get(stop.bus_id) || [];
            list.push({
              id: stop.id,
              name: stop.name,
              lat: Number(stop.lat),
              lng: Number(stop.lng),
            });
            stopsByBus.set(stop.bus_id, list);
          }

          const latestMap = new Map();
          for (const row of latestRows || []) {
            latestMap.set(row.bus_id, liveFromRow(row));
          }

          return buses.map((bus) => {
            const live = latestMap.get(bus.id) || memoryLatest.get(bus.id) || null;
            return withLive(
              {
                id: bus.id,
                name: bus.name,
                route: bus.route,
                color: bus.color,
                stops: stopsByBus.get(bus.id) || [],
              },
              live
            );
          });
        }
      } catch (err) {
        console.warn("Supabase fetch failed, falling back to in-memory:", err.message);
      }
    }

    // In-memory fallback
    return Array.from(memoryBuses.values()).map((bus) =>
      withLive(bus, memoryLatest.get(bus.id) || null)
    );
  }

  async function getBus(id) {
    const buses = await listBuses();
    return buses.find((b) => b.id === id) || null;
  }

  async function updatePosition(payload) {
    const busId = payload.busId;
    if (!memoryBuses.has(busId)) {
      const buses = await listBuses();
      const found = buses.find((b) => b.id === busId);
      if (!found) {
        memoryBuses.set(busId, {
          id: busId,
          name: `Bus ${busId}`,
          route: "Campus Route",
          color: "#1E3A8A",
          stops: [],
        });
      }
    }

    const prevLive = memoryLatest.get(busId) || null;
    const live = liveFromRow(payload);
    memoryLatest.set(busId, live);

    // Calculate real live incremental distance travelled
    let incrementalDistKm = 0;
    if (prevLive && prevLive.lat && prevLive.lng) {
      const deltaKm = calculateDistanceKm(prevLive.lat, prevLive.lng, live.lat, live.lng);
      // Filter out small GPS jitter (< 5 meters) and extreme outliers (> 50 km in 3s)
      if (deltaKm >= 0.005 && deltaKm < 50) {
        incrementalDistKm = deltaKm;
      }
    }

    // Update today's live daily log distance & position
    const todayStr = formatDateStr();
    const existingLog = memoryDailyLogs.get(todayStr) || {
      busId: "BUS-01",
      dateStr: todayStr,
      status: "Active",
      startTime: formatTime(live.recordedAt),
      endTime: "—",
      totalDistanceKm: 0,
      operatingTimeMins: 0,
      startingLocation: "IIITDM Kurnool Campus",
      endingLocation: "Raj Vihar",
      currentLocation: `${live.lat.toFixed(5)}, ${live.lng.toFixed(5)}`,
      stopsVisitedCount: 5,
    };

    existingLog.status = "Active";
    existingLog.currentLocation = `${live.lat.toFixed(5)}, ${live.lng.toFixed(5)}`;
    existingLog.totalDistanceKm = +(existingLog.totalDistanceKm + incrementalDistKm).toFixed(2);
    if (!existingLog.startTime || existingLog.startTime === "—") {
      existingLog.startTime = formatTime(live.recordedAt);
    }
    existingLog.updatedAt = new Date().toISOString();
    memoryDailyLogs.set(todayStr, existingLog);

    if (supabase) {
      try {
        await supabase.from("telemetry").insert({
          bus_id: busId,
          lat: payload.lat,
          lng: payload.lng,
          speed_kmh: payload.speedKmh,
          heading: payload.heading,
          satellites: payload.satellites,
          accuracy_meters: payload.accuracyMeters,
          recorded_at: payload.recordedAt || new Date().toISOString(),
        });
      } catch (err) {
        console.warn("Supabase telemetry insert error:", err.message);
      }
    }

    return { bus: await getBus(busId) };
  }

  // =========================================================
  // Website Opens / Visit Analytics Methods
  // =========================================================

  async function recordWebsiteVisit(payload = {}) {
    const now = new Date();
    const dateStr = formatDateStr(now);
    const hour = now.getHours();
    const page = payload.page || "Bus Tracking";
    const timestamp = now.toISOString();

    const visit = {
      id: memoryVisits.length + 1,
      page,
      dateStr,
      hour,
      timestamp,
    };
    memoryVisits.push(visit);

    if (supabase) {
      try {
        await supabase.from("website_opens").insert({
          page,
          hour,
          date_str: dateStr,
          recorded_at: timestamp,
        });
      } catch (err) {
        console.warn("Supabase website_opens insert error:", err.message);
      }
    }

    return visit;
  }

  async function getWebsiteAnalytics(targetDateStr) {
    const dateStr = targetDateStr || formatDateStr();

    let visits = [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("website_opens")
          .select("*")
          .eq("date_str", dateStr);
        if (!error && data) {
          visits = data.map((row) => ({
            id: row.id,
            page: row.page,
            dateStr: row.date_str,
            hour: row.hour,
            timestamp: row.recorded_at,
          }));
        }
      } catch (err) {
        console.warn("Supabase website_opens fetch error:", err.message);
      }
    }

    // Fallback/merge with in-memory visits
    if (visits.length === 0) {
      visits = memoryVisits.filter((v) => v.dateStr === dateStr);
    }

    const totalOpens = visits.length;

    // Hourly Breakdown (24 hours)
    const hourlyMap = new Array(24).fill(0);
    const pageCountMap = {};

    visits.forEach((v) => {
      const h = Number(v.hour);
      if (h >= 0 && h < 24) {
        hourlyMap[h]++;
      }
      const p = v.page || "Bus Tracking";
      pageCountMap[p] = (pageCountMap[p] || 0) + 1;
    });

    const hourlyOpens = hourlyMap.map((count, hour) => ({
      hour,
      label: formatHourLabel(hour),
      count,
    }));

    // Find Peak Hour
    let peakHourIndex = -1;
    let maxHourCount = 0;
    hourlyMap.forEach((count, h) => {
      if (count > maxHourCount) {
        maxHourCount = count;
        peakHourIndex = h;
      }
    });

    // Most Visited Page
    let mostVisitedPage = totalOpens > 0 ? "Bus Tracking" : "—";
    let maxPageCount = 0;
    Object.entries(pageCountMap).forEach(([p, count]) => {
      if (count > maxPageCount) {
        maxPageCount = count;
        mostVisitedPage = p;
      }
    });

    return {
      date: dateStr,
      totalOpens,
      peakHour: maxHourCount > 0 ? formatPeakHour(peakHourIndex) : "None",
      peakHourCount: maxHourCount,
      mostVisitedPage,
      pageBreakdown: pageCountMap,
      hourlyOpens,
    };
  }

  // =========================================================
  // Single Bus Daily Logs & Statistics
  // =========================================================

  async function getDailyBusLog(targetDateStr) {
    const dateStr = targetDateStr || formatDateStr();

    let log = null;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("daily_bus_logs")
          .select("*")
          .eq("date_str", dateStr)
          .single();
        if (!error && data) {
          log = {
            id: data.id,
            busId: data.bus_id,
            dateStr: data.date_str,
            status: data.status,
            startTime: data.start_time,
            endTime: data.end_time,
            totalDistanceKm: Number(data.total_distance_km) || 0,
            operatingTimeMins: Number(data.operating_time_mins) || 0,
            startingLocation: data.starting_location,
            endingLocation: data.ending_location,
            currentLocation: data.current_location,
            stopsVisitedCount: Number(data.stops_visited_count) || 0,
            updatedAt: data.updated_at,
          };
          memoryDailyLogs.set(dateStr, log);
        }
      } catch (err) {
        // Record does not exist in DB yet
      }
    }

    if (!log) {
      log = memoryDailyLogs.get(dateStr);
    }

    if (!log) {
      const isToday = dateStr === formatDateStr();
      const bus = await getBus("BUS-01");
      const isOnline = Boolean(bus && bus.online);

      if (isToday) {
        log = {
          busId: "BUS-01",
          dateStr,
          status: isOnline ? "Active" : "Not Started",
          startTime: bus?.live ? formatTime(bus.live.recordedAt) : "—",
          endTime: "—",
          totalDistanceKm: 0.0,
          operatingTimeMins: 0,
          startingLocation: "IIITDM Kurnool Campus",
          endingLocation: "Raj Vihar",
          currentLocation: bus?.live ? `${bus.live.lat.toFixed(5)}, ${bus.live.lng.toFixed(5)}` : "IIITDM Kurnool Campus",
          stopsVisitedCount: isOnline ? 5 : 0,
          updatedAt: new Date().toISOString(),
        };
      } else {
        log = {
          busId: "BUS-01",
          dateStr,
          status: "Offline",
          startTime: "—",
          endTime: "—",
          totalDistanceKm: 0.0,
          operatingTimeMins: 0,
          startingLocation: "IIITDM Kurnool Campus",
          endingLocation: "Raj Vihar",
          currentLocation: "—",
          stopsVisitedCount: 0,
          updatedAt: new Date().toISOString(),
        };
      }
      memoryDailyLogs.set(dateStr, log);
    }

    return log;
  }

  async function listDailyBusLogs(limit = 30) {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("daily_bus_logs")
          .select("*")
          .order("date_str", { ascending: false })
          .limit(limit);
        if (!error && data && data.length > 0) {
          return data.map((d) => ({
            id: d.id,
            busId: d.bus_id,
            dateStr: d.date_str,
            status: d.status,
            startTime: d.start_time,
            endTime: d.end_time,
            totalDistanceKm: Number(d.total_distance_km) || 0,
            operatingTimeMins: Number(d.operating_time_mins) || 0,
            startingLocation: d.starting_location,
            endingLocation: d.ending_location,
            currentLocation: d.current_location,
            stopsVisitedCount: Number(d.stops_visited_count) || 0,
            updatedAt: d.updated_at,
          }));
        }
      } catch (err) {
        console.warn("Supabase listDailyBusLogs fetch error:", err.message);
      }
    }

    const logs = Array.from(memoryDailyLogs.values());
    logs.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    return logs.slice(0, limit);
  }

  async function saveDailyBusLog(payload = {}) {
    const dateStr = payload.dateStr || formatDateStr();
    const existing = memoryDailyLogs.get(dateStr) || {};

    const updated = {
      ...existing,
      ...payload,
      busId: "BUS-01",
      dateStr,
      updatedAt: new Date().toISOString(),
    };

    memoryDailyLogs.set(dateStr, updated);

    if (supabase) {
      try {
        await supabase.from("daily_bus_logs").upsert({
          bus_id: "BUS-01",
          date_str: dateStr,
          status: updated.status,
          start_time: updated.startTime,
          end_time: updated.endTime,
          total_distance_km: updated.totalDistanceKm,
          operating_time_mins: updated.operatingTimeMins,
          starting_location: updated.startingLocation,
          ending_location: updated.endingLocation,
          current_location: updated.currentLocation,
          stops_visited_count: updated.stopsVisitedCount,
          updated_at: updated.updatedAt,
        });
      } catch (err) {
        console.warn("Supabase daily_bus_logs upsert error:", err.message);
      }
    }

    return updated;
  }

  // =========================================================
  // Dashboard Aggregator for Selected Date
  // =========================================================

  async function getDashboardStats(targetDateStr) {
    const dateStr = targetDateStr || formatDateStr();
    const busLog = await getDailyBusLog(dateStr);
    const websiteAnalytics = await getWebsiteAnalytics(dateStr);
    const bus = await getBus("BUS-01");

    const mins = Number(busLog.operatingTimeMins) || 0;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const operatingTimeStr = hours > 0 ? `${hours}h ${remMins}m` : `${remMins}m`;

    return {
      date: dateStr,
      bus: {
        id: "BUS-01",
        name: "City Shuttle",
        distanceKm: Number(busLog.totalDistanceKm) || 0,
        operatingTime: operatingTimeStr,
        operatingTimeMins: mins,
        startTime: busLog.startTime || "—",
        endTime: busLog.endTime || "—",
        status: busLog.status || (bus?.online ? "Active" : "Not Started"),
        startingLocation: busLog.startingLocation || "IIITDM Kurnool Campus",
        endingLocation: busLog.endingLocation || "Raj Vihar",
        currentLocation: busLog.currentLocation || (bus?.live ? `${bus.live.lat.toFixed(5)}, ${bus.live.lng.toFixed(5)}` : "IIITDM Kurnool Campus"),
        stopsVisitedCount: Number(busLog.stopsVisitedCount) || 0,
        online: Boolean(bus?.online),
        speedKmh: bus?.live?.speedKmh != null ? bus.live.speedKmh : 0,
      },
      website: websiteAnalytics,
    };
  }

  // =========================================================
  // Comprehensive All-Time Statistics
  // =========================================================

  async function getStatisticsOverview() {
    let allLogs = [];
    if (supabase) {
      try {
        const { data } = await supabase.from("daily_bus_logs").select("*");
        if (data && data.length > 0) {
          allLogs = data;
        }
      } catch (_) {}
    }
    if (allLogs.length === 0) {
      allLogs = Array.from(memoryDailyLogs.values());
    }

    const totalDays = allLogs.length;

    let totalDist = 0;
    let totalMins = 0;
    allLogs.forEach((l) => {
      totalDist += Number(l.total_distance_km ?? l.totalDistanceKm) || 0;
      totalMins += Number(l.operating_time_mins ?? l.operatingTimeMins) || 0;
    });

    const avgDistance = totalDays > 0 ? +(totalDist / totalDays).toFixed(1) : 0;
    const totalHours = +(totalMins / 60).toFixed(1);
    const avgDailyMins = totalDays > 0 ? Math.round(totalMins / totalDays) : 0;

    let totalOpens = 0;
    let peakDay = "—";
    let peakDayOpens = 0;

    if (supabase) {
      try {
        const { count } = await supabase.from("website_opens").select("*", { count: "exact", head: true });
        totalOpens = count || 0;

        const { data: dateRows } = await supabase.from("website_opens").select("date_str");
        if (dateRows && dateRows.length > 0) {
          const dateCounts = {};
          dateRows.forEach((r) => {
            dateCounts[r.date_str] = (dateCounts[r.date_str] || 0) + 1;
          });
          Object.entries(dateCounts).forEach(([d, c]) => {
            if (c > peakDayOpens) {
              peakDayOpens = c;
              peakDay = d;
            }
          });
        }
      } catch (_) {}
    }

    if (totalOpens === 0 && memoryVisits.length > 0) {
      totalOpens = memoryVisits.length;
      const dateCounts = {};
      memoryVisits.forEach((v) => {
        dateCounts[v.dateStr] = (dateCounts[v.dateStr] || 0) + 1;
      });
      Object.entries(dateCounts).forEach(([d, c]) => {
        if (c > peakDayOpens) {
          peakDayOpens = c;
          peakDay = d;
        }
      });
    }

    const avgOpens = totalDays > 0 ? Math.round(totalOpens / totalDays) : totalOpens;

    return {
      totalDaysTracked: totalDays > 0 ? totalDays : (totalOpens > 0 ? 1 : 0),
      totalDistanceKm: +totalDist.toFixed(1),
      averageDailyDistanceKm: avgDistance,
      totalOperatingHours: totalHours,
      averageDailyOperatingMins: avgDailyMins,
      totalWebsiteOpens: totalOpens,
      averageDailyWebsiteOpens: avgOpens,
      peakTrafficDate: peakDay,
      peakTrafficOpens: peakDayOpens,
    };
  }

  // =========================================================
  // Admin Activity Audit Logs
  // =========================================================

  async function recordAdminActivity(payload = {}) {
    const record = {
      id: memoryAdminLogs.length + 1,
      action: payload.action || "Admin Action",
      details: payload.details || "—",
      timestamp: payload.timestamp || new Date().toISOString(),
    };
    memoryAdminLogs.unshift(record);

    if (supabase) {
      try {
        await supabase.from("admin_activity_logs").insert({
          action: record.action,
          details: record.details,
          recorded_at: record.timestamp,
        });
      } catch (err) {
        console.warn("Supabase admin_activity_logs insert error:", err.message);
      }
    }

    return record;
  }

  async function listAdminActivities(limit = 50) {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("admin_activity_logs")
          .select("*")
          .order("recorded_at", { ascending: false })
          .limit(limit);
        if (!error && data && data.length > 0) {
          return data.map((d) => ({
            id: d.id,
            action: d.action,
            details: d.details,
            timestamp: d.recorded_at,
          }));
        }
      } catch (err) {
        console.warn("Supabase admin_activity_logs fetch error:", err.message);
      }
    }
    return memoryAdminLogs.slice(0, limit);
  }

  return {
    ensureSeed,
    listBuses,
    getBus,
    updatePosition,
    // Analytics & Admin Methods
    recordWebsiteVisit,
    getWebsiteAnalytics,
    getDailyBusLog,
    listDailyBusLogs,
    saveDailyBusLog,
    getDashboardStats,
    getStatisticsOverview,
    recordAdminActivity,
    listAdminActivities,
  };
}

module.exports = { createStore, STALE_MS };
