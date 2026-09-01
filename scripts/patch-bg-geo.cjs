/* PERMANENT background-tracking fix for capacitor-community/background-geolocation.
   The plugin captures locations natively but delivers them to JS for upload — and
   Android freezes the WebView in the background, so uploads stop. This patch makes
   the native service POST each location DIRECTLY to the server (no JS needed), so
   tracking keeps uploading even when the app is backgrounded/locked/dozing.

   The JS side writes session_id, auth token and the upload URL into SharedPreferences
   (via @capacitor/preferences, group "CapacitorStorage"); the native code reads them.

   Runs after every `npm install` (package.json "postinstall"). Idempotent. */
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

  const alreadyPatched = src.includes("EB_NATIVE_UPLOAD");

  // ---- imports ----
  if (!alreadyPatched) {
  const imports = [
    "import android.os.Handler;",
    "import android.os.Looper;",
    "import android.content.SharedPreferences;",
    "import android.app.AlarmManager;",
    "import android.app.PendingIntent;",
    "import android.content.Context;",
    "import android.os.PowerManager;",
    "import java.io.OutputStream;",
    "import java.net.HttpURLConnection;",
    "import java.net.URL;",
    "import org.json.JSONObject;",
    "import org.json.JSONArray;",
  ];
  let addImports = imports.filter(i => !src.includes(i)).join("\n");
  if (addImports) src = src.replace("import android.os.IBinder;", "import android.os.IBinder;\n" + addImports);

  // ---- native uploader + keep-alive, declared at service-class level ----
  src = src.replace(
    /private static final int NOTIFICATION_ID = 28351;/,
    `private static final int NOTIFICATION_ID = 28351;

    // EB_NATIVE_UPLOAD: post a location straight to the server from native code,
    // so uploads work even when the JS/WebView is frozen in the background.
    private long ebLastUploadMs = 0;
    private void ebUploadLocation(final Location location) {
        if (location == null) return;
        final long now = System.currentTimeMillis();
        // one upload per ~14 min (matches the 15-min timeline; server also spaces)
        if (ebLastUploadMs != 0 && (now - ebLastUploadMs) < 14 * 60 * 1000) return;
        ebLastUploadMs = now;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    SharedPreferences prefs = getApplicationContext()
                        .getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
                    String url = prefs.getString("eb_upload_url", null);
                    String token = prefs.getString("eb_token", null);
                    String sessionId = prefs.getString("eb_session_id", null);
                    if (url == null || sessionId == null) return;

                    JSONObject pt = new JSONObject();
                    pt.put("lat", location.getLatitude());
                    pt.put("lng", location.getLongitude());
                    pt.put("accuracy", location.getAccuracy());
                    pt.put("time", location.getTime() > 0 ? location.getTime() : now);
                    pt.put("online", true);
                    JSONArray arr = new JSONArray();
                    arr.put(pt);
                    JSONObject body = new JSONObject();
                    body.put("session_id", Integer.parseInt(sessionId));
                    body.put("points", arr);

                    URL u = new URL(url);
                    HttpURLConnection c = (HttpURLConnection) u.openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(20000);
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    if (token != null && token.length() > 0)
                        c.setRequestProperty("Authorization", "Bearer " + token);
                    OutputStream os = c.getOutputStream();
                    os.write(body.toString().getBytes("UTF-8"));
                    os.flush(); os.close();
                    c.getResponseCode();   // fire the request
                    c.disconnect();
                } catch (Exception e) { /* retry on next location */ }
            }
        }).start();
    }

    private final Handler keepAliveHandler = new Handler(Looper.getMainLooper());
    private final Runnable keepAlive = new Runnable() {
        @Override public void run() {
            Notification n = getNotification();
            if (n != null) {
                try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {}
                for (Watcher w : watchers) {
                    try {
                        w.client.removeLocationUpdates(w.locationCallback);
                        w.client.requestLocationUpdates(w.locationRequest, w.locationCallback, null);
                    } catch (Exception e) {}
                }
                ebScheduleAlarm();   // keep a Doze-proof wakeup armed
                keepAliveHandler.postDelayed(this, 2000);
            }
        }
    };

    // EB: Doze-proof alarm — fires even in deep sleep, grabs a fresh location and uploads.
    // This is what keeps points flowing on aggressive phones (ColorOS/MIUI/Vivo).
    private void ebScheduleAlarm() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(getApplicationContext(), BackgroundGeolocationService.class);
            i.setAction("EB_ALARM_TICK");
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            try { flag |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
            PendingIntent pi = PendingIntent.getService(getApplicationContext(), 4802, i, flag);
            long next = System.currentTimeMillis() + 120000; // ~2 min
            // setAlarmClock() is NOT throttled by Doze — it always fires on time, even in
            // deep sleep. This is the key to points flowing when the phone is idle for hours.
            try {
                PendingIntent show = PendingIntent.getService(getApplicationContext(), 4803, i, flag);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(next, show), pi);
            } catch (Exception e) {
                try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); }
                catch (Exception e2) { am.set(AlarmManager.RTC_WAKEUP, next, pi); }
            }
        } catch (Exception e) {}
    }

    private void ebPollOnce() {
        for (Watcher w : watchers) {
            try {
                // Force a FRESH single location (ignores distanceFilter), so a point is
                // captured even when the user hasn't moved. This is the key fix for
                // "stationary = no points": getCurrentLocation always returns a fix.
                w.client.getCurrentLocation(100, null)
                    .addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<Location>() {
                        @Override public void onSuccess(Location loc) {
                            if (loc != null) { ebUploadLocation(loc); }
                        }
                    });
            } catch (Exception e) {
                try {
                    w.client.removeLocationUpdates(w.locationCallback);
                    w.client.requestLocationUpdates(w.locationRequest, w.locationCallback, null);
                } catch (Exception e2) {}
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "EB_ALARM_TICK".equals(intent.getAction())) {
            Notification n = getNotification();
            if (n != null) { try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {} }
            // Wake the CPU so GPS can get a fix in deep Doze; auto-releases after 30s.
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "eurobond:tick");
                wl.acquire(30000);
            } catch (Exception e) {}
            ebPollOnce();       // grab a fresh location on the alarm tick
            ebScheduleAlarm();  // re-arm for the next tick
            return START_STICKY;
        }
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 2000);
        ebScheduleAlarm();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Notification n = getNotification();
        if (n != null) { try { startForeground(NOTIFICATION_ID, n); } catch (Exception e) {} }
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 500);
        ebScheduleAlarm();
        super.onTaskRemoved(rootIntent);
    }`
  );

  // ---- call the native uploader the moment a location is captured ----
  src = src.replace(
    /Location location = locationResult\.getLastLocation\(\);/,
    `Location location = locationResult.getLastLocation();
                    ebUploadLocation(location);   // EB_NATIVE_UPLOAD: post straight to server`
  );

  // ---- keep the service alive across unbind + start the keep-alive loop ----
  src = src.replace(
    /startForeground\(NOTIFICATION_ID, backgroundNotification\);/,
    `startForeground(NOTIFICATION_ID, backgroundNotification);
                    keepAliveHandler.removeCallbacks(keepAlive);
                    keepAliveHandler.postDelayed(keepAlive, 2000);`
  );
  src = src.replace(
    /if \(getNotification\(\) == null\) \{\s*stopForeground\(true\);/,
    `if (getNotification() == null) {
                    keepAliveHandler.removeCallbacks(keepAlive);
                    stopForeground(true);`
  );
  src = src.replace(
    /watchers = new HashSet<Watcher>\(\);\s*stopSelf\(\);\s*return false;/,
    `return true;   // EB: keep service + watchers alive for background tracking`
  );

  // ---- faster native location interval so points keep coming ----
  src = src.replace(/locationRequest\.setInterval\(\d+\);/, "locationRequest.setInterval(60000);");
  src = src.replace(/locationRequest\.setMaxWaitTime\(\d+\);/, "locationRequest.setMaxWaitTime(60000);");

  fs.writeFileSync(file, src, "utf8");
  console.log("[patch-bg-geo] patched: NATIVE upload + Doze alarm + sticky service ✓");
  } else {
    console.log("[patch-bg-geo] java already patched ✓ (checking resources)");
  }

  // ---- also add alarm permissions to the app's AndroidManifest ----
  try {
    const manifest = path.join(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml");
    if (fs.existsSync(manifest)) {
      let mf = fs.readFileSync(manifest, "utf8");
      const perms = [
        '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
        '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
        '<uses-permission android:name="android.permission.WAKE_LOCK" />',
        '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
      ];
      let toAdd = perms.filter(p => !mf.includes(p));
      if (toAdd.length) {
        mf = mf.replace(/<uses-permission/, toAdd.join("\n    ") + "\n    <uses-permission");
        fs.writeFileSync(manifest, mf, "utf8");
        console.log("[patch-bg-geo] added alarm permissions to AndroidManifest ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] manifest note:", e.message); }

  // ---- set the tracking-notification icon to the Eurobond logo (string resource only,
  //      no code logic touched) ----
  try {
    const strings = path.join(__dirname, "..", "android", "app", "src", "main", "res", "values", "strings.xml");
    if (fs.existsSync(strings)) {
      let sx = fs.readFileSync(strings, "utf8");
      if (!sx.includes("capacitor_background_geolocation_notification_icon")) {
        sx = sx.replace(/<\/resources>/, '    <string name="capacitor_background_geolocation_notification_icon">drawable/ic_stat_notify</string>\n</resources>');
        fs.writeFileSync(strings, sx, "utf8");
        console.log("[patch-bg-geo] set tracking notification icon to Eurobond logo ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] strings note:", e.message); }
} catch (e) {
  console.log("[patch-bg-geo] skipped:", e.message);
}
