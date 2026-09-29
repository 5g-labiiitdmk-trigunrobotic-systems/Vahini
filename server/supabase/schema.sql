-- =========================================================
-- IIITDM Kurnool Campus Bus Live Tracking Database Schema
-- Run this in Supabase: SQL Editor → New query → Run
-- =========================================================

-- Optional: Drop obsolete auth users table if migrating from previous auth version
DROP TABLE IF EXISTS users CASCADE;

-- 1. Buses Fleet Table
CREATE TABLE IF NOT EXISTS buses (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  route  TEXT NOT NULL,
  color  TEXT NOT NULL
);

-- 2. Transit Stops Table
CREATE TABLE IF NOT EXISTS stops (
  id      TEXT NOT NULL,
  bus_id  TEXT NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  lat     DOUBLE PRECISION NOT NULL,
  lng     DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (bus_id, id)
);

-- 3. Telemetry Log Table (GPS Broadcasts)
CREATE TABLE IF NOT EXISTS telemetry (
  id              BIGSERIAL PRIMARY KEY,
  bus_id          TEXT NOT NULL REFERENCES buses(id),
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  speed_kmh       DOUBLE PRECISION,
  heading         DOUBLE PRECISION,
  satellites      INTEGER,
  accuracy_meters DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist even if telemetry table was created in an older version
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS speed_kmh DOUBLE PRECISION;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS satellites INTEGER;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS accuracy_meters DOUBLE PRECISION;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index for fast query of latest coordinates per bus
CREATE INDEX IF NOT EXISTS telemetry_bus_time ON telemetry (bus_id, recorded_at DESC);

-- 4. Latest GPS View (for live map and realtime sync)
DROP VIEW IF EXISTS bus_latest CASCADE;

CREATE VIEW bus_latest AS
SELECT DISTINCT ON (bus_id)
  bus_id,
  lat,
  lng,
  speed_kmh,
  heading,
  satellites,
  accuracy_meters,
  recorded_at
FROM telemetry
ORDER BY bus_id, recorded_at DESC;

-- 5. Open Access Permissions (Public Tracking Web Platform)
ALTER TABLE buses DISABLE ROW LEVEL SECURITY;
ALTER TABLE stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON buses, stops, telemetry TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON bus_latest TO anon, authenticated;

-- =========================================================
-- SEED DATA: Single City Shuttle Fleet & 5 Kurnool Stops
-- =========================================================

-- Seed Single City Shuttle
INSERT INTO buses (id, name, route, color) VALUES
  ('BUS-01', 'City Shuttle', 'IIITDM Kurnool ↔ G. Pulla Reddy ↔ Nandyal Check post ↔ C-Camp ↔ Raj Vihar', '#1E3A8A')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  route = EXCLUDED.route,
  color = EXCLUDED.color;

-- Clean up any obsolete stops for this bus before inserting updated coordinates
DELETE FROM stops WHERE bus_id = 'BUS-01';

-- Seed Official Transit Stops with precise coordinates
INSERT INTO stops (id, bus_id, name, lat, lng) VALUES
  ('campus', 'BUS-01', 'IIITDM Kurnool Campus', 15.761093, 78.038980),
  ('gpr', 'BUS-01', 'Pulla Reddy Engineering College', 15.774741, 78.058717),
  ('nandyal', 'BUS-01', 'Nandyal Check post', 15.797984, 78.052022),
  ('ccamp', 'BUS-01', 'C Camp Circle', 15.807002, 78.042479),
  ('rajvihar', 'BUS-01', 'Raj Vihar (Kurnool Center)', 15.828735, 78.038423)
ON CONFLICT (bus_id, id) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  name = EXCLUDED.name;

-- =========================================================
-- 6. Analytics & Admin Tables
-- =========================================================

-- Website Opens Tracking (Measures every page load/visit)
CREATE TABLE IF NOT EXISTS website_opens (
  id           BIGSERIAL PRIMARY KEY,
  page         TEXT NOT NULL DEFAULT 'Bus Tracking',
  hour         INTEGER NOT NULL,
  date_str     TEXT NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_opens_date ON website_opens (date_str, hour);

-- Daily Bus Logs (Single Bus Monitoring)
CREATE TABLE IF NOT EXISTS daily_bus_logs (
  id                   BIGSERIAL PRIMARY KEY,
  bus_id               TEXT NOT NULL DEFAULT 'BUS-01',
  date_str             TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'Not Started',
  start_time           TEXT DEFAULT '—',
  end_time             TEXT DEFAULT '—',
  total_distance_km    DOUBLE PRECISION DEFAULT 0.0,
  operating_time_mins  INTEGER DEFAULT 0,
  starting_location    TEXT DEFAULT 'IIITDM Kurnool Campus',
  ending_location      TEXT DEFAULT 'Raj Vihar',
  current_location     TEXT,
  stops_visited_count  INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Admin Activity Audit Logs
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id           BIGSERIAL PRIMARY KEY,
  action       TEXT NOT NULL,
  details      TEXT,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE website_opens DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_bus_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_logs DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON website_opens, daily_bus_logs, admin_activity_logs TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
