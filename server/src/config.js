module.exports = {
  port: Number(process.env.PORT || 8080),
  deviceApiKey: process.env.DEVICE_API_KEY || "campus-bus-gps-secret",
  campus: {
    name: process.env.CAMPUS_NAME || "IIITDM Kurnool",
    lat: Number(process.env.CAMPUS_LAT || 15.761093),
    lng: Number(process.env.CAMPUS_LNG || 78.038980),
  },
  onelap: {
    enabled: process.env.ONELAP_ENABLED === "true" || process.env.ONELAP_ENABLED === "1",
    baseUrl: (process.env.ONELAP_BASE_URL || "https://web.onelap.in").replace(/\/+$/, ""),
    phone: process.env.ONELAP_PHONE || "",
    password: process.env.ONELAP_PASSWORD || "",
    deviceId: process.env.ONELAP_DEVICE_ID || "",
    busId: process.env.ONELAP_BUS_ID || "BUS-01",
    pollIntervalMs: Math.max(1000, Number(process.env.ONELAP_POLL_INTERVAL_MS || 3000)),
  },
  admin: {
    password: process.env.ADMIN_PASSWORD || "admin123",
    token: process.env.ADMIN_TOKEN || "campus-bus-admin-sec-token-2026",
  },
};

