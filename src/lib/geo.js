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
    if (last) {
      const d = haversineKm(last, p);
      // only count real movement: ignore GPS drift under 60m, skip teleport jumps over 5km
      if (d * 1000 >= 60 && d < 5) { km += d; last = p; }
      else if (d >= 5) { last = p; }   // teleport -> reset anchor, don't count
      // else: drift under 60m -> keep same anchor, add nothing
    } else {
      last = p;
    }
  }
  return km;
}

/* ---- Real phone notification (shows in the system notification bar) ----
   Uses @capacitor/local-notifications. Fired on attendance Start, cancelled on Stop.
   This is the visible "Eurobond CRM · Tracking on" bar notification the user wants. */
const TRACK_NOTIF_ID = 4801;
export async function showTrackingNotification() {
  try {
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    const LN = Cap && Cap.Plugins && Cap.Plugins.LocalNotifications;
    if (!LN) return;
    try { await LN.requestPermissions(); } catch {}
    await LN.schedule({
      notifications: [{
        id: TRACK_NOTIF_ID,
        title: "Eurobond CRM",
        body: "Tracking on",
        ongoing: true,            // sticky — user can't swipe it away while tracking
        autoCancel: false,
        smallIcon: "ic_stat_icon_config_sample",
        channelId: "tracking",
      }],
    });
  } catch {}
}
export async function hideTrackingNotification() {
  try {
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    const LN = Cap && Cap.Plugins && Cap.Plugins.LocalNotifications;
    if (!LN) return;
    await LN.cancel({ notifications: [{ id: TRACK_NOTIF_ID }] });
  } catch {}
}

/* ============================================================================
   PERSISTENT GPS TRACKER (module singleton — survives React remounts AND
   uploads points DIRECTLY to the server from here, so tracking keeps saving
   even when every React screen is unmounted / the app is backgrounded/locked.
   ============================================================================ */
const _tracker = {
  active: false,
  watcherId: null,
  webWatchId: null,
  onPoint: null,
  sessionId: null,
  lastSavedMs: 0,
  intervalMs: 900000,      // 15 min timeline cadence
  uploadFn: null,
  lastKept: null,          // last KEPT point {lat,lng} — for stationary/move detection
};

export function setTrackerHandler(fn) { _tracker.onPoint = fn; }
export function isTrackerActive() { return _tracker.active; }
export function setTrackerSession(sessionId, intervalMs, uploadFn) {
  const changed = _tracker.sessionId !== sessionId;
  _tracker.sessionId = sessionId;
  if (intervalMs) _tracker.intervalMs = intervalMs;
  if (uploadFn) _tracker.uploadFn = uploadFn;
  if (changed && sessionId) {
    _tracker.lastSavedMs = 0;
    _tracker.lastKept = null;
    /* grab one location right now and upload it, so the server has a point immediately
       (doesn't wait for the native watcher's first callback / the 15-min tick) */
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => _handleLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, time: Date.now() }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 4000 }
      );
    }
  }
}

function _handleLocation(loc) {
  const pt = {
    lat: loc.latitude ?? loc.lat,
    lng: loc.longitude ?? loc.lng,
    accuracy: loc.accuracy ?? null,
    time: loc.time || Date.now(),
    t: loc.time || Date.now(),
  };
  if (pt.lat == null || pt.lng == null) return;

  /* Simple rule (like BreezERP): keep ONE point every 15 minutes — wherever they are.
     First point kept immediately. No accuracy/stationary filtering. */
  const now = Date.now();
  const isFirst = _tracker.lastSavedMs === 0;
  const timeDue = (now - _tracker.lastSavedMs) >= _tracker.intervalMs;
  if (!isFirst && !timeDue) return;

  if (_tracker.onPoint) { try { _tracker.onPoint(pt); } catch {} }

  if (_tracker.sessionId && _tracker.uploadFn) {
    _tracker.lastSavedMs = now;
    pt.online = typeof navigator !== "undefined" ? navigator.onLine : true;
    try { _tracker.uploadFn(_tracker.sessionId, [pt]).catch(() => {}); } catch {}
  }
}

export async function startTracker(onPoint, onError) {
  _tracker.onPoint = onPoint;
  if (_tracker.active) return;                 // already running — just re-point the handler
  _tracker.active = true;
  _tracker.lastSavedMs = 0;

  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const BG = Cap && Cap.Plugins && Cap.Plugins.BackgroundGeolocation;
  const isNative = Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform();

  if (isNative && BG) {
    try {
      const id = await BG.addWatcher(
        {
          backgroundMessage: "Tracking on",
          backgroundTitle: "Eurobond CRM",
          requestPermissions: true,
          stale: true,
          distanceFilter: 0,    // fire continuously (even while stationary) so 15-min points land in background too
        },
        (location, error) => {
          if (error) { onError && onError(new Error(error.message || "Location error")); return; }
          if (location) _handleLocation(location);
        }
      );
      _tracker.watcherId = id;
    } catch (e) {
      _tracker.active = false;
      onError && onError(new Error(e.message || "Could not start tracking"));
    }
    return;
  }

  // Web / PWA fallback
  if (!("geolocation" in navigator)) { _tracker.active = false; onError && onError(new Error("Geolocation not supported")); return; }
  _tracker.webWatchId = navigator.geolocation.watchPosition(
    (pos) => _handleLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed, time: Date.now() }),
    (err) => onError && onError(err),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
  );
}

export async function stopTracker() {
  _tracker.active = false;
  _tracker.onPoint = null;
  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const BG = Cap && Cap.Plugins && Cap.Plugins.BackgroundGeolocation;
  if (_tracker.watcherId && BG) { try { await BG.removeWatcher({ id: _tracker.watcherId }); } catch {} _tracker.watcherId = null; }
  if (_tracker.webWatchId != null && navigator.geolocation) { try { navigator.geolocation.clearWatch(_tracker.webWatchId); } catch {} _tracker.webWatchId = null; }
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
          backgroundMessage: "Attendance tracking is running. Tap to open.",
          backgroundTitle: "Eurobond CRM — Tracking ON",
          requestPermissions: true,
          stale: false,
          distanceFilter: 15,   // capture when moved ~15m (background-friendly, less battery)
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
