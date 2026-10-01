/* Turning a day's GPS fixes into a line that follows the road.

   The router takes at most a hundred positions in one request, and a day of
   tracking is many more than that, so asking for the whole day at once came
   back empty and the map fell back to straight lines across blocks. The day is
   sent in pieces of eighty instead, each overlapping the next by one position so
   the pieces join up, and each piece is drawn as it arrives rather than making
   everyone wait for the last one. Standing still produces a cluster of fixes a
   few metres apart that the router cannot make sense of, so only positions at
   least twenty-five metres from the one before are sent. A piece that fails
   keeps its own straight segment — the rest of the day still follows the road.

   Both the admin panel's map and the phone's map use this, so a route looks the
   same wherever it is opened. */

const CHUNK = 80;
const MIN_GAP_M = 25;

function metres(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* pts: [[lat, lng], ...]. onPiece is called with the line drawn so far, each
   time another stretch comes back from the router. */
export async function snapToRoads(pts, onPiece) {
  if (!Array.isArray(pts) || pts.length < 2) return pts || [];

  const thin = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (metres(thin[thin.length - 1], pts[i]) >= MIN_GAP_M) thin.push(pts[i]);
  }
  const last = pts[pts.length - 1];
  if (thin[thin.length - 1] !== last) thin.push(last);
  if (thin.length < 2) return pts;

  const pieces = [];
  for (let i = 0; i < thin.length - 1; i += CHUNK - 1) pieces.push(thin.slice(i, i + CHUNK));

  const drawn = [];
  for (const piece of pieces) {
    if (piece.length < 2) continue;
    let part = piece;
    try {
      const coords = piece.map((p) => `${p[1]},${p[0]}`).join(";");
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const j = await r.json();
      const line = j.routes?.[0]?.geometry?.coordinates;
      if (line && line.length) part = line.map(([lng, lat]) => [lat, lng]);
    } catch { /* this stretch stays as it was */ }
    drawn.push(...(drawn.length ? part.slice(1) : part));
    if (onPiece) {
      /* the caller's map may have been closed in the meantime; it says so by
         throwing, and there is no point asking for the rest of the day. */
      try { onPiece(drawn.slice()); } catch { return drawn; }
    }
  }
  return drawn;
}

export { metres };
