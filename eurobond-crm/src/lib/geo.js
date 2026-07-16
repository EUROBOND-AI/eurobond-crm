// ---- Free GPS distance tracking (no paid API) ----
// Uses the browser Geolocation API + Haversine formula.
// Map tiles: OpenStreetMap via Leaflet (free).

const R = 6371; // Earth radius in km

export function haversineKm(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Total distance across a list of GPS points, skipping GPS noise.
// - ignores points with poor accuracy (> 35 m)
// - ignores tiny jumps (< 8 m) so the km doesn't inflate while standing still
export function totalDistanceKm(points) {
  let km = 0;
  let last = null;
  for (const p of points) {
    if (p.accuracy != null && p.accuracy > 35) continue;
    if (last) {
      const d = haversineKm(last, p);
      if (d * 1000 >= 8 && d < 0.5) km += d; // also skip impossible >500m jumps between ticks
      if (d * 1000 >= 8) last = p;
    } else {
      last = p;
    }
  }
  return km;
}

export function watchLocation(onPoint, onError) {
  // Native app (Capacitor) → background geolocation so tracking continues when phone is locked.
  try {
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    const BG = Cap && Cap.Plugins && Cap.Plugins.BackgroundGeolocation;
    const isNative = Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform();
    if (isNative && BG) {
      let watcherId = null;
      let removed = false;
      BG.addWatcher(
        {
          backgroundMessage: "Attendance tracking is running",
          backgroundTitle: "Eurobond CRM",
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        },
        (location, error) => {
          if (error) {
            onError && onError(new Error(error.message || "Location error"));
            return;
          }
          if (location) {
            onPoint({
              lat: location.latitude,
              lng: location.longitude,
              accuracy: location.accuracy,
              speed: location.speed,
              time: Date.now(),
            });
          }
        }
      ).then((id) => { watcherId = id; if (removed) BG.removeWatcher({ id }); })
       .catch((e) => onError && onError(new Error(e.message || "Could not start tracking")));
      return () => { removed = true; if (watcherId) { try { BG.removeWatcher({ id: watcherId }); } catch {} } };
    }
  } catch (e) {
    // fall through to browser geolocation
  }

  // Web / PWA fallback
  if (!("geolocation" in navigator)) {
    onError && onError(new Error("Geolocation not supported"));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        time: Date.now(),
      }),
    (err) => onError && onError(err),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function fmtKm(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
}

export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
