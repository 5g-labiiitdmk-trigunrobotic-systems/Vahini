// =========================================================
// Admin Dashboard & Analytics Controller
// IIITDMK Vaahini Campus Transit & Usage Portal
// =========================================================

const AUTH_TOKEN_KEY = "campus_bus_admin_token";

// State
let adminToken = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || null;
let selectedDateStr = getTodayDateStr();
let activeTab = "dashboard";
let currentDashboardData = null;

// Tab metadata
const TAB_CONFIG = {
  dashboard: {
    title: "Dashboard Overview",
    sub: "Single Fleet (BUS-01) & Website Traffic Analytics",
  },
  "bus-logs": {
    title: "Bus Daily Logs",
    sub: "Single Fleet (BUS-01) Daily Operation & Milestone Records",
  },
  "website-analytics": {
    title: "Website Usage & Analytics",
    sub: "Hourly Page Opens & Traffic Distribution",
  },
  statistics: {
    title: "All-Time Fleet Statistics",
    sub: "Cumulative and Average Operational Metrics",
  },
  "activity-logs": {
    title: "Admin Activity Audit Logs",
    sub: "Security and Operation Modification Trail",
  },
  vehicles: {
    title: "Fleet Vehicles",
    sub: "Add, view and manage registered vehicles",
  },
};

// =========================================================
// Helper Utilities
// =========================================================

function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  try {
    const parts = dateStr.split("-");
    const d = new Date(parts[0], Number(parts[1]) - 1, parts[2]);
    const isToday = dateStr === getTodayDateStr();
    const isYesterday = dateStr === getYesterdayDateStr();
    const prefix = isToday ? "Today, " : isYesterday ? "Yesterday, " : "";
    return prefix + d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch (err) {
    return dateStr;
  }
}

function formatTimeDisplay(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch (err) {
    return isoString;
  }
}

function formatFullDateTime(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    const datePart = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const timePart = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${datePart} at ${timePart}`;
  } catch (err) {
    return isoString;
  }
}

// Authenticated API Fetch Wrapper
async function fetchWithAuth(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    handleAdminLogout();
    throw new Error("Session expired or unauthorized");
  }
  return res;
}

// =========================================================
// Authentication Handling
// =========================================================

function checkAuthState() {
  const authOverlay = document.getElementById("auth-overlay");
  const adminApp = document.getElementById("admin-app");

  if (adminToken) {
    if (authOverlay) authOverlay.style.display = "none";
    if (adminApp) adminApp.style.display = "flex";
    initDashboard();
  } else {
    if (authOverlay) authOverlay.style.display = "flex";
    if (adminApp) adminApp.style.display = "none";
  }
}

async function handleAdminLogin(e) {
  if (e) e.preventDefault();
  const passwordInput = document.getElementById("admin-password-input");
  const errorMsg = document.getElementById("auth-error-msg");
  const btnSubmit = document.getElementById("btn-login-submit");

  const password = passwordInput ? passwordInput.value.trim() : "";
  if (!password) return;

  if (errorMsg) errorMsg.style.display = "none";
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
  }

  try {
    const res = await fetch("/api/v1/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();

    if (data.ok && data.token) {
      adminToken = data.token;
      localStorage.setItem(AUTH_TOKEN_KEY, adminToken);
      checkAuthState();
    } else {
      if (errorMsg) {
        errorMsg.textContent = data.error || "Invalid password. Default is admin123";
        errorMsg.style.display = "block";
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = "Unable to connect to authentication server.";
      errorMsg.style.display = "block";
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In to Dashboard';
    }
  }
}

function handleAdminLogout() {
  adminToken = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  checkAuthState();
}

function togglePasswordVisibility() {
  const input = document.getElementById("admin-password-input");
  const eye = document.getElementById("eye-icon");
  if (!input || !eye) return;
  if (input.type === "password") {
    input.type = "text";
    eye.className = "fa-solid fa-eye-slash";
  } else {
    input.type = "password";
    eye.className = "fa-solid fa-eye";
  }
}

// =========================================================
// Navigation & Date Filter
// =========================================================

function switchTab(tabId) {
  activeTab = tabId;

  // Update nav buttons
  document.querySelectorAll(".sidebar-nav .nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Update panes
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-pane-${tabId}`);
  });

  // Update topbar header title
  const config = TAB_CONFIG[tabId] || TAB_CONFIG.dashboard;
  const titleEl = document.getElementById("current-tab-title");
  const subEl = document.getElementById("current-tab-sub");
  if (titleEl) titleEl.textContent = config.title;
  if (subEl) subEl.textContent = config.sub;

  // Close mobile sidebar if open
  closeMobileSidebar();

  // Load relevant tab data
  loadCurrentTabData();
}

function setDateFilter(typeOrDateStr) {
  if (typeOrDateStr === "today") {
    selectedDateStr = getTodayDateStr();
  } else if (typeOrDateStr === "yesterday") {
    selectedDateStr = getYesterdayDateStr();
  } else {
    selectedDateStr = typeOrDateStr;
  }

  const datePicker = document.getElementById("admin-date-picker");
  if (datePicker) datePicker.value = selectedDateStr;

  updateDatePillClasses();
  refreshAdminData();
}

function updateDatePillClasses() {
  const pillToday = document.getElementById("pill-today");
  const pillYest = document.getElementById("pill-yesterday");

  if (pillToday) pillToday.classList.toggle("active", selectedDateStr === getTodayDateStr());
  if (pillYest) pillYest.classList.toggle("active", selectedDateStr === getYesterdayDateStr());
}

// =========================================================
// Data Loading & Renderers
// =========================================================

async function refreshAdminData(animateIcon = false) {
  const refreshIcon = document.getElementById("refresh-icon");
  if (animateIcon && refreshIcon) refreshIcon.classList.add("fa-spin");

  try {
    await Promise.all([
      loadDashboardStats(),
      loadDailyLogs(),
      loadWebsiteAnalytics(),
      loadStatisticsOverview(),
      loadActivityLogs(),
    ]);
  } catch (err) {
    console.error("Refresh error:", err);
  } finally {
    if (refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove("fa-spin"), 400);
    }
  }
}

function loadCurrentTabData() {
  if (activeTab === "dashboard") loadDashboardStats();
  else if (activeTab === "bus-logs") loadDailyLogs();
  else if (activeTab === "website-analytics") loadWebsiteAnalytics();
  else if (activeTab === "statistics") loadStatisticsOverview();
  else if (activeTab === "activity-logs") loadActivityLogs();
  else if (activeTab === "vehicles") loadVehicles();
}

// 1. Dashboard Tab Data
async function loadDashboardStats() {
  try {
    const res = await fetchWithAuth(`/api/v1/admin/stats?date=${selectedDateStr}&_t=${Date.now()}`);
    const data = await res.json();
    currentDashboardData = data;

    // Date banner
    const bannerDate = document.getElementById("dash-formatted-date");
    if (bannerDate) bannerDate.textContent = formatDateDisplay(selectedDateStr);

    // Bus Stats
    const bus = data.bus || {};
    const statusBadge = document.getElementById("dash-bus-status-badge");
    if (statusBadge) {
      statusBadge.textContent = bus.status || "Not Started";
      statusBadge.className = `status-badge ${String(bus.status || "").toLowerCase().replace(" ", "-")}`;
    }

    const distEl = document.getElementById("dash-bus-distance");
    if (distEl) distEl.textContent = bus.distanceKm != null ? bus.distanceKm.toFixed(1) : "0.0";

    const optimeEl = document.getElementById("dash-bus-optime");
    if (optimeEl) optimeEl.textContent = bus.operatingTime || "0m";

    const startEl = document.getElementById("dash-bus-start");
    if (startEl) startEl.textContent = bus.startTime || "06:30 AM";

    const endEl = document.getElementById("dash-bus-end");
    if (endEl) endEl.textContent = bus.endTime || "—";

    const stopsEl = document.getElementById("dash-bus-stops");
    if (stopsEl) stopsEl.textContent = bus.stopsVisitedCount || 5;

    const locEl = document.getElementById("dash-bus-location");
    if (locEl) locEl.textContent = bus.currentLocation || "IIITDM Kurnool Campus";

    const speedEl = document.getElementById("dash-bus-speed");
    if (speedEl) speedEl.textContent = `Speed: ${bus.speedKmh != null ? bus.speedKmh.toFixed(0) : 0} km/h • ${bus.online ? "Online GPS" : "Standby"}`;

    // Website Stats Summary
    const web = data.website || {};
    const opensEl = document.getElementById("dash-web-opens");
    if (opensEl) opensEl.textContent = (web.totalOpens || 0).toLocaleString();

    const peakEl = document.getElementById("dash-web-peakhour");
    if (peakEl) peakEl.textContent = web.peakHour || "None";

    const peakCountEl = document.getElementById("dash-web-peakcount");
    if (peakCountEl) peakCountEl.textContent = `${web.peakHourCount || 0} opens during peak`;

    const topPageEl = document.getElementById("dash-web-top-page");
    if (topPageEl) topPageEl.textContent = web.mostVisitedPage || "Bus Tracking";

    // Render Mini Hourly Chart
    renderHourlyChart("dash-hourly-chart", web.hourlyOpens || [], web.peakHour);
  } catch (err) {
    console.error("Failed to load dashboard stats:", err);
  }
}

// 2. Bus Daily Logs Tab
async function loadDailyLogs() {
  try {
    const res = await fetchWithAuth(`/api/v1/admin/bus/daily-logs?_t=${Date.now()}`);
    const data = await res.json();
    const logs = data.logs || [];

    const dateDisplay = document.getElementById("logs-selected-date-str");
    if (dateDisplay) dateDisplay.textContent = formatDateDisplay(selectedDateStr);

    const tbody = document.getElementById("daily-logs-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 24px; color: var(--text-muted);">No daily logs recorded yet.</td></tr>';
      return;
    }

    logs.forEach((log) => {
      const isSelected = log.dateStr === selectedDateStr;
      const tr = document.createElement("tr");
      if (isSelected) {
        tr.style.backgroundColor = "rgba(37, 99, 235, 0.1)";
      }

      const statusClass = String(log.status || "not-started").toLowerCase().replace(" ", "-");
      const mins = Number(log.operatingTimeMins) || 0;
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      const opStr = hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;

      tr.innerHTML = `
        <td><strong>${log.dateStr}</strong> ${isSelected ? '<span class="status-badge" style="padding: 2px 6px; font-size: 10px;">Selected</span>' : ""}</td>
        <td><span class="status-badge ${statusClass}">${log.status || "Not Started"}</span></td>
        <td>${log.startTime || "—"}</td>
        <td>${log.endTime || "—"}</td>
        <td><strong>${Number(log.totalDistanceKm || 0).toFixed(1)} km</strong></td>
        <td>${opStr}</td>
        <td>${log.startingLocation || "IIITDM Kurnool Campus"}</td>
        <td>${log.endingLocation || "Raj Vihar"}</td>
        <td><span style="font-size: 11px; color: var(--accent-cyan);">${log.currentLocation || "—"}</span></td>
        <td>${log.stopsVisitedCount != null ? log.stopsVisitedCount : 0} stops</td>
        <td>
          <button class="btn-sm btn-outline" onclick="openEditDailyLogModal('${log.dateStr}')">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Update selected status badge in banner
    const selectedLog = logs.find((l) => l.dateStr === selectedDateStr);
    const bannerBadge = document.getElementById("logs-selected-status-badge");
    if (bannerBadge && selectedLog) {
      bannerBadge.textContent = selectedLog.status;
      bannerBadge.className = `status-badge ${String(selectedLog.status).toLowerCase().replace(" ", "-")}`;
    }
  } catch (err) {
    console.error("Failed to load daily logs:", err);
  }
}

// 3. Website Analytics Tab
async function loadWebsiteAnalytics() {
  try {
    const res = await fetchWithAuth(`/api/v1/admin/analytics/website?date=${selectedDateStr}&_t=${Date.now()}`);
    const data = await res.json();

    const dateDisplay = document.getElementById("analytics-date-display");
    if (dateDisplay) dateDisplay.textContent = `Date: ${formatDateDisplay(selectedDateStr)}`;

    const totalOpensEl = document.getElementById("analytics-total-opens");
    if (totalOpensEl) totalOpensEl.textContent = (data.totalOpens || 0).toLocaleString();

    const peakHourEl = document.getElementById("analytics-peak-hour");
    if (peakHourEl) peakHourEl.textContent = data.peakHour || "None";

    const peakCountEl = document.getElementById("analytics-peak-count");
    if (peakCountEl) peakCountEl.textContent = `${data.peakHourCount || 0} Opens recorded`;

    const topSectionEl = document.getElementById("analytics-top-section");
    if (topSectionEl) topSectionEl.textContent = data.mostVisitedPage || "Bus Tracking";

    // Full 24-hour chart
    renderHourlyChart("analytics-full-chart", data.hourlyOpens || [], data.peakHour);

    // Page Breakdown
    const breakdownEl = document.getElementById("analytics-page-breakdown");
    if (breakdownEl) {
      breakdownEl.innerHTML = "";
      const breakdown = data.pageBreakdown || {};
      const entries = Object.entries(breakdown);

      if (entries.length === 0) {
        breakdownEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No page views recorded for this date.</div>';
      } else {
        entries.forEach(([pageName, count]) => {
          const row = document.createElement("div");
          row.className = "breakdown-row";
          row.innerHTML = `
            <span class="breakdown-name"><i class="fa-solid fa-file-lines text-blue"></i> ${pageName}</span>
            <div class="breakdown-count-wrap">
              <span class="breakdown-count">${count.toLocaleString()} opens</span>
            </div>
          `;
          breakdownEl.appendChild(row);
        });
      }
    }
  } catch (err) {
    console.error("Failed to load website analytics:", err);
  }
}

// 4. Statistics Tab (All-Time Cumulative)
async function loadStatisticsOverview() {
  try {
    const res = await fetchWithAuth(`/api/v1/admin/analytics/overview?_t=${Date.now()}`);
    const data = await res.json();

    const totalDist = document.getElementById("stats-total-dist");
    if (totalDist) totalDist.textContent = (data.totalDistanceKm || 0).toFixed(1);

    const avgDist = document.getElementById("stats-avg-dist");
    if (avgDist) avgDist.textContent = (data.averageDailyDistanceKm || 0).toFixed(1);

    const totalHours = document.getElementById("stats-total-hours");
    if (totalHours) totalHours.textContent = (data.totalOperatingHours || 0).toFixed(1);

    const totalOpens = document.getElementById("stats-total-opens");
    if (totalOpens) totalOpens.textContent = (data.totalWebsiteOpens || 0).toLocaleString();

    const avgOpens = document.getElementById("stats-avg-opens");
    if (avgOpens) avgOpens.textContent = (data.averageDailyWebsiteOpens || 0).toLocaleString();

    const peakDay = document.getElementById("stats-peak-day");
    if (peakDay) peakDay.textContent = data.peakTrafficDate || "—";

    const peakDayOpens = document.getElementById("stats-peak-day-opens");
    if (peakDayOpens) peakDayOpens.textContent = `${(data.peakTrafficOpens || 0).toLocaleString()} opens recorded`;
  } catch (err) {
    console.error("Failed to load statistics overview:", err);
  }
}

// 5. Activity Logs Tab
async function loadActivityLogs() {
  try {
    const res = await fetchWithAuth(`/api/v1/admin/activity-logs?_t=${Date.now()}`);
    const data = await res.json();
    const activities = data.activities || [];

    const tbody = document.getElementById("activity-logs-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (activities.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 24px; color: var(--text-muted);">No activity logs recorded.</td></tr>';
      return;
    }

    activities.forEach((act) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color: var(--accent-cyan);">${formatTimeDisplay(act.timestamp)}</strong><br><span style="font-size: 11px; color: var(--text-muted);">${formatFullDateTime(act.timestamp)}</span></td>
        <td><strong>${act.action}</strong></td>
        <td>${act.details || "—"}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Failed to load activity logs:", err);
  }
}

// =========================================================
// Hourly Chart Renderer (HTML/CSS Bar Chart)
// =========================================================

function renderHourlyChart(containerId, hourlyData, peakHourStr) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!hourlyData || hourlyData.length === 0) {
    container.innerHTML = '<div style="margin: auto; color: var(--text-muted); font-size: 0.85rem;">No hourly open data recorded for this date.</div>';
    return;
  }

  // Find max count for scaling
  let maxCount = 0;
  hourlyData.forEach((item) => {
    if (item.count > maxCount) maxCount = item.count;
  });
  if (maxCount === 0) maxCount = 1;

  hourlyData.forEach((item) => {
    const heightPercent = Math.max(4, Math.round((item.count / maxCount) * 100));
    const isPeak = item.count === maxCount && maxCount > 0;

    const col = document.createElement("div");
    col.className = "chart-col";
    col.innerHTML = `
      <div class="chart-tooltip">
        ${item.label}: <strong>${item.count} opens</strong>
      </div>
      <div class="chart-bar-wrap">
        <div class="chart-bar ${isPeak ? "is-peak" : ""}" style="height: ${heightPercent}%;"></div>
      </div>
      <div class="chart-col-label">${item.hour % 3 === 0 || item.hour === 23 ? item.label.replace(" ", "") : "•"}</div>
    `;
    container.appendChild(col);
  });
}

// =========================================================
// Modal Dialog Handlers: Daily Bus Log Editor
// =========================================================

async function openEditDailyLogModal(targetDate) {
  const dateStr = targetDate || selectedDateStr;
  const modal = document.getElementById("edit-log-modal");
  if (!modal) return;

  // Prefill modal fields
  document.getElementById("modal-log-date").value = dateStr;

  try {
    const res = await fetchWithAuth(`/api/v1/admin/bus/daily-logs/${dateStr}`);
    const log = await res.json();

    document.getElementById("modal-log-status").value = log.status || "Active";
    document.getElementById("modal-log-start").value = log.startTime && log.startTime !== "—" ? log.startTime : "";
    document.getElementById("modal-log-end").value = log.endTime && log.endTime !== "—" ? log.endTime : "";
    document.getElementById("modal-log-distance").value = log.totalDistanceKm != null ? log.totalDistanceKm : 0.0;
    document.getElementById("modal-log-optime").value = log.operatingTimeMins != null ? log.operatingTimeMins : 0;
    document.getElementById("modal-log-starting").value = log.startingLocation || "IIITDM Kurnool Campus";
    document.getElementById("modal-log-ending").value = log.endingLocation || "Raj Vihar";
    document.getElementById("modal-log-current").value = log.currentLocation || "";
    document.getElementById("modal-log-stops").value = log.stopsVisitedCount != null ? log.stopsVisitedCount : 0;
  } catch (err) {
    console.warn("Could not prefill daily log modal:", err);
  }

  modal.style.display = "flex";
}

function closeEditDailyLogModal() {
  const modal = document.getElementById("edit-log-modal");
  if (modal) modal.style.display = "none";
}

async function handleSaveDailyLog(e) {
  if (e) e.preventDefault();
  const dateStr = document.getElementById("modal-log-date").value;
  const status = document.getElementById("modal-log-status").value;
  const startTime = document.getElementById("modal-log-start").value;
  const endTime = document.getElementById("modal-log-end").value;
  const totalDistanceKm = Number(document.getElementById("modal-log-distance").value) || 0;
  const operatingTimeMins = Number(document.getElementById("modal-log-optime").value) || 0;
  const startingLocation = document.getElementById("modal-log-starting").value;
  const endingLocation = document.getElementById("modal-log-ending").value;
  const currentLocation = document.getElementById("modal-log-current").value;
  const stopsVisitedCount = Number(document.getElementById("modal-log-stops").value) || 5;

  const btnSave = document.getElementById("btn-save-log");
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
  }

  try {
    const res = await fetchWithAuth(`/api/v1/admin/bus/daily-logs/${dateStr}`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        startTime,
        endTime,
        totalDistanceKm,
        operatingTimeMins,
        startingLocation,
        endingLocation,
        currentLocation,
        stopsVisitedCount,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      closeEditDailyLogModal();
      refreshAdminData(true);
    } else {
      alert("Failed to save log: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("Error saving daily log: " + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Daily Log';
    }
  }
}

// =========================================================
// Modal Dialog Handlers: Add Audit Note
// =========================================================

function openAddAuditModal() {
  const modal = document.getElementById("add-audit-modal");
  if (modal) modal.style.display = "flex";
}

function closeAddAuditModal() {
  const modal = document.getElementById("add-audit-modal");
  if (modal) modal.style.display = "none";
}

async function handleSaveAuditNote(e) {
  if (e) e.preventDefault();
  const action = document.getElementById("modal-audit-action").value.trim();
  const details = document.getElementById("modal-audit-details").value.trim();

  if (!action) return;

  try {
    const res = await fetchWithAuth("/api/v1/admin/activity-logs", {
      method: "POST",
      body: JSON.stringify({ action, details }),
    });
    const data = await res.json();
    if (data.ok) {
      closeAddAuditModal();
      loadActivityLogs();
    }
  } catch (err) {
    alert("Failed to record activity note: " + err.message);
  }
}

// =========================================================
// Vehicles Tab
// =========================================================

async function loadVehicles() {
  const tbody = document.getElementById("vehicles-tbody");
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading vehicles...</td></tr>';

  try {
    const res = await fetchWithAuth(`/api/v1/buses?_t=${Date.now()}`);
    const data = await res.json();
    const buses = data.buses || [];

    tbody.innerHTML = "";

    if (buses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No vehicles registered yet.</td></tr>';
      return;
    }

    buses.forEach((bus) => {
      const tr = document.createElement("tr");
      const stopsCount = (bus.stops || []).length;
      const onlineClass = bus.online ? "completed" : "not-started";
      const onlineLabel = bus.online ? "Online" : "Offline";

      tr.innerHTML = `
        <td><strong style="color:var(--accent-cyan);">${bus.id}</strong></td>
        <td><strong>${bus.name}</strong></td>
        <td style="font-size:12px;color:var(--text-muted);">${bus.route || "—"}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span style="width:16px;height:16px;border-radius:50%;background:${bus.color || '#1e3a8a'};display:inline-block;border:2px solid rgba(255,255,255,0.2);"></span>
            ${bus.color || "#1e3a8a"}
          </span>
        </td>
        <td>${stopsCount} stop${stopsCount !== 1 ? "s" : ""}</td>
        <td><span class="status-badge ${onlineClass}">${onlineLabel}</span></td>
        <td>
          <button class="btn-sm btn-outline" onclick="confirmDeleteVehicle('${bus.id}', '${bus.name.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--accent-red);">Failed to load vehicles.</td></tr>';
    console.error("loadVehicles error:", err);
  }
}

function openAddVehicleModal() {
  const modal = document.getElementById("add-vehicle-modal");
  if (!modal) return;
  // Reset form
  document.getElementById("add-vehicle-form").reset();
  document.getElementById("modal-vehicle-color").value = "#0ea5e9";
  document.getElementById("modal-vehicle-color-hex").value = "#0ea5e9";
  modal.style.display = "flex";
}

function closeAddVehicleModal() {
  const modal = document.getElementById("add-vehicle-modal");
  if (modal) modal.style.display = "none";
}

async function handleSaveVehicle(e) {
  if (e) e.preventDefault();

  const id = document.getElementById("modal-vehicle-id").value.trim().toUpperCase();
  const name = document.getElementById("modal-vehicle-name").value.trim();
  const route = document.getElementById("modal-vehicle-route").value.trim();
  const color = document.getElementById("modal-vehicle-color-hex").value.trim() || "#0ea5e9";
  const status = document.getElementById("modal-vehicle-status").value;
  const stopsRaw = document.getElementById("modal-vehicle-stops").value.trim();

  if (!id || !name || !route) return;

  // Parse stops
  const stops = [];
  if (stopsRaw) {
    stopsRaw.split("\n").forEach((line) => {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length >= 4) {
        const stopId = parts[0];
        const stopName = parts[1];
        const lat = parseFloat(parts[2]);
        const lng = parseFloat(parts[3]);
        if (stopId && stopName && !isNaN(lat) && !isNaN(lng)) {
          stops.push({ id: stopId, name: stopName, lat, lng });
        }
      }
    });
  }

  const btnSave = document.getElementById("btn-save-vehicle");
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
  }

  try {
    const res = await fetchWithAuth("/api/v1/admin/vehicles", {
      method: "POST",
      body: JSON.stringify({ id, name, route, color, status, stops }),
    });

    const data = await res.json();
    if (data.ok) {
      closeAddVehicleModal();
      await loadVehicles();
      await store.recordAdminActivity?.({
        action: "Vehicle added",
        details: `Added vehicle ${id} (${name})`,
      });
    } else {
      alert("Failed to add vehicle: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("Error saving vehicle: " + err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Vehicle';
    }
  }
}

async function confirmDeleteVehicle(vehicleId, vehicleName) {
  if (!confirm(`Delete vehicle "${vehicleName}" (${vehicleId})?\n\nThis will also remove its stops and GPS telemetry. This action cannot be undone.`)) return;

  try {
    const res = await fetchWithAuth(`/api/v1/admin/vehicles/${vehicleId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      loadVehicles();
    } else {
      alert("Failed to delete vehicle: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("Error deleting vehicle: " + err.message);
  }
}

// Sync color picker ↔ hex text input
document.addEventListener("DOMContentLoaded", () => {
  const colorPicker = document.getElementById("modal-vehicle-color");
  const colorHex = document.getElementById("modal-vehicle-color-hex");
  if (colorPicker && colorHex) {
    colorPicker.addEventListener("input", () => {
      colorHex.value = colorPicker.value;
    });
  }
});

// =========================================================
// Mobile Sidebar Controls
// =========================================================

function toggleMobileSidebar() {
  const sidebar = document.getElementById("admin-sidebar");
  const backdrop = document.getElementById("admin-backdrop");
  if (sidebar) sidebar.classList.toggle("open");
  if (backdrop) backdrop.classList.toggle("active");
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("admin-sidebar");
  const backdrop = document.getElementById("admin-backdrop");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("active");
}

// =========================================================
// Initialization
// =========================================================

function initDashboard() {
  // Set date picker value
  const datePicker = document.getElementById("admin-date-picker");
  if (datePicker) {
    datePicker.value = selectedDateStr;
    datePicker.addEventListener("change", (e) => {
      setDateFilter(e.target.value);
    });
  }

  // Sidebar navigation click listeners
  document.querySelectorAll(".sidebar-nav .nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Mobile menu buttons
  const btnMobileMenu = document.getElementById("btn-mobile-menu");
  if (btnMobileMenu) btnMobileMenu.addEventListener("click", toggleMobileSidebar);

  const btnCloseSidebar = document.getElementById("btn-close-sidebar");
  if (btnCloseSidebar) btnCloseSidebar.addEventListener("click", closeMobileSidebar);

  const backdrop = document.getElementById("admin-backdrop");
  if (backdrop) backdrop.addEventListener("click", closeMobileSidebar);

  // Initial data load
  refreshAdminData();

  // Auto-refresh every 15 seconds while dashboard is open
  setInterval(() => {
    if (adminToken) {
      loadCurrentTabData();
    }
  }, 15000);
}

// Window Global Exports for HTML onsubmit/onclick
window.handleAdminLogin = handleAdminLogin;
window.handleAdminLogout = handleAdminLogout;
window.togglePasswordVisibility = togglePasswordVisibility;
window.switchTab = switchTab;
window.setDateFilter = setDateFilter;
window.refreshAdminData = refreshAdminData;
window.openEditDailyLogModal = openEditDailyLogModal;
window.closeEditDailyLogModal = closeEditDailyLogModal;
window.handleSaveDailyLog = handleSaveDailyLog;
window.openAddAuditModal = openAddAuditModal;
window.closeAddAuditModal = closeAddAuditModal;
window.handleSaveAuditNote = handleSaveAuditNote;

window.loadVehicles = loadVehicles;
window.openAddVehicleModal = openAddVehicleModal;
window.closeAddVehicleModal = closeAddVehicleModal;
window.handleSaveVehicle = handleSaveVehicle;
window.confirmDeleteVehicle = confirmDeleteVehicle;

window.addEventListener("DOMContentLoaded", checkAuthState);
