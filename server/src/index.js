const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const config = require("./config");
const { createStore } = require("./store");
const schedule = require("./schedule");
const { createOnelapService } = require("./integrations/onelap");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});
const store = createStore();
const onelap = createOnelapService({ config, store, io });

app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "../public")));

// API Routes (All Public - No Authentication Required)
app.get("/api/v1/health", (_req, res) => {
  res.json({
    ok: true,
    campus: config.campus,
    onelap: {
      enabled: config.onelap.enabled,
      status: onelap.getStatus(),
    },
  });
});

app.get("/api/v1/integrations/onelap/status", (_req, res) => {
  res.json(onelap.getStatus());
});

app.get("/api/v1/campus", (_req, res) => {
  res.json(config.campus);
});


// Schedule API
app.get("/api/v1/schedule", (_req, res) => {
  const status = schedule.getStatus();
  res.json({
    stops: schedule.STOPS,
    weekday: schedule.WEEKDAY_SCHEDULE,
    weekend: schedule.WEEKEND_SCHEDULE,
    status,
  });
});

app.get("/api/v1/buses", async (_req, res) => {
  try {
    const buses = await store.listBuses();
    res.json({ buses });
  } catch (err) {
    console.error("Error listing buses:", err);
    res.status(500).json({ error: "Failed to load buses" });
  }
});

app.get("/api/v1/buses/:id", async (req, res) => {
  try {
    const bus = await store.getBus(req.params.id);
    if (!bus) return res.status(404).json({ error: "Bus not found" });
    res.json(bus);
  } catch (err) {
    console.error("Error fetching bus:", err);
    res.status(500).json({ error: "Failed to load bus" });
  }
});

// Telemetry endpoint for Hardware GPS modules and Tracker Ingestion
app.post("/api/v1/telemetry", async (req, res) => {
  try {
    const { busId, lat, lng, speedKmh, heading, satellites, accuracyMeters, recordedAt } = req.body || {};
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!busId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "busId, lat, and lng are required" });
    }
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ error: "Invalid GPS coordinates" });
    }

    const result = await store.updatePosition({
      busId: String(busId).trim(),
      lat: latitude,
      lng: longitude,
      speedKmh: speedKmh == null ? null : Number(speedKmh),
      heading: heading == null ? null : Number(heading),
      satellites: satellites == null ? null : Number(satellites),
      accuracyMeters: accuracyMeters == null ? null : Number(accuracyMeters),
      recordedAt: recordedAt || new Date().toISOString(),
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    // Broadcast live update to all connected web clients in real-time
    io.emit("bus:update", result.bus);
    res.json({ ok: true, bus: result.bus });
  } catch (err) {
    console.error("Telemetry error:", err);
    res.status(500).json({ error: "Failed to update location" });
  }
});

// Public Website Visit Tracking Ping
app.post("/api/v1/analytics/visit", async (req, res) => {
  try {
    const page = req.body?.page || "Bus Tracking";
    const visit = await store.recordWebsiteVisit({ page });
    res.json({ ok: true, visitId: visit.id });
  } catch (err) {
    console.error("Analytics visit error:", err);
    res.status(500).json({ error: "Failed to record visit" });
  }
});

// Admin Authentication Middleware
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : req.headers["x-admin-token"];
  if (!token || token !== config.admin.token) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing admin token" });
  }
  next();
}

// Admin Login
app.post("/api/v1/admin/login", async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || password !== config.admin.password) {
      return res.status(401).json({ ok: false, error: "Incorrect admin password" });
    }
    await store.recordAdminActivity({
      action: "Admin authenticated",
      details: "Admin logged into dashboard console",
    });
    res.json({
      ok: true,
      token: config.admin.token,
      message: "Admin authentication successful",
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Admin Dashboard Summary for Date
app.get("/api/v1/admin/stats", requireAdminAuth, async (req, res) => {
  try {
    const dateStr = req.query.date;
    const stats = await store.getDashboardStats(dateStr);
    res.json(stats);
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// Admin Bus Daily Logs List
app.get("/api/v1/admin/bus/daily-logs", requireAdminAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const logs = await store.listDailyBusLogs(limit);
    res.json({ logs });
  } catch (err) {
    console.error("Daily logs error:", err);
    res.status(500).json({ error: "Failed to fetch daily logs" });
  }
});

// Admin Bus Daily Log Detail
app.get("/api/v1/admin/bus/daily-logs/:date", requireAdminAuth, async (req, res) => {
  try {
    const log = await store.getDailyBusLog(req.params.date);
    res.json(log);
  } catch (err) {
    console.error("Daily log error:", err);
    res.status(500).json({ error: "Failed to fetch daily log" });
  }
});

// Admin Update Daily Bus Log
app.put("/api/v1/admin/bus/daily-logs/:date", requireAdminAuth, async (req, res) => {
  try {
    const dateStr = req.params.date;
    const updated = await store.saveDailyBusLog({ ...req.body, dateStr });
    await store.recordAdminActivity({
      action: "Daily log updated",
      details: `Updated log for ${dateStr} (Status: ${updated.status || 'N/A'}, Dist: ${updated.totalDistanceKm || 0} km)`,
    });
    res.json({ ok: true, log: updated });
  } catch (err) {
    console.error("Update daily log error:", err);
    res.status(500).json({ error: "Failed to update daily log" });
  }
});

// Admin Website Analytics for Date
app.get("/api/v1/admin/analytics/website", requireAdminAuth, async (req, res) => {
  try {
    const dateStr = req.query.date;
    const analytics = await store.getWebsiteAnalytics(dateStr);
    res.json(analytics);
  } catch (err) {
    console.error("Website analytics error:", err);
    res.status(500).json({ error: "Failed to fetch website analytics" });
  }
});

// Admin All-Time Statistics Overview
app.get("/api/v1/admin/analytics/overview", requireAdminAuth, async (req, res) => {
  try {
    const overview = await store.getStatisticsOverview();
    res.json(overview);
  } catch (err) {
    console.error("Statistics overview error:", err);
    res.status(500).json({ error: "Failed to fetch statistics overview" });
  }
});

// Admin Activity Audit Logs
app.get("/api/v1/admin/activity-logs", requireAdminAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const activities = await store.listAdminActivities(limit);
    res.json({ activities });
  } catch (err) {
    console.error("Activity logs error:", err);
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

app.post("/api/v1/admin/activity-logs", requireAdminAuth, async (req, res) => {
  try {
    const { action, details } = req.body || {};
    if (!action) return res.status(400).json({ error: "Action is required" });
    const log = await store.recordAdminActivity({ action, details });
    res.json({ ok: true, activity: log });
  } catch (err) {
    console.error("Create activity log error:", err);
    res.status(500).json({ error: "Failed to create activity log" });
  }
});

// Admin: Add Vehicle
app.post("/api/v1/admin/vehicles", requireAdminAuth, async (req, res) => {
  try {
    const { id, name, route, color, status, stops } = req.body || {};
    if (!id || !name || !route) {
      return res.status(400).json({ error: "id, name, and route are required" });
    }
    const vehicle = await store.addVehicle({ id: String(id).trim().toUpperCase(), name, route, color: color || "#1E3A8A", stops: stops || [] });
    await store.recordAdminActivity({
      action: "Vehicle added",
      details: `Added vehicle ${vehicle.id} – ${vehicle.name} (${(stops || []).length} stops)`,
    });
    res.json({ ok: true, vehicle });
  } catch (err) {
    console.error("Add vehicle error:", err);
    res.status(500).json({ error: err.message || "Failed to add vehicle" });
  }
});

// Admin: Delete Vehicle
app.delete("/api/v1/admin/vehicles/:id", requireAdminAuth, async (req, res) => {
  try {
    const vehicleId = req.params.id;
    await store.deleteVehicle(vehicleId);
    await store.recordAdminActivity({
      action: "Vehicle deleted",
      details: `Removed vehicle ${vehicleId} from fleet`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete vehicle error:", err);
    res.status(500).json({ error: err.message || "Failed to delete vehicle" });
  }
});

// Real-time Socket.IO Connection (Public - No Token Required)
io.on("connection", async (socket) => {
  try {
    const buses = await store.listBuses();
    socket.emit("buses:snapshot", buses);
  } catch (err) {
    console.error("Socket snapshot error:", err);
  }
});

async function start() {
  try {
    await store.ensureSeed();
  } catch (err) {
    console.warn("Seed info:", err.message);
  }

  // Start Onelap hardware GPS poller if enabled
  if (config.onelap.enabled) {
    onelap.start();
  }

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`\n=================================================`);
    console.log(`🚌 IIITDMK Vaahini Server is running!`);
    console.log(`📍 Public Tracker Webpage : http://localhost:${config.port}/`);
    console.log(`📡 GPS Ingestion Endpoint : POST http://localhost:${config.port}/api/v1/telemetry`);
    if (config.onelap.enabled) {
      console.log(`🛰️ Onelap GPS Ingestion  : ACTIVE (Device #${config.onelap.deviceId} -> Bus ${config.onelap.busId})`);
    } else {
      console.log(`🛰️ Onelap GPS Ingestion  : DISABLED (Set ONELAP_ENABLED=true in .env to activate)`);
    }
    console.log(`=================================================\n`);
  });
}

// Start standalone HTTP & Socket.IO server when run directly
if (!process.env.VERCEL) {
  start();
}

module.exports = app;
module.exports.server = server;
module.exports.io = io;
