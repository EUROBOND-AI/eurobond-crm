/* Makes background GPS survive the user swiping the notification away, and
   re-shows the notification IMMEDIATELY if it is dismissed.
   Runs automatically after every `npm install` (package.json "postinstall").
   Idempotent: safe to run many times. */
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

  // Ensure Handler + Looper imports exist (for the re-assert timer).
  if (!src.includes("import android.os.Handler;")) {
    src = src.replace("import android.os.IBinder;", "import android.os.IBinder;\nimport android.os.Handler;\nimport android.os.Looper;");
  }

  // 1) START_STICKY + a self-healing loop that re-shows the notification every 2s.
  if (!src.includes("onStartCommand")) {
    src = src.replace(
      /public IBinder onBind\(Intent intent\) \{\s*return binder;\s*\}/,
      `public IBinder onBind(Intent intent) {
        return binder;
    }

    // Re-assert the foreground notification every 2 seconds. If the user swipes it
    // away, it re-appears almost immediately and GPS tracking never stops.
    private final Handler keepAliveHandler = new Handler(Looper.getMainLooper());
    private final Runnable keepAlive = new Runnable() {
        @Override
        public void run() {
            Notification n = getNotification();
            if (n != null) {
                try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {}
                keepAliveHandler.postDelayed(this, 2000);
            }
        }
    };

    // START_STICKY: if Android kills the service, it is recreated so tracking resumes.
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 2000);
        return START_STICKY;
    }

    // If the user swipes the app away from recents, restart the service.
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Notification n = getNotification();
        if (n != null) { try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {} }
        super.onTaskRemoved(rootIntent);
    }`
    );
  }

  // 2) Start the keep-alive loop as soon as a watcher is foregrounded.
  if (!src.includes("keepAliveHandler.postDelayed(keepAlive, 2000);\n                } catch")) {
    src = src.replace(
      /startForeground\(NOTIFICATION_ID, backgroundNotification\);/,
      `startForeground(NOTIFICATION_ID, backgroundNotification);
                    keepAliveHandler.removeCallbacks(keepAlive);
                    keepAliveHandler.postDelayed(keepAlive, 2000);`
    );
  }

  // 3) Stop the loop when the last watcher is removed (so it can truly stop on logout).
  if (!src.includes("keepAliveHandler.removeCallbacks(keepAlive);\n                    stopForeground")) {
    src = src.replace(
      /if \(getNotification\(\) == null\) \{\s*stopForeground\(true\);/,
      `if (getNotification() == null) {
                    keepAliveHandler.removeCallbacks(keepAlive);
                    stopForeground(true);`
    );
  }

  // 4) On unbind, DON'T stop the service — keep tracking alive in the background.
  src = src.replace(
    /watchers = new HashSet<Watcher>\(\);\s*stopSelf\(\);\s*return false;/,
    `// keep watchers + service alive so background tracking continues
        return true;`
  );

  fs.writeFileSync(file, src, "utf8");
  console.log("[patch-bg-geo] background-geolocation patched: sticky + instant notification re-show ✓");
} catch (e) {
  console.log("[patch-bg-geo] skipped:", e.message);
}
