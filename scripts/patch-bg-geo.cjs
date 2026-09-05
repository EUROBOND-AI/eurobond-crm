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
    "import android.content.BroadcastReceiver;",
    "import android.content.IntentFilter;",
    "import android.location.LocationManager;",
    "import android.media.RingtoneManager;",
    "import android.media.Ringtone;",
    "import android.app.NotificationManager;",
    "import androidx.core.app.NotificationCompat;",
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

    /* ---- INSTANT location-off alert: a receiver fires the moment the user turns
       location OFF, and shows a loud notification + sound immediately (no delay). ---- */
    private BroadcastReceiver ebLocReceiver = null;
    private static Ringtone ebAlarmRingtone = null;
    private void ebRegisterLocReceiver() {
        if (ebLocReceiver != null) return;
        ebLocReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                try {
                    LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
                    boolean on = lm != null && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
                    ebPostGpsStatus(on);   // tell the server instantly (admin sees it live)
                    if (!on) { ebAlertLocationOff(); }
                    else { ebStopAlarmSound();
                        try { NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(74191); } catch (Exception e) {}
                    }
                } catch (Exception e) {}
            }
        };
        try { registerReceiver(ebLocReceiver, new IntentFilter("android.location.PROVIDERS_CHANGED")); } catch (Exception e) {}
    }
    /* Always keep a foreground "Tracking on" notification — uses the plugin's own
       notification when available, otherwise builds a native one so the notification
       ALWAYS comes back after the app is closed / swiped. */
    private void ebEnsureForeground() {
        try {
            Notification n = getNotification();
            if (n != null) { startForeground(NOTIFICATION_ID, n); return; }
            // fallback: build our own so the process stays foreground + notification shows
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pi = null;
            if (open != null) {
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                int fl = PendingIntent.FLAG_UPDATE_CURRENT;
                try { fl |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
                pi = PendingIntent.getActivity(getApplicationContext(), 74193, open, fl);
            }
            NotificationCompat.Builder b = new NotificationCompat.Builder(getApplicationContext(), "eurobond_crm")
                .setContentTitle("Eurobond CRM")
                .setContentText("Tracking on")
                .setSmallIcon(getResources().getIdentifier("ic_stat_notify", "drawable", getPackageName()))
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
            if (pi != null) b.setContentIntent(pi);
            startForeground(NOTIFICATION_ID, b.build());
        } catch (Exception e) {}
    }

    /* Android 8+ blocks starting a background service from an alarm/PendingIntent.
       getForegroundService() is the only way the service comes back once the app
       is fully closed — this is what makes the notification return every time. */
    private PendingIntent ebServicePI(int req, Intent i, int flag) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                return PendingIntent.getForegroundService(getApplicationContext(), req, i, flag);
            }
        } catch (Throwable t) {}
        return PendingIntent.getService(getApplicationContext(), req, i, flag);
    }
    private void ebStopAlarmSound() {
        try { if (ebAlarmRingtone != null && ebAlarmRingtone.isPlaying()) ebAlarmRingtone.stop(); } catch (Exception e) {}
    }
    /* POST the current GPS on/off state to the server so admin sees it instantly. */
    private void ebPostGpsStatus(final boolean on) {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    SharedPreferences prefs = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                    String sessionId = prefs.getString("eb_session_id", null);
                    String token = prefs.getString("eb_token", null);
                    String uploadUrl = prefs.getString("eb_upload_url", null);
                    if (sessionId == null || uploadUrl == null) return;
                    String base = uploadUrl.replace("action=points", "action=gpsstatus");
                    java.net.URL u = new java.net.URL(base);
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
                    c.setRequestMethod("POST");
                    c.setDoOutput(true);
                    c.setConnectTimeout(8000); c.setReadTimeout(8000);
                    c.setRequestProperty("Content-Type", "application/json");
                    if (token != null && token.length() > 0) c.setRequestProperty("Authorization", "Bearer " + token);
                    String q = String.valueOf((char) 34);
                    String body = "{" + q + "session_id" + q + ":" + sessionId + "," + q + "gps_on" + q + ":" + (on ? "true" : "false") + "}";
                    java.io.OutputStream os = c.getOutputStream();
                    os.write(body.getBytes("UTF-8")); os.flush(); os.close();
                    c.getResponseCode(); c.disconnect();
                } catch (Exception e) {}
            }
        }).start();
    }
    /* If the user disables notifications for the app (to dodge tracking), alert them
       with the same loud sound + a notification pushed on a different channel. */
    private void ebCheckNotificationsOn() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            boolean enabled = nm == null || nm.areNotificationsEnabled();
            if (!enabled) {
                // notifications are OFF so we can't show one — a single alert tone is the only way
                try {
                    Ringtone r = RingtoneManager.getRingtone(getApplicationContext(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
                    if (r != null) r.play();
                } catch (Exception e) {}
            }
        } catch (Exception e) {}
    }
    private void ebAlertLocationOff() {
        try {
            // sound comes WITH the notification itself (DEFAULT_ALL) — no separate looping song
            // high-priority notification the moment location goes off
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            // make sure a HIGH-importance channel exists so the sound plays outside the app
            try {
                if (android.os.Build.VERSION.SDK_INT >= 26 && nm != null) {
                    android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        "eurobond_alert", "Eurobond Tracking Alerts", NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("Alerts when location is turned off during attendance");
                    ch.enableVibration(true);
                    nm.createNotificationChannel(ch);
                }
            } catch (Exception e) {}
            NotificationCompat.Builder b = new NotificationCompat.Builder(getApplicationContext(), "eurobond_alert")
                .setContentTitle("⚠️ Location is OFF!")
                .setContentText("Attendance tracking stopped. Tap to turn ON location.")
                .setSmallIcon(getResources().getIdentifier("ic_stat_notify", "drawable", getPackageName()))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true);
            // tapping opens the app so the in-app "Turn ON Location" flow runs
            try {
                Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (open != null) {
                    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    int fl = PendingIntent.FLAG_UPDATE_CURRENT;
                    try { fl |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
                    PendingIntent pi = PendingIntent.getActivity(getApplicationContext(), 74192, open, fl);
                    b.setContentIntent(pi);
                }
            } catch (Exception e) {}
            if (nm != null) nm.notify(74191, b.build());
        } catch (Exception e) {}
    }

    private final Handler keepAliveHandler = new Handler(Looper.getMainLooper());
    private final Runnable keepAlive = new Runnable() {
        @Override public void run() {
            // ALWAYS re-assert the foreground notification (native fallback when the
            // plugin's own notification is gone after the app is closed/swiped), and
            // ALWAYS re-post this loop so the notification comes back within ~2s.
            ebEnsureForeground();
            for (Watcher w : watchers) {
                try {
                    w.client.removeLocationUpdates(w.locationCallback);
                    w.client.requestLocationUpdates(w.locationRequest, w.locationCallback, null);
                } catch (Exception e) {}
            }
            ebScheduleAlarm();   // keep a Doze-proof wakeup armed
            keepAliveHandler.postDelayed(this, 2000);
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
            PendingIntent pi = ebServicePI(4802, i, flag);
            long next = System.currentTimeMillis() + 120000; // ~2 min
            // setAlarmClock() is NOT throttled by Doze — it always fires on time, even in
            // deep sleep. This is the key to points flowing when the phone is idle for hours.
            try {
                PendingIntent show = ebServicePI(4803, i, flag);
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
        ebRegisterLocReceiver();   // start listening for location on/off instantly
        if (intent != null && "EB_ALARM_TICK".equals(intent.getAction())) {
            ebEnsureForeground();   // always keep the "Tracking on" notification visible
            // Wake the CPU so GPS can get a fix in deep Doze; auto-releases after 30s.
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "eurobond:tick");
                wl.acquire(30000);
            } catch (Exception e) {}
            ebCheckNotificationsOn();
            ebPollOnce();       // grab a fresh location on the alarm tick
            ebScheduleAlarm();  // re-arm for the next tick
            return START_STICKY;
        }
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 2000);
        ebScheduleAlarm();
        // Also keep a near-term backup alarm so if the notification is swiped away
        // while the app is closed, the service is re-created within a few seconds.
        try {
            AlarmManager am2 = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent bi = new Intent(getApplicationContext(), BackgroundGeolocationService.class);
            bi.setAction("EB_ALARM_TICK");
            int bflag = PendingIntent.FLAG_UPDATE_CURRENT;
            try { bflag |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
            PendingIntent bp = ebServicePI(4901, bi, bflag);
            long bnext = System.currentTimeMillis() + 5000;
            try {
                PendingIntent bshow = ebServicePI(4902, bi, bflag);
                am2.setAlarmClock(new AlarmManager.AlarmClockInfo(bnext, bshow), bp);
            } catch (Exception e) {
                try { am2.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, bnext, bp); }
                catch (Exception e2) { am2.set(AlarmManager.RTC_WAKEUP, bnext, bp); }
            }
        } catch (Exception e) {}
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        ebEnsureForeground();
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 500);
        ebScheduleAlarm();
        // Also schedule a full service restart ~1s after the app is swiped away, so
        // even if Android tears the service down it comes right back and keeps tracking.
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent ri = new Intent(getApplicationContext(), BackgroundGeolocationService.class);
            ri.setAction("EB_ALARM_TICK");
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            try { flag |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
            PendingIntent rp = ebServicePI(4899, ri, flag);
            long next = System.currentTimeMillis() + 1500;
            // setAlarmClock() is treated like a user alarm clock — MIUI/ColorOS/OneUI
            // are NOT allowed to kill it, so the service always comes back after swipe.
            try {
                PendingIntent show = ebServicePI(4900, ri, flag);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(next, show), rp);
            } catch (Exception e) {
                try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, rp); }
                catch (Exception e2) { am.set(AlarmManager.RTC_WAKEUP, next, rp); }
            }
        } catch (Exception e) {}
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        // If the service is destroyed for ANY reason (notification swiped while the app
        // is closed, OEM cleaner, low memory), schedule an immediate restart via an
        // alarm-clock alarm that MIUI/ColorOS cannot suppress. Keeps tracking + the
        // notification coming back even after the app is fully closed.
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(getApplicationContext(), BackgroundGeolocationService.class);
            i.setAction("EB_ALARM_TICK");
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            try { flag |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
            PendingIntent pi = ebServicePI(4903, i, flag);
            long next = System.currentTimeMillis() + 500;
            try {
                PendingIntent show = ebServicePI(4904, i, flag);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(next, show), pi);
            } catch (Exception e) {
                try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); }
                catch (Exception e2) { am.set(AlarmManager.RTC_WAKEUP, next, pi); }
            }
        } catch (Exception e) {}
        super.onDestroy();
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
        '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
        '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />',
      ];
      let toAdd = perms.filter(p => !mf.includes(p));
      if (toAdd.length) {
        mf = mf.replace(/<uses-permission/, toAdd.join("\n    ") + "\n    <uses-permission");
        fs.writeFileSync(manifest, mf, "utf8");
        console.log("[patch-bg-geo] added alarm permissions to AndroidManifest ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] manifest note:", e.message); }

  /* ---- KEY: make the tracking service survive app swipe-close ----
     The service is declared in the PLUGIN's own manifest, so patch that file.
     android:stopWithTask="false" keeps the foreground service (and its
     notification) running even after the user swipes the app from recents.
     This runs independently so it applies even on re-runs. */
  try {
    const pluginManifest = path.join(__dirname, "..", "node_modules", "@capacitor-community", "background-geolocation", "android", "src", "main", "AndroidManifest.xml");
    if (fs.existsSync(pluginManifest)) {
      let pm = fs.readFileSync(pluginManifest, "utf8");
      if (!pm.includes('android:stopWithTask')) {
        pm = pm.replace(/android:foregroundServiceType="location"\s*\/>/, 'android:foregroundServiceType="location"\n            android:stopWithTask="false" />');
        fs.writeFileSync(pluginManifest, pm, "utf8");
        console.log("[patch-bg-geo] plugin service now survives app swipe-close (stopWithTask=false) ✓");
      } else {
        console.log("[patch-bg-geo] plugin service already has stopWithTask ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] plugin manifest note:", e.message); }

  /* ---- foreground-service plugin: declare its service with foregroundServiceType
     so Android 10+/14+ actually starts it (otherwise startForegroundService fails). ---- */
  try {
    const fgsManifest = path.join(__dirname, "..", "node_modules", "@capawesome-team", "capacitor-android-foreground-service", "android", "src", "main", "AndroidManifest.xml");
    if (fs.existsSync(fgsManifest)) {
      let fm = fs.readFileSync(fgsManifest, "utf8");
      if (!fm.includes("AndroidForegroundService")) {
        const serviceXml = '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n' +
          '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />\n' +
          '    <application>\n' +
          '        <service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService"\n' +
          '            android:foregroundServiceType="location" android:exported="false" android:stopWithTask="false" />\n' +
          '    </application>\n';
        fm = fm.replace(/<\/manifest>/, serviceXml + "</manifest>");
        fs.writeFileSync(fgsManifest, fm, "utf8");
        console.log("[patch-bg-geo] foreground-service plugin: declared service with location type ✓");
      } else {
        console.log("[patch-bg-geo] foreground-service plugin already has service declaration ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] fgs manifest note:", e.message); }

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
