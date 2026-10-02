/**
 * Fake a GPS module posting to the campus bus server.
 * Usage: npm run simulate -- --bus BUS-01
 */
const busId = process.argv.includes("--bus")
  ? process.argv[process.argv.indexOf("--bus") + 1]
  : "BUS-01";

const base = process.env.SERVER_URL || "http://127.0.0.1:8080";
const key = process.env.DEVICE_API_KEY || "campus-bus-gps-secret";
const campusLat = Number(process.env.CAMPUS_LAT || 15.761093);
const campusLng = Number(process.env.CAMPUS_LNG || 78.038980);

let t = 0;

async function tick() {
  t += 0.08;
  const lat = campusLat + 0.0009 * Math.sin(t);
  const lng = campusLng + 0.0008 * Math.cos(t * 0.7);
  const heading = ((Math.atan2(0.0009 * Math.cos(t), -0.0008 * 0.7 * Math.sin(t * 0.7)) * 180) / Math.PI + 360) % 360;

  const body = {
    busId,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    speedKmh: 18 + Math.round(Math.sin(t * 2) * 6),
    heading: Math.round(heading),
    satellites: 9,
    recordedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${base}/api/v1/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": key,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("ingest failed", res.status, json);
    } else {
      console.log(`${busId} ${body.lat}, ${body.lng}  ${body.speedKmh} km/h`);
    }
  } catch (err) {
    console.error("cannot reach server:", err.message);
  }
}

tick();
setInterval(tick, 2000);
