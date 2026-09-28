# Campus Bus — Live Real-Time GPS Transit Tracker

A complete, responsive web platform for live campus bus tracking at **IIITDM Kurnool**. 
- **No authentication or sign-in required** — students and staff get instant access to real-time bus locations, speeds, and routes.
- **Hardware GPS Powered** — automatically ingests live coordinates, speed, and heading from onboard GPS tracker modules (e.g. Onelap Micro GPS) directly to the live map.

---

## System Architecture

```
[Onboard GPS Module / Telemetry Ingest]
       │
       │  HTTP / Cloud Ingest (Coordinates, Speed, Heading)
       ▼
[Node.js + Express Backend]
       │
       │  Socket.IO real-time broadcasts
       ▼
[Public Live Bus Tracking Webpage] (Leaflet OSM, live bus markers, stops, timetable)
```

---

## 1. Quick Start

### Prerequisites
- Node.js 18+

### Setup & Run
```powershell
cd server
npm install
npm start
```

Once running:
- **Public Student/Staff Tracking Map**: [http://localhost:8080/](http://localhost:8080/)

---

## 2. Public Student Live Map (`/`)

Open [http://localhost:8080/](http://localhost:8080/) in any browser (mobile or desktop):
- **Instant Access**: Zero login gates or password requirements.
- **Live Vehicle List**: Shows registered buses with real-time status (`LIVE`, `STALE`, `OFFLINE`) and speed.
- **Interactive Leaflet Map**: Custom vehicle markers with pulse rings and direction indicators.
- **Route Stops & Timetable**: View scheduled stops and live timetable countdown for transit in Kurnool.
- **Controls**: Recenter on campus, locate user position, follow bus toggle, and map layer switcher.

---

## 3. API Endpoints

All endpoints are open and public:

- `GET /api/v1/health` — System status and campus coordinates.
- `GET /api/v1/campus` — Campus name and center coordinates.
- `GET /api/v1/buses` — List all buses with current live positions, status, and stops.
- `GET /api/v1/buses/:id` — Details for a specific bus.
- `POST /api/v1/telemetry` — Ingest live vehicle GPS telemetry (from hardware GPS module or tracker).
  ```json
  {
    "busId": "BUS-01",
    "lat": 15.759314,
    "lng": 78.039152,
    "speedKmh": 24.5,
    "heading": 180,
    "satellites": 8,
    "accuracyMeters": 4
  }
  ```

---

## 4. Onelap Micro GPS Hardware Integration

Live bus tracking is powered by the **Onelap Micro GPS** hardware tracker installed in the bus:

1. Configure your Onelap account credentials in `server/.env`:
   ```env
   ONELAP_ENABLED=true
   ONELAP_PHONE=your_registered_phone_number
   ONELAP_PASSWORD=your_onelap_password
   ONELAP_DEVICE_ID=115491
   ONELAP_BUS_ID=BUS-01
   ONELAP_POLL_INTERVAL_MS=3000
   ```
2. Test connection and view live GPS diagnostics:
   ```powershell
   node server/scripts/test-onelap.js
   ```
3. Start the server (`npm start`). The backend automatically polls Onelap Cloud in real-time, ingests satellite telemetry, and broadcasts live vehicle positions to all students.

---

## 5. Simulating GPS for Testing

To test bus movement during local development without a physical drive, run the terminal simulator script:
```powershell
cd server
npm run simulate
```

## 6. Folder Structure  
campus-bus/
├── .gitignore
├── package.json
├── vercel.json
├── README.md
└── server/
    ├── .env
    ├── .env.example
    ├── package.json
    ├── public/
    │   ├── index.html
    │   ├── assets/logo.jpg
    │   ├── css/app.css
    │   └── js/app.js
    ├── scripts/
    │   ├── simulate-gps.js
    │   └── test-onelap.js
    ├── src/
    │   ├── config.js
    │   ├── db.js
    │   ├── index.js
    │   ├── schedule.js
    │   ├── store.js
    │   └── integrations/
    │       └── onelap.js
    └── supabase/
        └── schema.sql
