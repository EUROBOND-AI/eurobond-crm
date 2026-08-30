/* Keeps background GPS alive AND re-requests location updates if the service is
   disturbed (e.g. notification swiped). Runs after every `npm install`. Idempotent. */
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname, "..", "node_modules", "@capacitor-community", "background-geolocation",
  "android", "src", "main", "java", "com", "equimaps",
  "capacitor_background_geolocation", "BackgroundGeolocationService.java"
);

try {
  if (!fs.existsSync(file)) { console.log("[patch-bg-geo] plugin file not found, skipping"); process.exit(0); }
  let src = fs.readFileSync(file, "utf8");

  if (src.includes("EB_PATCH")) { console.log("[patch-bg-geo] already patched ✓"); process.exit(0); }

  if (!src.includes("import android.os.Handler;")) {
    src = src.replace("import android.os.IBinder;", "import android.os.IBinder;\nimport android.os.Handler;\nimport android.os.Looper;");
  }

  // Class-level keep-alive: every 2s re-assert the notification AND re-request
  // location updates for every watcher (so GPS never stops, even after a swipe).
  src = src.replace(
    /private static final int NOTIFICATION_ID = 28351;/,
    `private static final int NOTIFICATION_ID = 28351;

    // EB_PATCH: keep foreground + GPS alive; re-show notification and re-arm
    // location updates within ~2s if the service is disturbed (e.g. swipe).
    private final Handler keepAliveHandler = new Handler(Looper.getMainLooper());
    private final Runnable keepAlive = new Runnable() {
        @Override
        public void run() {
            Notification n = getNotification();
            if (n != null) {
                try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {}
                // re-arm location updates for every watcher (GPS keeps flowing)
                for (Watcher w : watchers) {
                    try {
                        w.client.removeLocationUpdates(w.locationCallback);
                        w.client.requestLocationUpdates(w.locationRequest, w.locationCallback, null);
                    } catch (SecurityException ignore) {} catch (Exception e) {}
                }
                keepAliveHandler.postDelayed(this, 2000);
            }
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 2000);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Notification n = getNotification();
        if (n != null) { try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {} }
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 500);
        super.onTaskRemoved(rootIntent);
    }`
  );

  // Start the keep-alive loop as soon as a watcher is foregrounded.
  src = src.replace(
    /startForeground\(NOTIFICATION_ID, backgroundNotification\);/,
    `startForeground(NOTIFICATION_ID, backgroundNotification);
                    keepAliveHandler.removeCallbacks(keepAlive);
                    keepAliveHandler.postDelayed(keepAlive, 2000);`
  );

  // Stop the loop only when the last watcher is removed (real stop on logout).
  src = src.replace(
    /if \(getNotification\(\) == null\) \{\s*stopForeground\(true\);/,
    `if (getNotification() == null) {
                    keepAliveHandler.removeCallbacks(keepAlive);
                    stopForeground(true);`
  );

  // On unbind, keep the service + watchers alive (don't stop tracking).
  src = src.replace(
    /watchers = new HashSet<Watcher>\(\);\s*stopSelf\(\);\s*return false;/,
    `// EB_PATCH: keep service + watchers alive so background tracking continues
        return true;`
  );

  // Force a fast native location interval (60s) so points keep coming even when
  // Android throttles background updates. The plugin builds a LocationRequest with
  // setInterval(...) — make it 60s and fastest 30s regardless of the JS-side value.
  src = src.replace(
    /\.setInterval\((\d+|[a-zA-Z0-9_\.\*\s]+)\)/g,
    ".setInterval(60000)"
  );
  src = src.replace(
    /\.setFastestInterval\((\d+|[a-zA-Z0-9_\.\*\s]+)\)/g,
    ".setFastestInterval(30000)"
  );

  fs.writeFileSync(file, src, "utf8");
  console.log("[patch-bg-geo] patched: sticky notification + GPS re-arm ✓");
} catch (e) {
  console.log("[patch-bg-geo] skipped:", e.message);
}
