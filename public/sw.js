/* Service worker — app shell caching so returning to the app does NOT reload */
const CACHE = "eb-crm-v2";

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return; // let API calls pass through
  // cache-first for app assets (no reload flicker on resume)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchP = fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fetchP;
    })
  );
});

/* GPS alarm — system notification (appears outside the app) */
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "gps-alarm") {
    self.registration.showNotification("⚠️ GPS is OFF", {
      body: "Turn ON your location to continue attendance tracking.",
      tag: "gps-alarm", renotify: true, requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
    });
  }
  if (e.data && e.data.type === "gps-ok") {
    self.registration.getNotifications({ tag: "gps-alarm" }).then((ns) => ns.forEach((n) => n.close()));
  }
});
