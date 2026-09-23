/* Distance from a GPS track.
   A phone lying on a desk still reports slightly different coordinates every few
   seconds. Adding those up invents a kilometre or two a day, which then lands in
   someone's expense claim. The filters below are the usual way this is handled.

   Points are always stored — this only decides what counts as movement. */

const R = 6371;
export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const ACC_MAX = 75;        // metres — a vaguer fix is shown but not measured with
const MIN_STEP = 30;       // metres — the floor, even with a perfect fix
const MIN_SPEED = 1.5;     // km/h — slower than this is drift, not walking
const MAX_SPEED = 180;     // km/h — faster is a bad fix
const MAX_STEP_KM = 25;    // one step longer than this is a bad fix, not a trip
const STILL_RADIUS = 45;   // metres
const STILL_SECS = 240;    // seconds inside that radius = standing still

const tsOf = (p) => {
  if (p.time) return Number(p.time);
  if (p.recorded_at) return Date.parse(String(p.recorded_at).replace(" ", "T"));
  return 0;
};

/* Bearing between two points, used to tell a real journey (which keeps heading
   the same way) from drift (which wanders back and forth). */
function bearing(a, b) {
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180;
  const Δλ = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const turn = (b1, b2) => { const d = Math.abs(b1 - b2) % 360; return d > 180 ? 360 - d : d; };

/* The points worth drawing: the same ones the distance is measured from, so the
   line on the map matches the kilometres and a stray fix cannot send it off to
   another district and back. Returns the original objects, in order. */
export function cleanTrack(points) {
  const kept = [];
  const pts = (points || []).map((p, i) => ({
    i,
    lat: Number(p.lat ?? p.latitude),
    lng: Number(p.lng ?? p.longitude),
    acc: Number(p.accuracy ?? p.acc ?? 0),
    t: tsOf(p),
  })).filter((p) => p.lat && p.lng && (!p.acc || p.acc <= ACC_MAX));

  let anchor = null;
  for (const p of pts) {
    if (!anchor) { anchor = p; kept.push(p.i); continue; }
    const km = haversineKm(anchor, p);
    const secs = p.t && anchor.t ? (p.t - anchor.t) / 1000 : 0;
    if (secs > 0) {
      const kmh = km / (secs / 3600);
      if (kmh > MAX_SPEED) continue;            // bad fix — leave it out
    } else if (km > MAX_STEP_KM) {
      continue;
    }
    kept.push(p.i);
    anchor = p;
  }
  return kept.map((i) => points[i]);
}

export function trackDistanceKm(points) {
  const pts = (points || [])
    .map((p) => ({
      lat: Number(p.lat ?? p.latitude),
      lng: Number(p.lng ?? p.longitude),
      acc: Number(p.accuracy ?? p.acc ?? 0),
      t: tsOf(p),
    }))
    .filter((p) => p.lat && p.lng && (!p.acc || p.acc <= ACC_MAX));

  let cum = 0;
  let anchor = null;       // last position accepted as real
  let lastBearing = null;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!anchor) { anchor = p; continue; }

    const km = haversineKm(anchor, p);
    const metres = km * 1000;

    /* A step has to be bigger than the uncertainty of BOTH fixes put together.
       Two 40 m fixes can sit 80 m apart without anyone having moved. */
    const noise = Math.max(MIN_STEP, (anchor.acc || 0) + (p.acc || 0));
    if (metres < noise) continue;

    const secs = p.t && anchor.t ? (p.t - anchor.t) / 1000 : 0;
    if (secs > 0) {
      const kmh = km / (secs / 3600);
      if (kmh < MIN_SPEED) { anchor = p; lastBearing = null; continue; }
      /* A fix that lands hundreds of kilometres away and then comes straight
         back is a bad reading, not a journey. Keep the previous position as the
         anchor so the way "back" is not counted either — moving the anchor onto
         the bad point is what turned one stray fix into 533 km. */
      if (kmh > MAX_SPEED) continue;
    } else if (km > MAX_STEP_KM) {
      /* no usable time on one of the two points: fall back to a plain distance
         sanity check instead of trusting it */
      continue;
    }

    /* Sitting in one place still throws up the odd big jump. If the position
       hasn't really left a small circle over several minutes, it is not a trip. */
    if (metres < STILL_RADIUS && secs > STILL_SECS) { anchor = p; lastBearing = null; continue; }

    /* Drift wanders back and forth; a journey keeps going roughly one way. A
       lone step that reverses on itself is ignored — the next point decides. */
    const b = bearing(anchor, p);
    if (lastBearing !== null && turn(lastBearing, b) > 140 && metres < 120) {
      anchor = p; lastBearing = b; continue;
    }

    cum += km;
    anchor = p;
    lastBearing = b;
  }
  return cum;
}
