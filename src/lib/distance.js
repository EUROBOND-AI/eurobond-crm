/* Distance from a GPS track.
   A phone sitting still still reports slightly different coordinates every few
   seconds, and naively adding those up invents a kilometre or two a day. The
   filters below are the usual way this is handled:

   1. drop fixes whose reported accuracy is too poor to trust
   2. ignore a step smaller than the accuracy of the two fixes involved
   3. ignore a step that implies an impossibly slow "walk" (that is drift)
   4. ignore a step that implies an impossible speed (a GPS jump)
   5. treat a cluster of points inside a small radius as standing still     */

const R = 6371;
export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const ACC_MAX = 50;        // metres — worse than this is guesswork
const MIN_STEP = 25;       // metres — below this it is almost certainly drift
const MIN_SPEED = 1.0;     // km/h — slower than a slow walk means standing still
const MAX_SPEED = 180;     // km/h — faster than this is a bad fix
const STILL_RADIUS = 40;   // metres — points inside this are the same spot

const tsOf = (p) => {
  if (p.time) return Number(p.time);
  if (p.recorded_at) return Date.parse(String(p.recorded_at).replace(" ", "T"));
  return 0;
};

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
  let anchor = null;      // last point we accepted as real movement

  for (const p of pts) {
    if (!anchor) { anchor = p; continue; }

    const km = haversineKm(anchor, p);
    const metres = km * 1000;

    /* a step has to clear both the fixed floor and the accuracy of the fixes */
    const noise = Math.max(MIN_STEP, (anchor.acc || 0) * 0.6, (p.acc || 0) * 0.6);
    if (metres < noise) continue;                 // same spot, just drifting

    const secs = p.t && anchor.t ? (p.t - anchor.t) / 1000 : 0;
    if (secs > 0) {
      const kmh = km / (secs / 3600);
      if (kmh < MIN_SPEED) { anchor = p; continue; }   // crawling = drift
      if (kmh > MAX_SPEED) { anchor = p; continue; }   // impossible jump
    }

    /* standing in one place for a while still produces steps that pass the
       checks above; ignore anything that never leaves a small circle */
    if (metres < STILL_RADIUS && secs > 240) { anchor = p; continue; }

    cum += km;
    anchor = p;
  }
  return cum;
}
