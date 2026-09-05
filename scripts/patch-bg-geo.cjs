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
    "import android.media.MediaPlayer;",
    "import android.media.AudioManager;",
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
    private static Ringtone ebAlarmRingtone = null;      // legacy field (unused now)
    private static MediaPlayer ebAlarmPlayer = null;     // looping alarm until location is back
    private final Handler ebAlertHandler = new Handler(Looper.getMainLooper());
    private boolean ebAlertRunning = false;

    private boolean ebLocationOn() {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            return lm != null && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
        } catch (Exception e) { return true; }
    }

    /* Repeats every 3s while location is OFF: keeps the alarm looping and re-posts the
       notification even if the user swipes it. Stops the instant location is back ON. */
    private final Runnable ebAlertLoop = new Runnable() {
        @Override public void run() {
            if (ebLocationOn()) { ebStopAlert(); return; }
            ebStartAlarmSound();
            ebShowLocationOffNotification();
            ebAlertHandler.postDelayed(this, 3000);
        }
    };

    private void ebStartAlert() {
        if (ebAlertRunning) return;
        ebAlertRunning = true;
        ebAlertHandler.removeCallbacks(ebAlertLoop);
        ebAlertHandler.post(ebAlertLoop);
    }
    private void ebStopAlert() {
        ebAlertRunning = false;
        ebAlertHandler.removeCallbacks(ebAlertLoop);
        ebStopAlarmSound();
        try { NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(74191); } catch (Exception e) {}
    }

    private void ebStartAlarmSound() {
        try {
            if (ebAlarmPlayer != null && ebAlarmPlayer.isPlaying()) return;
            if (ebAlarmPlayer == null) {
                ebAlarmPlayer = new MediaPlayer();
                ebAlarmPlayer.setDataSource(getApplicationContext(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
                try { ebAlarmPlayer.setAudioStreamType(AudioManager.STREAM_ALARM); } catch (Throwable t) {}
                ebAlarmPlayer.setLooping(true);
                ebAlarmPlayer.prepare();
            }
            ebAlarmPlayer.start();
        } catch (Exception e) {}
    }
    private void ebStopAlarmSound() {
        try { if (ebAlarmPlayer != null) { if (ebAlarmPlayer.isPlaying()) ebAlarmPlayer.stop(); ebAlarmPlayer.release(); ebAlarmPlayer = null; } } catch (Exception e) { ebAlarmPlayer = null; }
    }

    private void ebRegisterLocReceiver() {
        if (ebLocReceiver != null) return;
        ebLocReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                boolean on = ebLocationOn();
                ebPostGpsStatus(on);           // admin sees it instantly
                if (!on) ebStartAlert(); else ebStopAlert();
            }
        };
        try { registerReceiver(ebLocReceiver, new IntentFilter("android.location.PROVIDERS_CHANGED")); } catch (Exception e) {}
        // also check right away in case location was already off
        if (!ebLocationOn()) ebStartAlert();
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

    /* If the user disables notifications for the app (to dodge tracking), still make noise. */
    private void ebCheckNotificationsOn() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            boolean enabled = nm == null || nm.areNotificationsEnabled();
            if (!enabled && !ebLocationOn()) ebStartAlarmSound();
        } catch (Exception e) {}
    }

    private void ebShowLocationOffNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            try {
                if (android.os.Build.VERSION.SDK_INT >= 26 && nm != null) {
                    android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        "eb_alert_hi", "Eurobond Tracking Alerts", NotificationManager.IMPORTANCE_HIGH);
                    ch.setDescription("Alerts when location is turned off during attendance");
                    ch.enableVibration(true);
                    nm.createNotificationChannel(ch);
                }
            } catch (Exception e) {}
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pi = null;
            if (open != null) {
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int fl = PendingIntent.FLAG_UPDATE_CURRENT;
                try { fl |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
                pi = PendingIntent.getActivity(getApplicationContext(), 74192, open, fl);
            }
            NotificationCompat.Builder b = new NotificationCompat.Builder(getApplicationContext(), "eb_alert_hi")
                .setContentTitle("GPS is OFF")
                .setContentText("Attendance tracking stopped. Turn ON your location now.")
                .setSmallIcon(getResources().getIdentifier("ic_stat_notify", "drawable", getPackageName()))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)        // can't be swiped away while location is off
                .setAutoCancel(false)
                .setOnlyAlertOnce(true); // the looping alarm carries the sound
            if (pi != null) b.setContentIntent(pi);
            if (nm != null) nm.notify(74191, b.build());
        } catch (Exception e) {}
    }

    private void ebAlertLocationOff() { ebStartAlert(); }

    private boolean ebNotifWasVisible = false;

    /* Is our tracking notification still on screen? (used to detect a swipe) */
    private boolean ebNotifVisible() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return true;
                android.service.notification.StatusBarNotification[] act = nm.getActiveNotifications();
                if (act == null) return true;
                for (android.service.notification.StatusBarNotification sbn : act) {
                    if (sbn.getId() == NOTIFICATION_ID) return true;
                }
                return false;
            }
        } catch (Throwable t) { return true; }
        return true;
    }

    /* Keeps the "Tracking on" notification alive. It is re-asserted every second,
       but stays SILENT while it is on screen. Only when the user swipes it away
       does it come back WITH a sound, so they know tracking must stay on. */
    private void ebEnsureForeground() {
        try {
            boolean visible = ebNotifVisible();
            boolean swipedAway = ebNotifWasVisible && !visible;   // it was there, now it's gone

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
                .setPriority(swipedAway ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_LOW)
                /* silent on the every-second refresh; alerts only when it was swiped */
                .setOnlyAlertOnce(!swipedAway);
            if (swipedAway) b.setDefaults(NotificationCompat.DEFAULT_ALL);
            if (pi != null) b.setContentIntent(pi);

            startForeground(NOTIFICATION_ID, b.build());
            ebNotifWasVisible = true;
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
            keepAliveHandler.postDelayed(this, 1000);
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
            long next = System.currentTimeMillis() + 60000; // ~60s — brings the notification back sooner
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
            /* keep the 1s re-assert loop running after an alarm restart too —
               without this the notification never comes back once it is swiped
               while the app is closed. */
            keepAliveHandler.removeCallbacks(keepAlive);
            keepAliveHandler.postDelayed(keepAlive, 1000);
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

  /* ---- Firebase (FCM push): add the google-services Gradle plugin automatically
     so you never have to edit gradle files by hand. Only applies when
     android/app/google-services.json exists. ---- */
  try {
    const gsJson   = path.join(__dirname, "..", "android", "app", "google-services.json");
    const rootG    = path.join(__dirname, "..", "android", "build.gradle");
    const appG     = path.join(__dirname, "..", "android", "app", "build.gradle");
    if (fs.existsSync(gsJson) && fs.existsSync(rootG) && fs.existsSync(appG)) {
      let rg = fs.readFileSync(rootG, "utf8");
      if (!rg.includes("com.google.gms:google-services")) {
        rg = rg.replace(/(classpath\s+['"]com\.android\.tools\.build:gradle[^\n]*\n)/,
          "$1        classpath 'com.google.gms:google-services:4.4.2'\n");
        fs.writeFileSync(rootG, rg, "utf8");
        console.log("[patch-bg-geo] added google-services classpath to android/build.gradle ✓");
      }
      let ag = fs.readFileSync(appG, "utf8");
      if (!ag.includes("com.google.gms.google-services")) {
        ag = ag.trimEnd() + "\n\napply plugin: 'com.google.gms.google-services'\n";
        fs.writeFileSync(appG, ag, "utf8");
        console.log("[patch-bg-geo] applied google-services plugin to app/build.gradle ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] firebase gradle note:", e.message); }

  /* ---- FCM push notifications: use the Eurobond logo as the small icon and
     route them to our high-importance channel (otherwise Android shows a
     generic grey square). ---- */
  try {
    const appManifest = path.join(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml");
    if (fs.existsSync(appManifest)) {
      let am = fs.readFileSync(appManifest, "utf8");
      if (!am.includes("default_notification_icon")) {
        const meta =
          '        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" />\n' +
          '        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="eurobond_crm" />\n';
        am = am.replace(/([ \t]*<\/application>)/, meta + "$1");
        fs.writeFileSync(appManifest, am, "utf8");
        console.log("[patch-bg-geo] FCM notifications now use the Eurobond logo icon ✓");
      } else {
        console.log("[patch-bg-geo] FCM notification icon already set ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] fcm icon note:", e.message); }



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
