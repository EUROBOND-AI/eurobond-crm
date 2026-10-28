/* Service worker — app shell caching so returning to the app does NOT reload.

   HTML/navigation is network-FIRST so a fresh deploy loads immediately and the
   browser never serves an old index that points at JS chunks a new build has
   removed (which left the whole app/admin blank). Hashed static assets stay
   cache-first for a no-flicker resume. Every response is cloned SYNCHRONOUSLY
   before its body is read, which fixes the "Response body is already used". */
const CACHE = "eb-crm-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // API/cross-origin pass through

  const isHTML = req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html");

  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
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
