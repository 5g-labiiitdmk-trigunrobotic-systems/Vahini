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
  ('BUS-01', 'City Shuttle', 'IIITDM Kurnool ↔ GPREC ↔ Nandyal Check post ↔ C-Camp ↔ Raj Vihar', '#1E3A8A')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  route = EXCLUDED.route,
  color = EXCLUDED.color;

-- Clean up any obsolete stops for this bus before inserting updated coordinates
DELETE FROM stops WHERE bus_id = 'BUS-01';

-- Seed Official Transit Stops with precise coordinates
INSERT INTO stops (id, bus_id, name, lat, lng) VALUES
  ('campus', 'BUS-01', 'IIITDM Kurnool Campus', 15.761093, 78.038980),
  ('gpr', 'BUS-01', 'GPREC', 15.774741, 78.058717),
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

-- =========================================================
-- IIITDMK Vaahini — Add Vehicle Feature (Admin Panel)
-- Run in Supabase: SQL Editor → New query → Run
-- These statements are safe to run on an existing schema.
-- =========================================================

-- The core buses & stops tables already exist from the base schema.
-- The statements below add permissions and a helper function so the
-- admin "Add Vehicle" / "Delete Vehicle" API works correctly.

-- 1. Ensure the admin role can insert/delete buses and stops
--    (already granted above, repeated here for isolated migration runs)
GRANT SELECT, INSERT, UPDATE, DELETE ON buses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stops  TO anon, authenticated;

-- 2. Helper function: add a vehicle with its stops in one transaction
--    Called by the server's store.addVehicle() via individual inserts,
--    but can also be used directly from the Supabase SQL editor.
CREATE OR REPLACE FUNCTION add_vehicle(
  p_id     TEXT,
  p_name   TEXT,
  p_route  TEXT,
  p_color  TEXT
)
RETURNS buses AS $$
DECLARE
  inserted buses%ROWTYPE;
BEGIN
  INSERT INTO buses (id, name, route, color)
  VALUES (p_id, p_name, p_route, p_color)
  RETURNING * INTO inserted;
  RETURN inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Helper function: safely delete a vehicle and all its data
CREATE OR REPLACE FUNCTION delete_vehicle(p_id TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM stops    WHERE bus_id = p_id;
  DELETE FROM telemetry WHERE bus_id = p_id;
  DELETE FROM buses    WHERE id     = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Example: manually add a second vehicle via SQL
--    (Uncomment and edit to use)
-- SELECT add_vehicle('BUS-02', 'Campus Express', 'IIITDMK Campus ↔ Railway Station ↔ City Center', '#0ea5e9');
--
-- INSERT INTO stops (id, bus_id, name, lat, lng) VALUES
--   ('campus2',  'BUS-02', 'IIITDMK Campus',    15.761093, 78.038980),
--   ('station',  'BUS-02', 'Railway Station',    15.830000, 78.045000),
--   ('city',     'BUS-02', 'City Center',        15.845000, 78.050000);

-- 5. Example: manually delete a vehicle via SQL
--    (Uncomment and edit to use)
-- SELECT delete_vehicle('BUS-02');

-- =========================================================
-- Day-Type Override Table (Admin can set Weekday / Holiday)
-- =========================================================

CREATE TABLE IF NOT EXISTS day_overrides (
  date_str      TEXT PRIMARY KEY,           -- e.g. "2026-09-29"
  override_type TEXT NOT NULL,              -- "weekday" | "holiday"
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE day_overrides DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON day_overrides TO anon, authenticated;
