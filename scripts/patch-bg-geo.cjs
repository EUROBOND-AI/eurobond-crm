/* Makes background GPS survive the user swiping the notification away.
   Runs automatically after every `npm install` (see package.json "postinstall").
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

  // 1) Add START_STICKY so the OS recreates the service if it's killed / notification swiped.
  if (!src.includes("onStartCommand")) {
    src = src.replace(
      /public IBinder onBind\(Intent intent\) \{\s*return binder;\s*\}/,
      match => match + `

    // START_STICKY: if Android kills the service (user swipes the notification
    // away or the OS reclaims memory), the system recreates it so background
    // location tracking resumes automatically.
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }`
    );
  }

  // 2) On unbind, DON'T stop the service — keep tracking alive in the background.
  src = src.replace(
    /watchers = new HashSet<Watcher>\(\);\s*stopSelf\(\);\s*return false;/,
    `// keep watchers + service alive so background tracking continues
        return true;`
  );

  fs.writeFileSync(file, src, "utf8");
  console.log("[patch-bg-geo] background-geolocation patched for sticky tracking ✓");
} catch (e) {
  console.log("[patch-bg-geo] skipped:", e.message);
}
