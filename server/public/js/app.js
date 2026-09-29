// Public Real-Time Bus Tracker & Timetable Logic
const IIITDM_CAMPUS = [15.761093, 78.038980];

// UI References
const systemStatusPill = document.getElementById("system-status");
const statusText = document.getElementById("status-text");
const busCardsList = document.getElementById("bus-cards-list");
const busCountBadge = document.getElementById("bus-count-badge");
const stopsPanel = document.getElementById("stops-panel");
const selectedRouteName = document.getElementById("selected-route-name");
const timelineContainer = document.getElementById("timeline-container");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const busSidebar = document.getElementById("bus-sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const btnSidebarClose = document.getElementById("btn-sidebar-close");
const sheetDragHandle = document.getElementById("sheet-drag-handle");

// Header & Map Controls
const openTimetableBtn = document.getElementById("open-timetable-btn");
const quickOpenTimetable = document.getElementById("quick-open-timetable");
const btnRefresh = document.getElementById("btn-refresh");
const btnLocateUser = document.getElementById("btn-locate-user");
const btnRecenterBus = document.getElementById("btn-recenter-bus");

// Hero Banner UI References
const heroFromStop = document.getElementById("hero-from-stop");
const heroToStop = document.getElementById("hero-to-stop");
const heroPickupTime = document.getElementById("hero-pickup-time");
const heroDropTime = document.getElementById("hero-drop-time");
const heroCountdownLabel = document.getElementById("hero-countdown-label");
const heroCountdownClock = document.getElementById("hero-countdown-clock");
const nextBusBadge = document.getElementById("next-bus-badge");
const badgeStatusText = document.getElementById("badge-status-text");

// Timetable Modal References
const timetableModal = document.getElementById("timetable-modal");
const closeTimetableModal = document.getElementById("close-timetable-modal");
const btnDoneModal = document.getElementById("btn-done-modal");
const modalTodayInfo = document.getElementById("modal-today-info");
const timetableTbody = document.getElementById("timetable-tbody");
const modalTabs = document.querySelectorAll(".modal-tab");
const filterPills = document.querySelectorAll(".filter-pill");

// About Button Reference
const openAboutBtn = document.getElementById("open-about-btn");

// Floating HUD
const floatingBusHud = document.getElementById("floating-bus-hud");
const hudColorIndicator = document.getElementById("hud-color-indicator");
const hudBusName = document.getElementById("hud-bus-name");
const hudBusSub = document.getElementById("hud-bus-sub");
const hudCloseBtn = document.getElementById("hud-close-btn");

// State
let map = null;
let socket = null;
let buses = [];
let scheduleData = null;
let selectedBusId = null;

// Timetable Modal State
let activeScheduleTab = "today"; // "today", "weekday", "weekend"
let activeDirectionFilter = "all"; // "all", "from_campus", "to_campus"

// Marker References
let busMarkers = {}; // busId -> L.Marker
let stopMarkers = {}; // stopId -> L.Marker
let campusMarker = null;
let userMarker = null;

// 1. Initialize Leaflet Map
function initMap() {
  map = L.map("map", {
    zoomControl: false,
  }).setView(IIITDM_CAMPUS, 14);

  // Clean OpenStreetMap layer (Free & Open Source - No API Key Required)
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Campus Center Marker
  const campusIcon = L.divIcon({
    className: "campus-pin",
    html: `<div style="
      background: #1e3a8a;
      color: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 11px;
      border: 2px solid #fff;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    "><i class="fa-solid fa-graduation-cap"></i> IIITDM Kurnool</div>`,
    iconSize: [120, 30],
    iconAnchor: [60, 15],
  });

  campusMarker = L.marker(IIITDM_CAMPUS, { icon: campusIcon }).addTo(map);
  campusMarker.bindPopup("<b>IIITDM Kurnool Campus</b><br>Jagannathagattu Hill");
}

// 2. Fetch Schedule & Initialize
async function loadSchedule() {
  try {
    const res = await fetch("/api/v1/schedule");
    scheduleData = await res.json();
    renderAllStopsOnMap();
    updateNextBusBanner();
  } catch (err) {
    console.error("Failed to load schedule:", err);
  }
}

// 3. Render Official Stop Points on Map
function renderAllStopsOnMap() {
  if (!scheduleData || !scheduleData.stops) return;

  Object.values(scheduleData.stops).forEach((stop) => {
    if (stopMarkers[stop.id]) return;

    const stopIcon = L.divIcon({
      className: "custom-stop-marker",
      html: `<i class="fa-solid ${stop.isCampus ? "fa-graduation-cap" : "fa-location-dot"}"></i>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    const m = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map);
    m.bindPopup(`
      <div style="font-family: var(--font-sans); padding: 4px;">
        <h4 style="margin: 0 0 4px; color: #1e3a8a; font-weight: 800;">${stop.name}</h4>
        <p style="margin: 0; font-size: 12px; color: #64748b;">Official Transit Pickup/Drop Stop</p>
      </div>
    `);
    stopMarkers[stop.id] = m;
  });
}

// 4. Next Bus Countdown & Active Trip Logic
function updateNextBusBanner() {
  if (!scheduleData) return;

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 3600000 * 5.5);
  const currentMins = istDate.getHours() * 60 + istDate.getMinutes();
  const currentSeconds = istDate.getSeconds();

  const isWeekend = istDate.getDay() === 0 || istDate.getDay() === 6;
  const currentSchedule = isWeekend ? scheduleData.weekend : scheduleData.weekday;

  let currentTrip = null;
  let nextTrip = null;

  for (const trip of currentSchedule) {
    if (currentMins >= trip.pickupMins && currentMins < trip.dropMins) {
      currentTrip = trip;
    }
    if (trip.pickupMins > currentMins && !nextTrip) {
      nextTrip = trip;
    }
  }

  if (!nextBusBadge || !badgeStatusText || !heroFromStop || !heroToStop || !heroPickupTime || !heroDropTime || !heroCountdownLabel || !heroCountdownClock) {
    return;
  }

  if (currentTrip) {
    // Active trip en route right now
    nextBusBadge.className = "next-bus-badge active-trip";
    badgeStatusText.textContent = "Bus En Route Now";
    heroFromStop.textContent = currentTrip.from;
    heroToStop.textContent = currentTrip.to;
    heroPickupTime.textContent = currentTrip.pickup;
    heroDropTime.textContent = currentTrip.drop;
    heroCountdownLabel.textContent = "DROPS IN";

    const remainingMins = currentTrip.dropMins - currentMins - 1;
    const remainingSecs = 60 - currentSeconds;
    const secStr = remainingSecs === 60 ? "00" : remainingSecs.toString().padStart(2, "0");
    heroCountdownClock.textContent = `${Math.max(0, remainingMins)}m ${secStr}s`;
  } else if (nextTrip) {
    // Upcoming trip today
    nextBusBadge.className = "next-bus-badge";
    badgeStatusText.textContent = "Next Scheduled Bus";
    heroFromStop.textContent = nextTrip.from;
    heroToStop.textContent = nextTrip.to;
    heroPickupTime.textContent = nextTrip.pickup;
    heroDropTime.textContent = nextTrip.drop;
    heroCountdownLabel.textContent = "DEPARTS IN";

    const diffMins = nextTrip.pickupMins - currentMins - 1;
    const remainingSecs = 60 - currentSeconds;
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const secStr = remainingSecs === 60 ? "00" : remainingSecs.toString().padStart(2, "0");

    if (hrs > 0) {
      heroCountdownClock.textContent = `${hrs}h ${mins}m`;
    } else {
      heroCountdownClock.textContent = `${Math.max(0, mins)}m ${secStr}s`;
    }
  } else {
    // Trips finished for today, next trip is tomorrow morning
    const tomorrowIsWeekend = (istDate.getDay() + 1) % 7 === 0 || (istDate.getDay() + 1) % 7 === 6;
    const tomorrowSchedule = tomorrowIsWeekend ? scheduleData.weekend : scheduleData.weekday;
    const firstTrip = tomorrowSchedule[0];

    nextBusBadge.className = "next-bus-badge";
    badgeStatusText.textContent = "First Bus Tomorrow";
    heroFromStop.textContent = firstTrip.from;
    heroToStop.textContent = firstTrip.to;
    heroPickupTime.textContent = firstTrip.pickup;
    heroDropTime.textContent = firstTrip.drop;
    heroCountdownLabel.textContent = "DEPARTS AT";
    heroCountdownClock.textContent = firstTrip.pickup;
  }
}

// Analytics Visit Logger (Counts website opens / page visits)
function logWebsiteVisit(pageName = "Bus Tracking") {
  try {
    fetch("/api/v1/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pageName }),
    }).catch(() => {});
  } catch (_) {}
}

// 5. Load Buses via HTTP & Setup Socket.IO
async function initTracker() {
  logWebsiteVisit("Bus Tracking");
  initMap();
  await loadSchedule();

  try {
    const res = await fetch("/api/v1/buses");
    const data = await res.json();
    if (data.buses) {
      updateBusesData(data.buses);
    }
  } catch (err) {
    console.error("Failed to load buses:", err);
  }

  connectSocket();

  // Tick countdown every second
  setInterval(updateNextBusCountdown, 1000);

  // Auto-fetch fresh GPS data every 3 seconds
  setInterval(() => refreshData(false), 3000);
}

function updateNextBusCountdown() {
  updateNextBusBanner();
}

function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    if (systemStatusPill) systemStatusPill.classList.add("live");
    if (statusText) statusText.textContent = window.innerWidth <= 768 ? "Live GPS" : "Live GPS Connected";
  });

  socket.on("disconnect", () => {
    if (systemStatusPill) systemStatusPill.classList.remove("live");
    if (statusText) statusText.textContent = window.innerWidth <= 768 ? "Reconnecting" : "Reconnecting feed...";
  });

  socket.on("buses:snapshot", (snapshot) => {
    updateBusesData(snapshot);
  });

  socket.on("bus:update", (updatedBus) => {
    const index = buses.findIndex((b) => b.id === updatedBus.id);
    if (index >= 0) {
      buses[index] = updatedBus;
    } else {
      buses.push(updatedBus);
    }
    updateBusesData(buses);
  });
}

// 6. Route Stops Coordinates & Transit Calculation
const ROUTE_STOPS = [
  { id: "campus",   name: "IIITDM Kurnool",    shortName: "IIITDM Kurnool",    lat: 15.761093, lng: 78.038980 },
  { id: "gpr",      name: "GPREC",              shortName: "GPREC",              lat: 15.774741, lng: 78.058717 },
  { id: "nandyal",  name: "Nandyal Check post", shortName: "Nandyal Check post", lat: 15.797984, lng: 78.052022 },
  { id: "ccamp",    name: "C-Camp",             shortName: "C-Camp",             lat: 15.807002, lng: 78.042479 },
  { id: "rajvihar", name: "Raj Vihar",          shortName: "Raj Vihar",          lat: 15.828735, lng: 78.038423 },
];

// STOP_BY_ID — quick lookup from stop key to ROUTE_STOPS entry
const STOP_BY_ID = {};
ROUTE_STOPS.forEach((s) => { STOP_BY_ID[s.id] = s; });

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Returns the IST current time in minutes-since-midnight
function getCurrentISTMinutes() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  return ist.getHours() * 60 + ist.getMinutes();
}

// Given the active trip (from scheduleData), build the ordered stop sequence
// that the bus will travel through for that trip.
// Most trips go directly point-to-point, but trips that pass through
// intermediate stops are inferred by the geographical order of ROUTE_STOPS
// between fromKey and toKey.
function getTripStopSequence(trip) {
  if (!trip) return ROUTE_STOPS.slice(); // fallback: full route

  const fromIdx = ROUTE_STOPS.findIndex((s) => s.id === trip.fromKey);
  const toIdx   = ROUTE_STOPS.findIndex((s) => s.id === trip.toKey);

  if (fromIdx === -1 || toIdx === -1) return ROUTE_STOPS.slice();

  // Slice in the correct direction
  if (fromIdx <= toIdx) {
    return ROUTE_STOPS.slice(fromIdx, toIdx + 1);       // going north (campus → city)
  } else {
    return ROUTE_STOPS.slice(toIdx, fromIdx + 1).reverse(); // going south (city → campus)
  }
}

// Get the active trip right now from scheduleData (client-side mirror of getStatus())
function getActiveTrip() {
  if (!scheduleData) return null;

  const currentMins = getCurrentISTMinutes();
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const isWeekend = ist.getDay() === 0 || ist.getDay() === 6;
  const schedule = isWeekend ? scheduleData.weekend : scheduleData.weekday;
  if (!schedule) return null;

  for (const trip of schedule) {
    if (currentMins >= trip.pickupMins && currentMins < trip.dropMins) {
      return trip;
    }
  }
  return null; // between trips
}

function calculateCurrentAndNextStop(bus) {
  if (!bus || !bus.live || typeof bus.live.lat !== "number" || typeof bus.live.lng !== "number") {
    return {
      currentStop: "IIITDM Kurnool",
      nextStop: "GPREC",
      isAtStop: true,
      distToNextStr: "",
    };
  }

  const busLat  = bus.live.lat;
  const busLng  = bus.live.lng;
  const heading = bus.live.heading;
  const speed   = bus.live.speedKmh || 0;

  // --- Step 1: Determine the relevant stop sequence from the active trip ---
  const activeTrip = getActiveTrip();
  const tripStops  = getTripStopSequence(activeTrip); // ordered: origin → destination

  // If only 1 stop in sequence (should never happen), fall back gracefully
  if (tripStops.length < 2) {
    return { currentStop: tripStops[0]?.shortName || "IIITDM Kurnool", nextStop: "—", isAtStop: true, distToNextStr: "" };
  }

  // --- Step 2: Calculate distance from bus to each stop in this trip's sequence ---
  const stopsWithDist = tripStops.map((stop, idx) => ({
    ...stop,
    seqIdx: idx, // position within this trip's sequence
    dist: getDistanceMeters(busLat, busLng, stop.lat, stop.lng),
  }));

  // Sort by distance to find the two nearest stops
  const sorted = stopsWithDist.slice().sort((a, b) => a.dist - b.dist);
  const closest      = sorted[0];
  const secondClosest = sorted[1];

  // --- Step 3: Determine direction along this trip's sequence ---
  // The trip has a canonical direction: sequence index 0 → last index.
  // Use heading if available; otherwise infer from proximity.
  const tripIsForward = true; // The sequence IS already in travel direction (from → to).

  // Within the sequence, "forward" always means increasing seqIdx.
  // We need to decide: is the bus moving forward (toward higher seqIdx) or backward?
  let movingForward = true;

  if (heading != null && !isNaN(heading) && activeTrip) {
    // If trip goes from campus (south) to city (north): north heading = forward
    const fromIdx = ROUTE_STOPS.findIndex((s) => s.id === activeTrip.fromKey);
    const toIdx   = ROUTE_STOPS.findIndex((s) => s.id === activeTrip.toKey);
    const goingNorth = toIdx > fromIdx;
    // North = heading 0°–90° or 270°–360°; South = 90°–270°
    const headingNorth = heading < 90 || heading > 270;
    movingForward = goingNorth ? headingNorth : !headingNorth;
  } else {
    // No heading — infer from which of the two nearest stops is "ahead" in sequence
    movingForward = secondClosest.seqIdx > closest.seqIdx;
  }

  // --- Step 4: At-stop detection ---
  const isAtStop = closest.dist <= 250 || (speed < 4 && closest.dist <= 400);

  let currentStopName;
  let nextSeqIdx;

  if (isAtStop) {
    currentStopName = closest.shortName;
    if (movingForward) {
      nextSeqIdx = Math.min(tripStops.length - 1, closest.seqIdx + 1);
    } else {
      nextSeqIdx = Math.max(0, closest.seqIdx - 1);
    }
    // Edge case: at destination terminal — next is undefined, bus has arrived
    if (closest.seqIdx === tripStops.length - 1 && movingForward) {
      nextSeqIdx = tripStops.length - 1; // stay at destination
    }
    if (closest.seqIdx === 0 && !movingForward) {
      nextSeqIdx = 0; // stay at origin
    }
  } else {
    // In transit between two stops
    const lo = Math.min(closest.seqIdx, secondClosest.seqIdx);
    const hi = Math.max(closest.seqIdx, secondClosest.seqIdx);
    if (movingForward) {
      currentStopName = tripStops[lo].shortName; // stop just passed
      nextSeqIdx = hi;                            // stop coming up
    } else {
      currentStopName = tripStops[hi].shortName; // stop just passed (going back)
      nextSeqIdx = lo;                            // stop coming up
    }
  }

  const nextStop = tripStops[nextSeqIdx];
  const distToNextMeters = getDistanceMeters(busLat, busLng, nextStop.lat, nextStop.lng);
  let distToNextStr = "";
  if (distToNextMeters < 1000) {
    distToNextStr = `${Math.round(distToNextMeters)}m`;
  } else {
    distToNextStr = `${(distToNextMeters / 1000).toFixed(1)} km`;
  }

  return {
    currentStop: currentStopName,
    nextStop: nextStop.shortName,
    isAtStop,
    distToNextStr,
    activeTrip, // expose for callers that want to know the trip context
  };
}

// 7. Process & Render Bus Data
function updateBusesData(busList) {
  buses = busList || [];
  renderBusCards();
  renderMapElements();

  if (selectedBusId) {
    renderStopsTimeline(selectedBusId);
    updateFloatingHUD(selectedBusId);
  } else if (buses.length > 0) {
    selectBus(buses[0].id, false);
  }
}

// 8. Render Sidebar Bus Cards
function renderBusCards() {
  if (!busCardsList) return;
  busCardsList.innerHTML = "";

  if (buses.length === 0) {
    busCardsList.innerHTML = '<div class="loading-state"><p>No buses registered.</p></div>';
    return;
  }

  buses.forEach((bus) => {
    const card = document.createElement("div");
    card.className = `bus-card ${selectedBusId === bus.id ? "active" : ""}`;
    card.style.setProperty("--bus-color", bus.color || "#1e3a8a");

    let statusClass = "offline";
    let statusText = "Offline";
    if (bus.online) {
      statusClass = "online";
      statusText = "Live GPS";
    } else if (bus.live) {
      statusClass = "stale";
      statusText = "Signal Stale";
    }

    const speed = bus.live && bus.live.speedKmh != null ? `${bus.live.speedKmh.toFixed(0)} km/h` : "—";
    const lastSeen = bus.live ? timeAgo(bus.live.updatedAt) : "No signal yet";

    const stopStatus = calculateCurrentAndNextStop(bus);
    const currentLabel = stopStatus.isAtStop ? "AT STOP" : "CURRENT STOP";
    const nextBadgeText = stopStatus.distToNextStr ? `NEXT STOP • ${stopStatus.distToNextStr}` : "NEXT STOP";

    card.innerHTML = `
      <div class="bus-card-top">
        <div class="bus-card-title-wrap">
          <div class="bus-indicator-icon">
            <i class="fa-solid fa-bus"></i>
          </div>
          <span class="bus-card-name">${bus.name}</span>
        </div>
        <span class="live-pill ${statusClass}">${statusText}</span>
      </div>

      <!-- Live Current Stop & Next Stop Dynamic Tracker -->
      <div class="bus-live-stops-tracker">
        <div class="stop-box-col current-box">
          <span class="stop-tag-label current-tag">
            <span class="stop-live-dot"></span> ${currentLabel}
          </span>
          <span class="stop-title-val" title="${stopStatus.currentStop}">${stopStatus.currentStop}</span>
        </div>

        <div class="stop-box-arrow">
          <i class="fa-solid fa-arrow-right-long"></i>
        </div>

        <div class="stop-box-col next-box">
          <span class="stop-tag-label next-tag">
            <i class="fa-solid fa-location-dot"></i> ${nextBadgeText}
          </span>
          <span class="stop-title-val next-val-text" title="${stopStatus.nextStop}">${stopStatus.nextStop}</span>
        </div>
      </div>

      <div class="bus-card-meta">
        <span class="meta-speed"><i class="fa-solid fa-gauge"></i> ${speed}</span>
        <span class="meta-time"><i class="fa-regular fa-clock"></i> ${lastSeen}</span>
      </div>
    `;

    card.onclick = () => selectBus(bus.id, true);
    busCardsList.appendChild(card);
  });
}

// 8. Select Bus & Update Map View (NO popup balloon on marker)
function selectBus(busId, fromUser = false) {
  selectedBusId = busId;
  renderBusCards();
  renderStopsTimeline(busId);
  updateFloatingHUD(busId);

  const bus = buses.find((b) => b.id === busId);
  if (!bus) return;

  if (bus.live) {
    map.flyTo([bus.live.lat, bus.live.lng], 15, { duration: 1 });
  }
}

// 9. Render Stops Timeline
function renderStopsTimeline(busId) {
  if (!timelineContainer) return;
  const bus = buses.find((b) => b.id === busId);
  if (!bus || !bus.stops || bus.stops.length === 0) {
    if (selectedRouteName) selectedRouteName.textContent = "5 Key Stops";
    return;
  }

  if (selectedRouteName) selectedRouteName.textContent = `${bus.stops.length} Key Stops in Kurnool`;
  timelineContainer.innerHTML = "";

  const stopStatus = calculateCurrentAndNextStop(bus);

  // Determine which stops are part of the active trip so we can dim the rest
  const activeTrip = stopStatus.activeTrip;
  const tripSeq    = getTripStopSequence(activeTrip); // ordered sequence for active trip
  const tripStopIds = new Set(tripSeq.map((s) => s.id));

  bus.stops.forEach((stop, idx) => {
    const item = document.createElement("div");
    const isCurrent = stopStatus.currentStop === stop.shortName || stopStatus.currentStop === stop.name;
    const isNext    = stopStatus.nextStop === stop.shortName || stopStatus.nextStop === stop.name;
    // Stops outside the active trip's sequence are dimmed (not removed — user can still see full route)
    const isInTrip  = !activeTrip || tripStopIds.has(stop.id);

    let extraClass = "";
    let badgeHtml = "";
    if (isCurrent) {
      extraClass = "is-current-stop";
      badgeHtml = `<span class="timeline-stop-pill current-pill"><span class="pill-dot"></span> ${stopStatus.isAtStop ? "At Stop" : "Current"}</span>`;
    } else if (isNext) {
      extraClass = "is-next-stop";
      badgeHtml = `<span class="timeline-stop-pill next-pill">Next ${stopStatus.distToNextStr ? `• ${stopStatus.distToNextStr}` : ""}</span>`;
    }

    item.className = `stop-item ${extraClass}${!isInTrip ? " stop-not-in-trip" : ""}`;
    item.innerHTML = `
      <div class="stop-bullet">${idx + 1}</div>
      <div class="stop-info-wrap">
        <span class="stop-name">${stop.name}</span>
        ${badgeHtml}
      </div>
      <i class="fa-solid fa-location-dot stop-pin-icon"></i>
    `;
    item.onclick = () => {
      map.flyTo([stop.lat, stop.lng], 16, { duration: 0.8 });
      if (stopMarkers[stop.id]) stopMarkers[stop.id].openPopup();
    };
    timelineContainer.appendChild(item);
  });
}

// 10. Update Floating HUD
function updateFloatingHUD(busId) {
  if (!floatingBusHud) return;
  const bus = buses.find((b) => b.id === busId);
  if (!bus) {
    floatingBusHud.classList.add("hidden");
    return;
  }

  floatingBusHud.classList.remove("hidden");
  if (hudBusName) hudBusName.textContent = bus.name;
  if (hudColorIndicator) hudColorIndicator.style.background = bus.color || "#3b82f6";

  if (bus.live && hudBusSub) {
    const speedStr = bus.live.speedKmh != null ? `${bus.live.speedKmh.toFixed(0)} km/h` : "Stationary";
    const statusStr = bus.online ? "🟢 Live GPS" : "🟡 Signal Stale";
    hudBusSub.textContent = `${statusStr} • ${speedStr} • ${timeAgo(bus.live.updatedAt)}`;
  } else if (hudBusSub) {
    hudBusSub.textContent = "Offline • Waiting for GPS signal";
  }
}

if (hudCloseBtn && floatingBusHud) {
  hudCloseBtn.onclick = () => {
    floatingBusHud.classList.add("hidden");
  };
}

// 11. Render Markers on Leaflet Map (CLEAN - NO popup above bus logo)
function renderMapElements() {
  buses.forEach((bus) => {
    const color = bus.color || "#1e3a8a";

    // Live Bus Marker
    if (bus.live) {
      const pos = [bus.live.lat, bus.live.lng];
      const speedText = bus.live.speedKmh != null ? `${bus.live.speedKmh.toFixed(0)} km/h` : "Live";
      const headingDeg = bus.live.heading != null ? bus.live.heading : 0;
      const headingArrowHtml = bus.live.heading != null
        ? `<div class="bus-heading-indicator" style="transform: rotate(${headingDeg}deg);"><div class="heading-arrow-tip"></div></div>`
        : "";

      const busHtml = `
        <div class="bus-vehicle-marker" style="--marker-color: ${color};">
          ${bus.online ? '<div class="bus-radar-pulse"></div>' : ""}
          ${headingArrowHtml}
          <div class="bus-logo-badge">
            <svg viewBox="0 0 64 64" class="bus-svg-symbol" width="36" height="36">
              <!-- Drop shadow -->
              <ellipse cx="32" cy="56" rx="18" ry="3.5" fill="rgba(0,0,0,0.2)"/>
              <!-- Mirrors -->
              <rect x="7" y="24" width="4" height="8" rx="2" fill="${color}" stroke="#FFFFFF" stroke-width="1"/>
              <rect x="53" y="24" width="4" height="8" rx="2" fill="${color}" stroke="#FFFFFF" stroke-width="1"/>
              <!-- Wheels -->
              <rect x="11" y="46" width="6" height="8" rx="3" fill="#0f172a"/>
              <rect x="47" y="46" width="6" height="8" rx="3" fill="#0f172a"/>
              <!-- Bus Main Body -->
              <rect x="11" y="10" width="42" height="40" rx="9" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
              <!-- Destination LED Screen -->
              <rect x="19" y="13" width="26" height="4" rx="2" fill="#FBBF24"/>
              <!-- Front Windshield -->
              <rect x="15" y="19" width="34" height="14" rx="3" fill="#E0F2FE" stroke="${color}" stroke-width="1"/>
              <line x1="32" y1="19" x2="32" y2="33" stroke="${color}" stroke-width="1.5"/>
              <!-- Grille -->
              <rect x="23" y="36" width="18" height="5" rx="2.5" fill="#0F172A"/>
              <line x1="27" y1="38.5" x2="37" y2="38.5" stroke="#94A3B8" stroke-width="1.5"/>
              <!-- Headlights -->
              <circle cx="17" cy="38.5" r="3.5" fill="#FEF08A" stroke="#EAB308" stroke-width="1"/>
              <circle cx="47" cy="38.5" r="3.5" fill="#FEF08A" stroke="#EAB308" stroke-width="1"/>
              <!-- Bumper -->
              <rect x="14" y="44" width="36" height="4" rx="2" fill="#334155" stroke="#FFFFFF" stroke-width="0.8"/>
            </svg>
          </div>
          <div class="bus-floating-tag">
            <span class="bus-tag-title">${bus.name}</span>
            <span class="bus-tag-speed">${speedText}</span>
          </div>
        </div>
      `;

      const busIcon = L.divIcon({
        className: "custom-bus-marker",
        html: busHtml,
        iconSize: [64, 76],
        iconAnchor: [32, 26],
      });

      if (!busMarkers[bus.id]) {
        const marker = L.marker(pos, { icon: busIcon }).addTo(map);
        marker.on("click", () => selectBus(bus.id, true));
        busMarkers[bus.id] = marker;
      } else {
        busMarkers[bus.id].setLatLng(pos);
        busMarkers[bus.id].setIcon(busIcon);
      }
      // Note: No popup is bound to the bus marker to keep map view unobstructed!
    }
  });
}

// 12. Refresh Data Action
async function refreshData(showFeedback = true) {
  if (btnRefresh) {
    btnRefresh.classList.add("refreshing");
    const icon = btnRefresh.querySelector("i");
    if (icon) icon.classList.add("fa-spin");
  }

  try {
    const [busesRes, scheduleRes] = await Promise.all([
      fetch("/api/v1/buses?_t=" + Date.now()),
      fetch("/api/v1/schedule?_t=" + Date.now()),
    ]);
    const busesData = await busesRes.json();
    scheduleData = await scheduleRes.json();

    if (busesData.buses) {
      updateBusesData(busesData.buses);
    }
    renderAllStopsOnMap();
    updateNextBusBanner();

    // Center on active bus if available
    if (selectedBusId) {
      const bus = buses.find((b) => b.id === selectedBusId);
      if (bus && bus.live) {
        map.flyTo([bus.live.lat, bus.live.lng], 15, { duration: 0.8 });
      }
    }
  } catch (err) {
    console.error("Failed to refresh data:", err);
  } finally {
    if (btnRefresh) {
      setTimeout(() => {
        btnRefresh.classList.remove("refreshing");
        const icon = btnRefresh.querySelector("i");
        if (icon) icon.classList.remove("fa-spin");
      }, 500);
    }
  }
}

// 13. Timetable Modal Management
async function openTimetable(e) {
  if (e) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (typeof e.stopPropagation === "function") e.stopPropagation();
  }
  logWebsiteVisit("Bus Timetable");
  const modal = document.getElementById("timetable-modal") || timetableModal;
  if (modal) {
    modal.style.setProperty("display", "flex", "important");
  }
  
  if (!scheduleData) {
    await loadSchedule();
  }
  renderTimetableModal();
}

function closeTimetable(e) {
  if (e) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (typeof e.stopPropagation === "function") e.stopPropagation();
  }
  const modal = document.getElementById("timetable-modal") || timetableModal;
  if (modal) {
    modal.style.setProperty("display", "none", "important");
  }
}

// 14. Scroll to About Us Footer
function scrollToAbout(e) {
  if (e) {
    if (typeof e.preventDefault === "function") e.preventDefault();
    if (typeof e.stopPropagation === "function") e.stopPropagation();
  }
  if (window.innerWidth <= 768) {
    expandSheet();
  } else {
    openSidebar();
  }
  const aboutSection = document.getElementById("about-us-section");
  if (aboutSection) {
    setTimeout(() => {
      aboutSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }
}

window.openTimetable = openTimetable;
window.closeTimetable = closeTimetable;
window.scrollToAbout = scrollToAbout;
window.openAboutModal = scrollToAbout;

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeTimetable(e);
  }
});

function renderTimetableModal() {
  const tbody = document.getElementById("timetable-tbody") || timetableTbody;
  const todayInfo = document.getElementById("modal-today-info") || modalTodayInfo;
  
  if (!scheduleData) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748b;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading timetable data...</td></tr>`;
    }
    return;
  }

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 3600000 * 5.5);
  const isWeekendToday = istDate.getDay() === 0 || istDate.getDay() === 6;
  const currentMins = istDate.getHours() * 60 + istDate.getMinutes();

  if (todayInfo) {
    todayInfo.textContent = `Today: ${istDate.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" })} (${isWeekendToday ? "Weekend/Holiday Schedule" : "Monday to Friday Schedule"})`;
  }

  let schedule = [];
  if (activeScheduleTab === "today") {
    schedule = isWeekendToday ? scheduleData.weekend : scheduleData.weekday;
  } else if (activeScheduleTab === "weekday") {
    schedule = scheduleData.weekday;
  } else {
    schedule = scheduleData.weekend;
  }

  schedule = schedule || [];

  // Filter direction
  let filtered = schedule;
  if (activeDirectionFilter === "from_campus") {
    filtered = schedule.filter((t) => t.direction === "from_campus");
  } else if (activeDirectionFilter === "to_campus") {
    filtered = schedule.filter((t) => t.direction === "to_campus");
  }

  if (!tbody) return;
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">No trips found for selected filter.</td></tr>`;
    return;
  }

  filtered.forEach((trip, idx) => {
    const isTodayTab = activeScheduleTab === "today" || (activeScheduleTab === "weekday" && !isWeekendToday) || (activeScheduleTab === "weekend" && isWeekendToday);
    const isActive = isTodayTab && currentMins >= trip.pickupMins && currentMins < trip.dropMins;
    const isNext = isTodayTab && !isActive && trip.pickupMins > currentMins && (!filtered.some((t) => t.pickupMins > currentMins && t.pickupMins < trip.pickupMins));

    let rowClass = "schedule-row";
    let statusPill = `<span style="color: #94a3b8; font-size: 0.75rem;">Scheduled</span>`;

    if (isActive) {
      rowClass += " row-active";
      statusPill = `<span class="live-pill online" style="font-size: 10px;">🟢 ACTIVE</span>`;
    } else if (isNext) {
      rowClass += " row-next";
      statusPill = `<span class="live-pill stale" style="font-size: 10px;">🟡 NEXT</span>`;
    }

    const tr = document.createElement("tr");
    tr.className = rowClass;
    tr.innerHTML = `
      <td style="color: #94a3b8; font-weight: 700;">${idx + 1}</td>
      <td><span class="stop-tag">${trip.from}</span></td>
      <td><span class="time-tag">${trip.pickup}</span></td>
      <td style="color: #3b82f6;"><i class="fa-solid fa-arrow-right"></i></td>
      <td><span class="stop-tag">${trip.to}</span></td>
      <td><span class="time-tag">${trip.drop}</span></td>
      <td>${statusPill}</td>
    `;

    // Click row to preview route on map
    tr.onclick = () => {
      highlightTripOnMap(trip);
      closeTimetable();
    };

    tbody.appendChild(tr);
  });
}

function highlightTripOnMap(trip) {
  if (!scheduleData || !scheduleData.stops) return;

  const fromStop = scheduleData.stops[trip.fromKey];
  const toStop = scheduleData.stops[trip.toKey];

  if (!fromStop || !toStop) return;

  const bounds = L.latLngBounds([
    [fromStop.lat, fromStop.lng],
    [toStop.lat, toStop.lng],
  ]);

  map.flyToBounds(bounds, { padding: [60, 60], duration: 1 });

  if (stopMarkers[fromStop.id]) {
    stopMarkers[fromStop.id].openPopup();
  }
}

// Timetable Event Listeners
if (openTimetableBtn) openTimetableBtn.addEventListener("click", openTimetable);
if (quickOpenTimetable) quickOpenTimetable.addEventListener("click", openTimetable);
if (closeTimetableModal) closeTimetableModal.addEventListener("click", closeTimetable);
if (btnDoneModal) btnDoneModal.addEventListener("click", closeTimetable);
if (timetableModal) {
  timetableModal.addEventListener("click", (e) => {
    if (e.target === timetableModal) closeTimetable();
  });
}

// About Event Listener
if (openAboutBtn) openAboutBtn.addEventListener("click", scrollToAbout);

modalTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    modalTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeScheduleTab = tab.dataset.schedule;
    renderTimetableModal();
  });
});

filterPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    filterPills.forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    activeDirectionFilter = pill.dataset.dir;
    renderTimetableModal();
  });
});

const sheetExpandIndicator = document.getElementById("sheet-expand-indicator");

// Sidebar / Mobile Bottom Sheet Control
function toggleSheetExpand() {
  if (busSidebar) {
    busSidebar.classList.toggle("expanded");
  }
}

function expandSheet() {
  if (busSidebar) {
    busSidebar.classList.add("expanded");
  }
}

function collapseSheet() {
  if (busSidebar) {
    busSidebar.classList.remove("expanded");
  }
}

function openSidebar() {
  if (busSidebar) busSidebar.classList.add("open");
  if (sidebarBackdrop) sidebarBackdrop.classList.add("active");
}

function closeSidebar() {
  if (busSidebar) {
    busSidebar.classList.remove("open");
    busSidebar.classList.remove("expanded");
  }
  if (sidebarBackdrop) sidebarBackdrop.classList.remove("active");
}

let touchStartY = 0;
let touchStartX = 0;
let isDraggingSheet = false;

if (busSidebar) {
  busSidebar.addEventListener("touchstart", (e) => {
    if (window.innerWidth > 768) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    isDraggingSheet = true;
  }, { passive: true });

  busSidebar.addEventListener("touchmove", (e) => {
    if (!isDraggingSheet || window.innerWidth > 768) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY;
    const isExpanded = busSidebar.classList.contains("expanded");

    // When collapsed, swiping UP expands the entire sheet
    if (!isExpanded && deltaY < -20) {
      expandSheet();
      isDraggingSheet = false;
    }
    // When expanded, at top of scroll, swiping DOWN collapses the sheet
    else if (isExpanded && busSidebar.scrollTop <= 5 && deltaY > 30) {
      collapseSheet();
      isDraggingSheet = false;
    }
  }, { passive: true });

  busSidebar.addEventListener("touchend", () => {
    isDraggingSheet = false;
  }, { passive: true });
}

if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      toggleSheetExpand();
    } else {
      if (busSidebar && busSidebar.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }
  });
}

if (sheetDragHandle) {
  sheetDragHandle.addEventListener("click", toggleSheetExpand);
}

if (sheetExpandIndicator) {
  sheetExpandIndicator.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSheetExpand();
  });
}

if (btnSidebarClose) {
  btnSidebarClose.addEventListener("click", closeSidebar);
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", closeSidebar);
}

// Quick Refresh Button Listener
if (btnRefresh) {
  btnRefresh.addEventListener("click", () => refreshData(true));
}

// Recenter on Bus
if (btnRecenterBus) {
  btnRecenterBus.addEventListener("click", () => {
    if (selectedBusId) {
      const bus = buses.find((b) => b.id === selectedBusId);
      if (bus && bus.live) {
        map.flyTo([bus.live.lat, bus.live.lng], 16, { duration: 0.8 });
        return;
      }
    }
    // Fallback: first bus or campus
    if (buses.length > 0 && buses[0].live) {
      map.flyTo([buses[0].live.lat, buses[0].live.lng], 16, { duration: 0.8 });
    } else {
      map.flyTo(IIITDM_CAMPUS, 15, { duration: 0.8 });
    }
  });
}

// User Geolocation
if (btnLocateUser) {
  btnLocateUser.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userCoords = [pos.coords.latitude, pos.coords.longitude];
        if (!userMarker) {
          userMarker = L.circleMarker(userCoords, {
            radius: 8,
            fillColor: "#3b82f6",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
          }).addTo(map).bindPopup("<b>You are here</b>");
        } else {
          userMarker.setLatLng(userCoords);
        }
        map.flyTo(userCoords, 16, { duration: 0.8 });
      },
      (err) => alert("Could not fetch your location: " + err.message)
    );
  });
}

function timeAgo(timestamp) {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - Number(timestamp)) / 1000);
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

window.addEventListener("DOMContentLoaded", initTracker);
