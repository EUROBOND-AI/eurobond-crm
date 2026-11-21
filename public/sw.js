/* Service worker — app shell caching so returning to the app does NOT reload */
const CACHE = "eb-crm-v4";
const ASSET = /\/assets\//;   // hashed build files (js/css) — safe to cache-first

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only our own GET requests. API calls (other origin) and POST/login pass straight through.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Hashed build assets never change for a given URL -> cache-first (instant, offline-safe).
  if (ASSET.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        });
      })
    );
    return;
  }

  // Everything else (index.html shell, manifest, icons) -> network-first so a new
  // deploy is picked up immediately; fall back to cache only when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((c) => c || caches.match("/index.html")))
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
