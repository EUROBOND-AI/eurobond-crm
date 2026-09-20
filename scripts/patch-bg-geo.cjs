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

  /* Bump this whenever the native Java changes, so an old patched copy is
     detected and repatched instead of being silently skipped. */
  const PATCH_VERSION = "EB_PATCH_V3_BATTERY_NET";
  const alreadyPatched = src.includes(PATCH_VERSION);
  if (src.includes("EB_NATIVE_UPLOAD") && !alreadyPatched) {
    console.log("[patch-bg-geo] older patch found — reinstall the plugin so the new native code applies:");
    console.log("   npm uninstall @capacitor-community/background-geolocation");
    console.log("   npm install @capacitor-community/background-geolocation@1.2.26");
    console.log("   node scripts/patch-bg-geo.cjs");
  }

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

    // EB_NATIVE_UPLOAD EB_PATCH_V3_BATTERY_NET: post a location straight to the server from native code,
    // so uploads work even when the JS/WebView is frozen in the background.
    private long ebLastUploadMs = 0;
    private com.google.android.gms.location.FusedLocationProviderClient ebSelfClient = null;
    private com.google.android.gms.location.LocationCallback ebSelfCallback = null;

    /* After the phone kills the app, the service comes back with an EMPTY watcher
       list (watchers are registered by the JS side). Drive location ourselves in
       that case, otherwise the service runs and shows its notification but never
       records a single point. */
    private void ebStartSelfUpdates() {
        try {
            if (!ebSessionActive()) return;
            if (!watchers.isEmpty()) return;
            if (ebSelfCallback != null) return;
            ebSelfClient = com.google.android.gms.location.LocationServices
                .getFusedLocationProviderClient(getApplicationContext());
            com.google.android.gms.location.LocationRequest lr =
                com.google.android.gms.location.LocationRequest.create();
            lr.setPriority(com.google.android.gms.location.LocationRequest.PRIORITY_HIGH_ACCURACY);
            lr.setInterval(60000);
            lr.setFastestInterval(30000);
            ebSelfCallback = new com.google.android.gms.location.LocationCallback() {
                @Override public void onLocationResult(com.google.android.gms.location.LocationResult r) {
                    if (r != null && r.getLastLocation() != null) ebUploadLocation(r.getLastLocation());
                }
            };
            ebSelfClient.requestLocationUpdates(lr, ebSelfCallback, Looper.getMainLooper());
        } catch (Throwable t) {}
    }

    /* ---- Offline queue (native) ----
       If a point cannot reach the server (no network, weak signal), keep it in
       SharedPreferences and send it with the next successful upload, so the
       timeline has no gaps. ---- */
    private void ebQueuePoint(String ptJson) {
        try {
            SharedPreferences p = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String q = p.getString("eb_native_queue", "");
            /* an overnight stretch with no network is ~1200 points, so the old
               60 KB cap silently dropped almost all of them */
            if (q.length() > 900000) return;                 // safety cap
            p.edit().putString("eb_native_queue", q.isEmpty() ? ptJson : q + "|" + ptJson).apply();
        } catch (Exception e) {}
    }
    private JSONArray ebTakeQueue() {
        JSONArray arr = new JSONArray();
        try {
            SharedPreferences p = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String q = p.getString("eb_native_queue", "");
            if (q.isEmpty()) return arr;
            for (String part : q.split(java.util.regex.Pattern.quote(String.valueOf((char) 124)))) {
                if (part == null || part.trim().isEmpty()) continue;
                try { arr.put(new JSONObject(part)); } catch (Exception e) {}
            }
        } catch (Exception e) {}
        return arr;
    }
    private void ebClearQueue() {
        try {
            getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                .edit().remove("eb_native_queue").apply();
        } catch (Exception e) {}
    }
    private void ebUploadLocation(final Location location) {
        if (location == null) return;
        final long now = System.currentTimeMillis();
        // one upload per ~14 min (matches the 15-min timeline; server also spaces)
        // upload continuously — the distance is only right when the points follow
        // the road rather than jumping between far-apart fixes
        if (ebLastUploadMs != 0 && (now - ebLastUploadMs) < 25 * 1000) return;
        new Thread(new Runnable() {
            @Override public void run() {
                final String[] ptHolder = new String[1];
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
                    /* a very vague fix is a tower estimate, not a position —
                       storing those is what made a parked phone gain kilometres */
                    if (location.getAccuracy() > 60f && ebLastUploadMs != 0) return;
                    pt.put("time", location.getTime() > 0 ? location.getTime() : now);
                    /* real battery % and network state for the admin timeline */
                    try {
                        android.content.IntentFilter bf = new android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED);
                        android.content.Intent bi = getApplicationContext().registerReceiver(null, bf);
                        if (bi != null) {
                            int lvl = bi.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                            int scl = bi.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                            if (lvl >= 0 && scl > 0) pt.put("battery", Math.round(lvl * 100f / scl));
                        }
                    } catch (Exception be) {}
                    boolean netUp = true;
                    try {
                        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                        android.net.NetworkInfo ni = cm != null ? cm.getActiveNetworkInfo() : null;
                        netUp = ni != null && ni.isConnected();
                    } catch (Exception ne) {}
                    pt.put("online", netUp);
                    ptHolder[0] = pt.toString();
                    JSONArray arr = ebTakeQueue();      // anything held from earlier
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
                    int rc = c.getResponseCode();
                    /* mark the slot as used ONLY on success, so a failed upload is
                       retried on the next alarm tick instead of being dropped */
                    if (rc >= 200 && rc < 300) {
                        ebLastUploadMs = now; ebClearQueue();
                        /* network is back — push any GPS on/off change that couldn't be sent */
                        try {
                            String pend = prefs.getString("eb_pending_gps_status", null);
                            if (pend != null) ebPostGpsStatus("1".equals(pend));
                        } catch (Exception e3) {}
                    }
                    else ebQueuePoint(pt.toString());
                    /* if the server says this session is closed (10:30 PM auto-logout or
                       manual stop), clear the stored session so the service shuts down. */
                    try {
                        java.io.InputStream is = (rc >= 200 && rc < 300) ? c.getInputStream() : c.getErrorStream();
                        if (is != null) {
                            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                            byte[] buf = new byte[512]; int n;
                            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
                            String body2 = new String(bo.toByteArray(), "UTF-8");
                            is.close();
                            if (body2.contains(String.valueOf((char) 34) + "stopped" + String.valueOf((char) 34)) || rc == 403) {
                                SharedPreferences p2 = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                                p2.edit().remove("eb_session_id").apply();
                            }
                        }
                    } catch (Exception e2) {}
                    c.disconnect();
                } catch (Exception e) {
                    /* no network -> hold the point and send it next time */
                    try { if (ptHolder[0] != null) ebQueuePoint(ptHolder[0]); } catch (Exception e2) {} }
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

    /* ---- What else can stop tracking? Network, notifications and battery
       optimisation are checked here too, so the alarm fires for all of them even
       when the app is closed. Returns "" when everything is fine. ---- */
    private String ebProblem() {
        if (!ebLocationOn()) return "Location is switched off";

        try {
            androidx.core.app.NotificationManagerCompat nmc = androidx.core.app.NotificationManagerCompat.from(getApplicationContext());
            if (!nmc.areNotificationsEnabled()) return "Notifications are switched off";
        } catch (Exception e) {}
        try {
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName()))
                    return "Battery optimisation is ON for this app";
            }
        } catch (Exception e) {}
        return "";
    }

    /* Repeats every 3s while something is wrong: keeps the alarm looping and re-posts
       the notification even if the user swipes it. Stops the instant it is fixed. */
    private String ebLastProblem = "";
    private String ebLastReported = "";
    private final Runnable ebAlertLoop = new Runnable() {
        @Override public void run() {
            String prob = ebProblem();
            if (prob.length() == 0) { ebStopAlert(); return; }
            ebLastProblem = prob;
            ebStartAlarmSound();
            ebShowLocationOffNotification();
            ebShowOverlay(prob);
            ebAlertHandler.postDelayed(this, 3000);
        }
    };

    private void ebStartAlert() {
        if (ebAlertRunning) return;
        ebAlertRunning = true;
        ebAlertHandler.removeCallbacks(ebAlertLoop);
        ebAlertHandler.post(ebAlertLoop);
    }

    /* ---- Full-screen warning drawn OVER other apps ----
       When the person switches notifications off we cannot post a notification,
       so the warning is drawn as a system overlay instead. Needs the
       "Display over other apps" permission; without it we still make the sound. */
    private android.view.View ebOverlayView = null;
    private void ebShowOverlay(final String why) {
        try {
            if (ebOverlayView != null) return;
            if (android.os.Build.VERSION.SDK_INT >= 23 && !android.provider.Settings.canDrawOverlays(getApplicationContext())) return;
            final android.view.WindowManager wm = (android.view.WindowManager) getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return;
            ebAlertHandler.post(new Runnable() { @Override public void run() {
                try {
                    if (ebOverlayView != null) return;
                    android.widget.LinearLayout box = new android.widget.LinearLayout(getApplicationContext());
                    box.setOrientation(android.widget.LinearLayout.VERTICAL);
                    box.setBackgroundColor(android.graphics.Color.parseColor("#F2C0392B"));
                    int pad = (int) (22 * getResources().getDisplayMetrics().density);
                    box.setPadding(pad, pad, pad, pad);
                    box.setGravity(android.view.Gravity.CENTER);

                    android.widget.TextView t1 = new android.widget.TextView(getApplicationContext());
                    t1.setText("Tracking Interrupted!");
                    t1.setTextColor(android.graphics.Color.WHITE);
                    t1.setTextSize(21);
                    t1.setGravity(android.view.Gravity.CENTER);
                    t1.setTypeface(null, android.graphics.Typeface.BOLD);

                    android.widget.TextView t2 = new android.widget.TextView(getApplicationContext());
                    t2.setText(why + ". Attendance tracking has stopped. Turn it back ON now.");
                    t2.setTextColor(android.graphics.Color.WHITE);
                    t2.setTextSize(14);
                    t2.setGravity(android.view.Gravity.CENTER);
                    t2.setPadding(0, pad / 2, 0, pad / 2);

                    android.widget.Button btn = new android.widget.Button(getApplicationContext());
                    btn.setText("FIX NOW");
                    btn.setOnClickListener(new android.view.View.OnClickListener() {
                        @Override public void onClick(android.view.View v) {
                            try {
                                Intent op = getPackageManager().getLaunchIntentForPackage(getPackageName());
                                if (op != null) { op.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(op); }
                            } catch (Throwable t) {}
                        }
                    });

                    box.addView(t1); box.addView(t2); box.addView(btn);

                    int type = android.os.Build.VERSION.SDK_INT >= 26
                        ? android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : android.view.WindowManager.LayoutParams.TYPE_PHONE;
                    android.view.WindowManager.LayoutParams lp = new android.view.WindowManager.LayoutParams(
                        android.view.WindowManager.LayoutParams.MATCH_PARENT,
                        android.view.WindowManager.LayoutParams.WRAP_CONTENT,
                        type,
                        android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
                        android.graphics.PixelFormat.TRANSLUCENT);
                    lp.gravity = android.view.Gravity.TOP;
                    wm.addView(box, lp);
                    ebOverlayView = box;
                } catch (Throwable t) {}
            }});
        } catch (Throwable t) {}
    }
    private void ebHideOverlay() {
        try {
            final android.view.View v = ebOverlayView;
            if (v == null) return;
            ebOverlayView = null;
            ebAlertHandler.post(new Runnable() { @Override public void run() {
                try {
                    android.view.WindowManager wm = (android.view.WindowManager) getSystemService(Context.WINDOW_SERVICE);
                    if (wm != null) wm.removeView(v);
                } catch (Throwable t) {}
            }});
        } catch (Throwable t) {}
    }

    private void ebStopAlert() {
        ebAlertRunning = false;
        ebHideOverlay();
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
                if (!ebSessionActive()) { ebStopAlert(); return; }   // attendance not running
                boolean on = ebLocationOn();
                ebPostGpsStatus(on);           // admin sees it instantly
                if (ebProblem().length() > 0) ebStartAlert(); else ebStopAlert();
            }
        };
        try {
            IntentFilter f = new IntentFilter("android.location.PROVIDERS_CHANGED");
            f.addAction("android.net.conn.CONNECTIVITY_CHANGE");   // data / Wi-Fi switched off
            registerReceiver(ebLocReceiver, f);
        } catch (Exception e) {}
        // also check right away in case something was already off
        if (ebSessionActive() && ebProblem().length() > 0) ebStartAlert();
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
                    String why = ebProblem();
                    String shortWhy = "";
                    if (why.length() > 0) {
                        if (why.contains("data")) shortWhy = "Net Off";
                        else if (why.contains("Notification")) shortWhy = "Notifications Off";
                        else if (why.contains("Battery")) shortWhy = "Battery Optimisation ON";
                        else shortWhy = "Location Off";
                    }
                    String body = "{" + q + "session_id" + q + ":" + sessionId + "," + q + "gps_on" + q + ":"
                        + (on ? "true" : "false") + "," + q + "reason" + q + ":" + q + shortWhy + q + "}";
                    java.io.OutputStream os = c.getOutputStream();
                    os.write(body.getBytes("UTF-8")); os.flush(); os.close();
                    int rc2 = c.getResponseCode();
                    c.disconnect();
                    if (rc2 >= 200 && rc2 < 300) {
                        prefs.edit().remove("eb_pending_gps_status").apply();
                    } else {
                        prefs.edit().putString("eb_pending_gps_status", on ? "1" : "0").apply();
                    }
                } catch (Exception e) {
                    try {
                        getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
                            .edit().putString("eb_pending_gps_status", on ? "1" : "0").apply();
                    } catch (Exception e2) {}
                }
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
                    ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
                    ch.setBypassDnd(true);
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
            String why = (ebLastProblem == null || ebLastProblem.length() == 0)
                ? "Location is switched off" : ebLastProblem;
            NotificationCompat.Builder b = new NotificationCompat.Builder(getApplicationContext(), "eb_alert_hi")
                .setContentTitle("Tracking Interrupted!")
                .setContentText(why + ". Attendance tracking has stopped — fix it now.")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                    why + ". Attendance tracking has stopped. Turn it back ON - the alarm stops the moment you do."))
                .setSmallIcon(getResources().getIdentifier("ic_stat_notify", "drawable", getPackageName()))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)        // can't be swiped away while location is off
                .setAutoCancel(false)
                .setOnlyAlertOnce(true); // the looping alarm carries the sound
            if (pi != null) {
                b.setContentIntent(pi);
                /* shows as a heads-up banner over any app, and full-screen on a
                   locked phone — this is what makes it visible outside the app */
                b.setFullScreenIntent(pi, true);
            }
            if (nm != null) nm.notify(74191, b.build());
        } catch (Exception e) {}
    }

    private void ebAlertLocationOff() { ebStartAlert(); }

    /* Tracking is only "active" while an attendance session id is stored.
       When the person stops attendance we clear it, and the service shuts
       itself down — no Tracking notification, no location alarm. */
    private boolean ebSessionActive() {
        try {
            SharedPreferences p = getApplicationContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String sid = p.getString("eb_session_id", null);
            return sid != null && sid.length() > 0 && !"null".equals(sid);
        } catch (Exception e) { return false; }
    }
    private void ebShutdownTracking() {
        try { ebStopAlert(); } catch (Exception e) {}
        try { keepAliveHandler.removeCallbacks(keepAlive); } catch (Exception e) {}
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            Intent i = new Intent(getApplicationContext(), BackgroundGeolocationService.class);
            i.setAction("EB_ALARM_TICK");
            int flag = PendingIntent.FLAG_UPDATE_CURRENT;
            try { flag |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}
            int[] codes = new int[]{4802, 4803, 4899, 4900, 4901, 4902, 4903, 4904};
            for (int c : codes) { try { am.cancel(ebServicePI(c, i, flag)); } catch (Exception e) {} }
        } catch (Exception e) {}
        try { if (ebLocReceiver != null) { unregisterReceiver(ebLocReceiver); ebLocReceiver = null; } } catch (Exception e) {}
        try { stopForeground(true); } catch (Exception e) {}
        try { stopSelf(); } catch (Exception e) {}
    }

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
        } catch (Throwable e) {
            /* If the user disabled notifications, startForeground can throw and the
               service would die with it. Keep the service alive and make sure the
               wake-up alarm is re-armed so tracking carries on regardless. */
            try { ebScheduleAlarm(); } catch (Throwable t) {}
        }
    }

    /* Notifications can be switched off mid-day (some people do it to dodge
       tracking). Android then hides our foreground notification, so we re-assert
       the foreground state on every tick and re-arm the alarm — tracking resumes
       by itself the moment notifications are switched back on, with no need to
       open the app. */
    private void ebReassertForeground() {
        try { ebEnsureForeground(); } catch (Throwable t) {}
        try { ebScheduleAlarm(); } catch (Throwable t) {}
    }

    private final Handler keepAliveHandler = new Handler(Looper.getMainLooper());
    private final Runnable keepAlive = new Runnable() {
        @Override public void run() {
            if (!ebSessionActive()) { ebShutdownTracking(); return; }
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
            /* push a status change to the server the moment it happens */
            try {
                String nowProb = ebProblem();
                if (!nowProb.equals(ebLastReported)) {
                    ebLastReported = nowProb;
                    ebPostGpsStatus(nowProb.length() == 0);
                    if (nowProb.length() > 0) ebStartAlert(); else ebStopAlert();
                }
            } catch (Throwable t) {}
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
            long next = System.currentTimeMillis() + 30000; // ~30s — matches the point cadence

            /* A second alarm aimed at the manifest receiver. A receiver runs even
               when the service itself can't be started (notifications switched off,
               process killed), so this is what revives tracking on its own. */
            try {
                Intent rx = new Intent("com.eurobond.crm.EB_WAKE");
                rx.setClass(getApplicationContext(), EbWakeReceiver.class);
                PendingIntent rpi = PendingIntent.getBroadcast(getApplicationContext(), 4804, rx, flag);
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next + 5000, rpi);
            } catch (Throwable t) {}
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
        /* After the phone kills the app the service comes back with an EMPTY
           watcher list (watchers are added by the JS side when tracking starts),
           so nothing fetched a location and no points arrived. Fetch one with our
           own client in that case. */
        if (watchers.isEmpty() && ebSessionActive()) {
            ebStartSelfUpdates();
            try {
                final com.google.android.gms.location.FusedLocationProviderClient fc =
                    com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(getApplicationContext());
                fc.getCurrentLocation(100, null)
                    .addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<Location>() {
                        @Override public void onSuccess(Location loc) {
                            if (loc != null) ebUploadLocation(loc);
                        }
                    });
            } catch (Throwable t) {
                try {
                    com.google.android.gms.location.FusedLocationProviderClient fc2 =
                        com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(getApplicationContext());
                    fc2.getLastLocation().addOnSuccessListener(new com.google.android.gms.tasks.OnSuccessListener<Location>() {
                        @Override public void onSuccess(Location loc) {
                            if (loc != null) ebUploadLocation(loc);
                        }
                    });
                } catch (Throwable t2) {}
            }
            return;
        }
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
        if (!ebSessionActive()) { ebShutdownTracking(); return START_NOT_STICKY; }
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
            /* Check on every alarm wake, not only inside the 1s loop — that loop
               stops when the phone freezes the app, which is exactly when the
               alarm is the only thing still running. */
            try {
                String tickProb = ebProblem();
                if (tickProb.length() > 0) { ebStartAlert(); ebShowOverlay(tickProb); }
                else ebStopAlert();
                if (!tickProb.equals(ebLastReported)) {
                    ebLastReported = tickProb;
                    ebPostGpsStatus(tickProb.length() == 0);
                }
            } catch (Throwable t) {}
            ebStartSelfUpdates();   // fresh process -> no watchers, so drive it ourselves
            ebPollOnce();       // grab a fresh location on the alarm tick
            ebScheduleAlarm();  // re-arm for the next tick
            /* keep the 1s re-assert loop running after an alarm restart too —
               without this the notification never comes back once it is swiped
               while the app is closed. */
            keepAliveHandler.removeCallbacks(keepAlive);
            keepAliveHandler.postDelayed(keepAlive, 1000);
            return START_STICKY;
        }
        ebEnsureForeground();          // bring "Tracking on" back straight away
        ebStartSelfUpdates();          // and start collecting points again
        keepAliveHandler.removeCallbacks(keepAlive);
        keepAliveHandler.postDelayed(keepAlive, 1000);
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
        '<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />',
        '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />',
        '<uses-permission android:name="android.permission.WAKE_LOCK" />',
        '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
        '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
        '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />',
        '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
      ];
      /* strip a permission an older build added — Play only allows it for
         alarm-clock / calendar apps, and setAlarmClock does not need it */
      if (mf.includes("android.permission.USE_EXACT_ALARM")) {
        mf = mf.replace(/[ \t]*<uses-permission android:name="android\.permission\.USE_EXACT_ALARM"[^>]*\/>\s*\n?/g, "");
        fs.writeFileSync(manifest, mf, "utf8");
        console.log("[patch-bg-geo] removed USE_EXACT_ALARM (Play restricts it) ✓");
      }
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

  /* ---- register EbWakeReceiver in the plugin manifest so it survives the
     service being killed ---- */
  try {
    const pm = path.join(__dirname, "..", "node_modules", "@capacitor-community",
      "background-geolocation", "android", "src", "main", "AndroidManifest.xml");
    if (fs.existsSync(pm)) {
      let x = fs.readFileSync(pm, "utf8");
      if (!x.includes("EbWakeReceiver")) {
        const rxXml = '        <receiver android:name="com.equimaps.capacitor_background_geolocation.EbWakeReceiver"\n' +
                      '            android:exported="false" android:enabled="true"\n' +
                      '            android:process=":ebwake">\n' +
                      '            <intent-filter>\n' +
                      '                <action android:name="com.eurobond.crm.EB_WAKE" />\n' +
                      '                <action android:name="android.intent.action.BOOT_COMPLETED" />\n' +
                      '                <action android:name="android.app.action.APP_BLOCK_STATE_CHANGED" />\n' +
                      '                <action android:name="android.app.action.NOTIFICATION_CHANNEL_BLOCK_STATE_CHANGED" />\n' +
                      '                <action android:name="android.net.conn.CONNECTIVITY_CHANGE" />\n' +
                      '                <action android:name="android.location.PROVIDERS_CHANGED" />\n' +
                      '                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />\n' +
                      '            </intent-filter>\n' +
                      '        </receiver>\n';
        if (x.includes("</application>")) x = x.replace("</application>", rxXml + "    </application>");
        else x = x.replace(/<\/manifest>/, "    <application>\n" + rxXml + "    </application>\n</manifest>");
        fs.writeFileSync(pm, x, "utf8");
        console.log("[patch-bg-geo] wake receiver registered \u2713");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] receiver manifest note:", e.message); }


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

  /* ---- Play Store release signing: wire keystore.properties into the Gradle
     build so `assembleRelease` / `bundleRelease` produces a signed artifact.
     Only applies when android/keystore.properties exists. ---- */
  try {
    const props = path.join(__dirname, "..", "android", "keystore.properties");
    const appG = path.join(__dirname, "..", "android", "app", "build.gradle");
    if (fs.existsSync(props) && fs.existsSync(appG)) {
      let ag = fs.readFileSync(appG, "utf8");
      if (!ag.includes("EB_RELEASE_SIGNING")) {
        const head =
          "// EB_RELEASE_SIGNING\n" +
          "def keystorePropertiesFile = rootProject.file('keystore.properties')\n" +
          "def keystoreProperties = new Properties()\n" +
          "if (keystorePropertiesFile.exists()) { keystoreProperties.load(new FileInputStream(keystorePropertiesFile)) }\n\n";
        ag = head + ag;
        ag = ag.replace(/android\s*\{/, `android {
    signingConfigs {
        release {
            if (keystoreProperties['storeFile']) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }`);
        ag = ag.replace(/buildTypes\s*\{\s*release\s*\{/, `buildTypes {
        release {
            signingConfig signingConfigs.release`);
        fs.writeFileSync(appG, ag, "utf8");
        console.log("[patch-bg-geo] release signing wired into app/build.gradle ✓");
      } else {
        console.log("[patch-bg-geo] release signing already configured ✓");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] signing note:", e.message); }

  /* ---- EB_WAKE_RECEIVER: a manifest-registered receiver that restarts the
     tracking service. A receiver still runs even when the service itself could
     not start (for example while notifications were switched off), so this is
     what brings tracking back by itself once the user fixes the setting. ---- */
  try {
    const pkgDir = path.join(__dirname, "..", "node_modules", "@capacitor-community",
      "background-geolocation", "android", "src", "main", "java", "com", "equimaps",
      "capacitor_background_geolocation");
    const rxFile = path.join(pkgDir, "EbWakeReceiver.java");
    if (fs.existsSync(pkgDir)) {
      const rx = [
        "package com.equimaps.capacitor_background_geolocation;",
        "",
        "import android.app.AlarmManager;",
        "import android.app.PendingIntent;",
        "import android.content.BroadcastReceiver;",
        "import android.content.Context;",
        "import android.content.Intent;",
        "import android.content.SharedPreferences;",
        "import android.graphics.Color;",
        "import android.graphics.PixelFormat;",
        "import android.location.LocationManager;",
        "import android.media.AudioManager;",
        "import android.media.MediaPlayer;",
        "import android.media.RingtoneManager;",
        "import android.os.Build;",
        "import android.os.Handler;",
        "import android.os.Looper;",
        "import android.os.PowerManager;",
        "import android.provider.Settings;",
        "import android.view.Gravity;",
        "import android.view.View;",
        "import android.view.WindowManager;",
        "import android.widget.Button;",
        "import android.widget.LinearLayout;",
        "import android.widget.TextView;",
        "",
        "/* Runs even when the tracking service has been killed (for example after",
        "   the user switched notifications off), so the alarm, the warning overlay",
        "   and the restart of tracking never depend on the service being alive. */",
        "public class EbWakeReceiver extends BroadcastReceiver {",
        "    private static MediaPlayer player = null;",
        "    private static View overlay = null;",
        "",
        "    private static String problem(Context ctx) {",
        "        try {",
        "            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);",
        "            boolean on = lm != null && (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)",
        "                || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));",
        "            if (!on) return \"Location is switched off\";",
        "        } catch (Throwable t) {}",
        "        try {",
        "            androidx.core.app.NotificationManagerCompat nmc = androidx.core.app.NotificationManagerCompat.from(ctx);",
        "            if (!nmc.areNotificationsEnabled()) return \"Notifications are switched off\";",
        "        } catch (Throwable t) {}",
        "        try {",
        "            if (Build.VERSION.SDK_INT >= 23) {",
        "                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);",
        "                if (pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName()))",
        "                    return \"Battery optimisation is ON for this app\";",
        "            }",
        "        } catch (Throwable t) {}",
        "        return \"\";",
        "    }",
        "",
        "    private static long soundStartedAt = 0;",
        "    private static void startSound(Context ctx) {",
        "        try {",
        "            if (player != null && player.isPlaying()) {",
        "                if (System.currentTimeMillis() - soundStartedAt > 90000) stopSound();",
        "                else return;",
        "            }",
        "            soundStartedAt = System.currentTimeMillis();",
        "            android.net.Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);",
        "            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);",
        "            player = new MediaPlayer();",
        "            player.setDataSource(ctx, u);",
        "            player.setAudioStreamType(AudioManager.STREAM_ALARM);",
        "            player.setLooping(true);",
        "            player.prepare();",
        "            player.start();",
        "        } catch (Throwable t) {}",
        "    }",
        "    private static void stopSound() {",
        "        try { if (player != null) { player.stop(); player.release(); } } catch (Throwable t) {}",
        "        player = null;",
        "    }",
        "",
        "    private static void showOverlay(final Context ctx, final String why) {",
        "        try {",
        "            if (overlay != null) return;",
        "            if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(ctx)) return;",
        "            new Handler(Looper.getMainLooper()).post(new Runnable() { public void run() {",
        "                try {",
        "                    if (overlay != null) return;",
        "                    WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);",
        "                    if (wm == null) return;",
        "                    LinearLayout box = new LinearLayout(ctx);",
        "                    box.setOrientation(LinearLayout.VERTICAL);",
        "                    box.setBackgroundColor(Color.parseColor(\"#F2C0392B\"));",
        "                    int pad = (int) (22 * ctx.getResources().getDisplayMetrics().density);",
        "                    box.setPadding(pad, pad, pad, pad);",
        "                    box.setGravity(Gravity.CENTER);",
        "                    TextView t1 = new TextView(ctx);",
        "                    t1.setText(\"Tracking Interrupted!\");",
        "                    t1.setTextColor(Color.WHITE); t1.setTextSize(21);",
        "                    t1.setGravity(Gravity.CENTER);",
        "                    TextView t2 = new TextView(ctx);",
        "                    t2.setText(why + \". Attendance tracking has stopped. Turn it back ON now.\");",
        "                    t2.setTextColor(Color.WHITE); t2.setTextSize(14);",
        "                    t2.setGravity(Gravity.CENTER);",
        "                    t2.setPadding(0, pad / 2, 0, pad / 2);",
        "                    android.widget.LinearLayout row = new android.widget.LinearLayout(ctx);",
        "                    row.setOrientation(android.widget.LinearLayout.HORIZONTAL);",
        "                    row.setGravity(Gravity.CENTER);",
        "",
        "                    /* Allow: opens this app's notification settings straight away */",
        "                    Button bAllow = new Button(ctx);",
        "                    bAllow.setText(\"ALLOW\");",
        "                    bAllow.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {",
        "                        try {",
        "                            Intent si = new Intent(\"android.settings.APP_NOTIFICATION_SETTINGS\");",
        "                            si.putExtra(\"android.provider.extra.APP_PACKAGE\", ctx.getPackageName());",
        "                            si.putExtra(\"app_package\", ctx.getPackageName());",
        "                            si.putExtra(\"app_uid\", ctx.getApplicationInfo().uid);",
        "                            si.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);",
        "                            ctx.startActivity(si);",
        "                        } catch (Throwable t) {",
        "                            try {",
        "                                Intent di = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);",
        "                                di.setData(android.net.Uri.parse(\"package:\" + ctx.getPackageName()));",
        "                                di.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);",
        "                                ctx.startActivity(di);",
        "                            } catch (Throwable t2) {}",
        "                        }",
        "                    }});",
        "",
        "                    /* Don't allow: hides this banner for a moment, but the alarm keeps",
        "                       running and the banner comes back until it is actually fixed. */",
        "                    Button bNo = new Button(ctx);",
        "                    bNo.setText(\"DON\u0027T ALLOW\");",
        "                    bNo.setOnClickListener(new View.OnClickListener() { public void onClick(View v) {",
        "                        try { hideOverlay(ctx); } catch (Throwable t) {}",
        "                    }});",
        "",
        "                    row.addView(bAllow); row.addView(bNo);",
        "                    box.addView(t1); box.addView(t2); box.addView(row);",
        "                    int type = Build.VERSION.SDK_INT >= 26",
        "                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY",
        "                        : WindowManager.LayoutParams.TYPE_PHONE;",
        "                    WindowManager.LayoutParams lp = new WindowManager.LayoutParams(",
        "                        WindowManager.LayoutParams.MATCH_PARENT,",
        "                        WindowManager.LayoutParams.WRAP_CONTENT, type,",
        "                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE",
        "                            | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED",
        "                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,",
        "                        PixelFormat.TRANSLUCENT);",
        "                    lp.gravity = Gravity.TOP;",
        "                    wm.addView(box, lp);",
        "                    overlay = box;",
        "                } catch (Throwable t) {}",
        "            }});",
        "        } catch (Throwable t) {}",
        "    }",
        "    private static void hideOverlay(final Context ctx) {",
        "        final View v = overlay;",
        "        if (v == null) return;",
        "        overlay = null;",
        "        new Handler(Looper.getMainLooper()).post(new Runnable() { public void run() {",
        "            try {",
        "                WindowManager wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);",
        "                if (wm != null) wm.removeView(v);",
        "            } catch (Throwable t) {}",
        "        }});",
        "    }",
        "",
        "    private static void rearm(Context ctx) {",
        "        try {",
        "            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);",
        "            Intent rx = new Intent(\"com.eurobond.crm.EB_WAKE\");",
        "            rx.setClass(ctx, EbWakeReceiver.class);",
        "            int fl = PendingIntent.FLAG_UPDATE_CURRENT;",
        "            try { fl |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}",
        "            PendingIntent pi = PendingIntent.getBroadcast(ctx, 4804, rx, fl);",
        "            long next = System.currentTimeMillis() + (problem(ctx).length() > 0 ? 8000 : 20000);",
        "            if (am == null) return;",
        "            try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi); }",
        "            catch (Throwable t) { am.set(AlarmManager.RTC_WAKEUP, next, pi); }",
        "        } catch (Throwable t) {}",
        "    }",
        "",
        "    @Override public void onReceive(Context ctx, Intent intent) {",
        "        Context app = ctx.getApplicationContext();",
        "        PowerManager.WakeLock wl = null;",
        "        try {",
        "            PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);",
        "            if (pm != null) {",
        "                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, \"eurobond:wake\");",
        "                wl.acquire(15000);",
        "            }",
        "        } catch (Throwable t) {}",
        "        try {",
        "            SharedPreferences p = app.getSharedPreferences(\"CapacitorStorage\", Context.MODE_PRIVATE);",
        "            String sid = p.getString(\"eb_session_id\", null);",
        "            if (sid == null || sid.length() == 0) { stopSound(); hideOverlay(app); return; }",
        "            rearm(app);",
        "            String why = problem(app);",
        "            if (why.length() > 0) {",
        "                startSound(app);",
        "                showOverlay(app, why);          // comes back every tick until fixed",
        "            }",
        "            else {",
        "                stopSound(); hideOverlay(app);",
        "                /* a brief notice when everything is back to normal — it also",
        "                   nudges phones that had frozen the app back to life */",
        "                try {",
        "                    android.app.NotificationManager nm = (android.app.NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);",
        "                    if (nm != null) {",
        "                        if (Build.VERSION.SDK_INT >= 26) {",
        "                            android.app.NotificationChannel ch = new android.app.NotificationChannel(",
        "                                \"eb_alert_hi\", \"Eurobond Tracking Alerts\", android.app.NotificationManager.IMPORTANCE_DEFAULT);",
        "                            nm.createNotificationChannel(ch);",
        "                        }",
        "                        androidx.core.app.NotificationCompat.Builder nb =",
        "                            new androidx.core.app.NotificationCompat.Builder(app, \"eb_alert_hi\")",
        "                                .setContentTitle(\"Tracking resumed\")",
        "                                .setContentText(\"Attendance tracking is running again.\")",
        "                                .setSmallIcon(app.getResources().getIdentifier(\"ic_stat_notify\", \"drawable\", app.getPackageName()))",
        "                                .setAutoCancel(true)",
        "                                .setTimeoutAfter(20000);",
        "                        nm.notify(74195, nb.build());",
        "                    }",
        "                } catch (Throwable t) {}",
        "            }",
        "            /* Android 12+ refuses a foreground-service start from a receiver,",
        "               but allows one triggered by an alarm. So instead of starting the",
        "               service here we fire an alarm 2 seconds from now, which is what",
        "               brings the \"Tracking on\" notification back on its own. */",
        "            Intent svc = new Intent(app, BackgroundGeolocationService.class);",
        "            svc.setAction(\"EB_ALARM_TICK\");",
        "            try {",
        "                AlarmManager am2 = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);",
        "                int fl2 = PendingIntent.FLAG_UPDATE_CURRENT;",
        "                try { fl2 |= PendingIntent.FLAG_IMMUTABLE; } catch (Throwable t) {}",
        "                PendingIntent spi = Build.VERSION.SDK_INT >= 26",
        "                    ? PendingIntent.getForegroundService(app, 4806, svc, fl2)",
        "                    : PendingIntent.getService(app, 4806, svc, fl2);",
        "                long soon = System.currentTimeMillis() + 500;",
        "                if (am2 != null) {",
        "                    try { am2.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, soon, spi); }",
        "                    catch (Throwable t) { am2.set(AlarmManager.RTC_WAKEUP, soon, spi); }",
        "                }",
        "            } catch (Throwable t) {}",
        "        } catch (Throwable t) {}",
        "        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable t) {}",
        "    }",
        "}",
        ""
      ].join("\n");
      if (!fs.existsSync(rxFile) || fs.readFileSync(rxFile, "utf8") !== rx) {
        fs.writeFileSync(rxFile, rx, "utf8");
        console.log("[patch-bg-geo] wake receiver written \u2713");
      }
    }
  } catch (e) { console.log("[patch-bg-geo] wake receiver note:", e.message); }





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
