// ---- Free GPS distance tracking (no paid API) ----
// Uses the browser Geolocation API + Haversine formula.
// Map tiles: OpenStreetMap via Leaflet (free).

const R = 6371; // Earth radius in km

/* keep this EXACTLY the same as API_BASE in src/lib/api.js */
const API_BASE_FALLBACK = "https://eurobondsealant.com/crm-api";

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
    /* reuse the app's existing working channel (created in phoneNotify) */
    try {
      if (LN.createChannel) {
        await LN.createChannel({ id: "eurobond_crm", name: "Eurobond CRM", description: "CRM alerts", importance: 5, visibility: 1 });
      }
    } catch {}
    const base = { id: TRACK_NOTIF_ID, title: "Eurobond CRM", body: "Tracking on", ongoing: true, autoCancel: false, channelId: "eurobond_crm" };
    try {
      /* colored Eurobond logo on the right (largeIcon) + white silhouette in status bar (smallIcon) */
      await LN.schedule({ notifications: [{ ...base, smallIcon: "ic_stat_notify", largeIcon: "ic_notify_large" }] });
    } catch {
      try { await LN.schedule({ notifications: [base] }); } catch {}
    }
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
  diag: { watcherFires: 0, lastFireMs: 0, uploads: 0, lastUploadMs: 0, lastUploadOk: null, lastError: "", startedMs: 0 },
};

/* diagnostic snapshot for the in-app debug screen */
export function getTrackerDiag() {
  const d = _tracker.diag;
  const ago = (ms) => ms ? Math.round((Date.now() - ms) / 1000) + "s ago" : "never";
  return {
    active: _tracker.active,
    sessionId: _tracker.sessionId,
    watcherFires: d.watcherFires,
    lastFire: ago(d.lastFireMs),
    uploads: d.uploads,
    lastUpload: ago(d.lastUploadMs),
    lastUploadOk: d.lastUploadOk,
    lastError: d.lastError || "none",
    lastSaved: ago(_tracker.lastSavedMs),
    runningFor: d.startedMs ? Math.round((Date.now() - d.startedMs) / 60000) + " min" : "-",
  };
}

export function setTrackerHandler(fn) { _tracker.onPoint = fn; }
export function isTrackerActive() { return _tracker.active; }
export function setTrackerSession(sessionId, intervalMs, uploadFn) {
  const changed = _tracker.sessionId !== sessionId;
  _tracker.sessionId = sessionId;
  if (intervalMs) _tracker.intervalMs = intervalMs;
  if (uploadFn) _tracker.uploadFn = uploadFn;
  /* Write session + token + URL to native storage so the patched native service can
     upload locations directly (works when the JS/WebView is frozen in background). */
  try {
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    const Prefs = Cap && Cap.Plugins && Cap.Plugins.Preferences;
    if (Prefs) {
      const token = (typeof localStorage !== "undefined" && localStorage.getItem("eb_token")) || "";
      /* single source of truth — change API_BASE in src/lib/api.js only */
      const base = (typeof window !== "undefined" && window.__EB_API_BASE__) || API_BASE_FALLBACK;
      if (sessionId) {
        Prefs.set({ key: "eb_session_id", value: String(sessionId) });
        Prefs.set({ key: "eb_token", value: token });
        Prefs.set({ key: "eb_upload_url", value: base + "/attendance.php?action=points" });
      } else {
        Prefs.remove({ key: "eb_session_id" });
      }
    }
  } catch {}
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
  _tracker.diag.watcherFires++;
  _tracker.diag.lastFireMs = Date.now();
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
    /* UPLOAD IMMEDIATELY — do not wait on geocoding (the server geocodes the address
       itself, and a background WebView can stall the fetch below, which used to block
       the upload entirely). Address here is best-effort only. */
    _tracker.diag.uploads++;
    _tracker.diag.lastUploadMs = Date.now();
    try {
      _tracker.uploadFn(_tracker.sessionId, [pt])
        .then(() => { _tracker.diag.lastUploadOk = true; })
        .catch((e) => { _tracker.diag.lastUploadOk = false; _tracker.diag.lastError = "upload: " + (e && e.message || "fail"); });
    } catch (e) { _tracker.diag.lastUploadOk = false; _tracker.diag.lastError = "upload throw: " + (e && e.message || ""); }
  }
}

export async function startTracker(onPoint, onError) {
  _tracker.onPoint = onPoint;
  if (_tracker.active) return;                 // already running — just re-point the handler
  _tracker.active = true;
  _tracker.diag.startedMs = Date.now();
  _tracker.diag.lastError = "";
  _tracker.lastSavedMs = 0;

  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const BG = Cap && Cap.Plugins && Cap.Plugins.BackgroundGeolocation;
  const isNative = Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform();

  /* Start a dedicated persistent foreground service that keeps the whole process
     alive — this is what survives app swipe-close on MIUI/ColorOS/OneUI. It runs
     alongside the GPS watcher (does not touch GPS logic). */
  const isAndroid = isNative && typeof Cap.getPlatform === "function" && Cap.getPlatform() === "android";
  if (isAndroid && Cap.Plugins && Cap.Plugins.ForegroundService) {   // Android-only plugin
    try {
      const FGS = Cap.Plugins.ForegroundService;
      try { await FGS.requestPermissions(); } catch (pe) {}
      await FGS.startForegroundService({
        id: 74190,
        title: "Eurobond CRM",
        body: "Attendance tracking is running",
        smallIcon: "ic_stat_notify",
        serviceType: 8,   // ServiceType.Location — REQUIRED on Android 10+
      });
      _tracker.diag.fgs = "started";
    } catch (e) {
      _tracker.diag.fgs = "FAILED: " + (e && e.message ? e.message : String(e));
    }
  } else {
    _tracker.diag.fgs = isNative ? "plugin-not-found" : "web";
  }

  if (isNative && BG) {
    try {
      const id = await BG.addWatcher(
        {
          backgroundMessage: "Tracking on",
          backgroundTitle: "Eurobond CRM",
          requestPermissions: true,
          stale: true,
          distanceFilter: 5,    // small filter: GPS drift alone keeps it firing so 15-min points land even when stationary/backgrounded
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
  /* stop the persistent foreground service when attendance ends */
  try {
    const plat = Cap && typeof Cap.getPlatform === "function" ? Cap.getPlatform() : "";
    if (plat === "android" && Cap.Plugins && Cap.Plugins.ForegroundService) await Cap.Plugins.ForegroundService.stopForegroundService();
  } catch {}
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
