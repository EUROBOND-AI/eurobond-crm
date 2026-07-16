import logoImg from "../assets/logo.jpg";
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, NavLink, useNavigate, Navigate, useParams } from "react-router-dom";
import {
  Home, CalendarCheck, Target, User, Users, Plus, Menu, Bell, ChevronRight, ChevronLeft,
  MapPin, Clock, Wallet, ClipboardList, LogOut, Phone, Mail, Building2, X,
  PlaneTakeoff, FileText, CalendarDays, Briefcase, ListChecks, Map as MapIcon,
  Play, Square, Navigation, Smartphone, CheckCircle2, AlertCircle, Eye, EyeOff,
} from "lucide-react";
import { watchLocation, totalDistanceKm, haversineKm, fmtKm, fmtDuration } from "../lib/geo.js";
import { api, auth } from "../lib/api.js";
import { MODULES } from "../admin/moduleConfigs.jsx";

/* logged-in field user (from auth) with safe fallbacks */
const CU = () => auth.user || {};

/* ---------------- NOTIFICATION READ STORE (per user) ---------------- */
const NOTIF_READ_KEY = () => `eb_notif_read_${CU().code || CU().mobile || "u"}`;
const getReadIds = () => {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY()) || "[]")); }
  catch { return new Set(); }
};
const markRead = (ids) => {
  const s = getReadIds();
  (Array.isArray(ids) ? ids : [ids]).forEach((i) => s.add(String(i)));
  localStorage.setItem(NOTIF_READ_KEY(), JSON.stringify([...s].slice(-500)));
  window.dispatchEvent(new Event("eb-notif-read"));
};
const isMine = (n, me) => !n.to || n.to === me.name || n.to === me.code || n.to === me.mobile;

/* ---------------- GPS / OFFICE-HOURS CONFIG (server-load control) ----------------
   Points are recorded ONLY when the person actually moved 1 km,
   or once every 5 min while idle. Outside office hours nothing is sent.
   Admin can override these from Masters -> App Settings.                        */
const GPS_CFG = {
  minDistanceKm: 1,          // record a point after 1 km of movement
  idleMaxMs: 5 * 60 * 1000,  // ...or one point every 5 min when standing still
  officeStart: "09:00",
  officeEnd: "20:00",
  officeHoursOnly: true,
};
const loadGpsCfg = () => {
  try { return { ...GPS_CFG, ...(JSON.parse(localStorage.getItem("eb_gps_cfg") || "{}")) }; }
  catch { return GPS_CFG; }
};
const withinOfficeHours = (cfg) => {
  if (!cfg.officeHoursOnly) return true;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = String(cfg.officeStart || "09:00").split(":").map(Number);
  const [eh, em] = String(cfg.officeEnd || "20:00").split(":").map(Number);
  return mins >= sh * 60 + sm && mins <= eh * 60 + em;
};
/* pull admin settings once per login and cache */
const syncGpsCfg = () => {
  api.list("appSettings", false)
    .then((d) => {
      const r = (d.records || [])[0];
      if (r && r.data) localStorage.setItem("eb_gps_cfg", JSON.stringify({ ...GPS_CFG, ...r.data }));
    })
    .catch(() => {});
};

/* live unread count — badge on the bell */
function useUnreadCount() {
  const [count, setCount] = useState(0);
  const refresh = () => {
    api.myNotifications().then((d) => {
      const me = CU();
      const read = getReadIds();
      const mine = (d.records || []).map((r) => ({ id: String(r.id), ...r.data })).filter((n) => isMine(n, me));
      setCount(mine.filter((n) => !read.has(String(n.id))).length);
    }).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);                       // 25s -> 60s (server load)
    const onRead = () => refresh();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("eb-notif-read", onRead);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); window.removeEventListener("eb-notif-read", onRead); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return count;
}

/* bell with unread badge */
function BellWithBadge({ onClick }) {
  const n = useUnreadCount();
  return (
    <div style={{ position: "relative", cursor: "pointer" }} onClick={onClick}>
      <Bell size={20} style={{ opacity: 0.9 }} />
      {n > 0 && (
        <span style={{
          position: "absolute", top: -6, right: -7, minWidth: 17, height: 17, padding: "0 4px",
          borderRadius: 9, background: "#e5484d", color: "#fff", fontSize: 10.5, fontWeight: 800,
          display: "grid", placeItems: "center", boxShadow: "0 0 0 2px rgba(255,255,255,.85)",
          fontFamily: "Bricolage Grotesque", lineHeight: 1,
        }}>{n > 99 ? "99+" : n}</span>
      )}
    </div>
  );
}

/* Fire a phone notification (native Capacitor if available, else web) */
function phoneNotify(title, body, extra = {}) {
  try {
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (Cap && Cap.Plugins && Cap.Plugins.LocalNotifications) {
      Cap.Plugins.LocalNotifications.schedule({
        notifications: [{
          id: Date.now() % 100000,
          title, body,
          extra,                                   // { notifId, link } -> used on tap
        }],
      });
    } else if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(title, { body });
      n.onclick = () => {
        window.focus();
        if (extra.notifId) markRead(extra.notifId);
        window.location.hash = "";
        window.location.href = extra.link ? `/app${extra.link.startsWith("/") ? extra.link : "/" + extra.link}` : "/app/notifications";
      };
    }
  } catch {}
}

/* tapping a phone notification: mark read + open the linked screen */
function useNotifTapHandler() {
  const nav = useNavigate();
  useEffect(() => {
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    if (!(Cap && Cap.Plugins && Cap.Plugins.LocalNotifications)) return;
    let h;
    Cap.Plugins.LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
      const ex = (ev && ev.notification && ev.notification.extra) || {};
      if (ex.notifId) markRead(ex.notifId);
      nav(ex.link || "/app/notifications");
    }).then((x) => { h = x; }).catch(() => {});
    return () => { try { h && h.remove(); } catch {} };
  }, []);
}

/* ---- reverse geocoding (location names) with cache ---- */
const geoCache = {};
async function placeName(lat, lng) {
  const key = lat.toFixed(4) + "," + lng.toFixed(4);
  if (geoCache[key]) return geoCache[key];
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17`, { headers: { "Accept-Language": "en" } });
    const j = await r.json();
    const a = j.address || {};
    const road = a.road || a.pedestrian || a.footway || "";
    const area = a.neighbourhood || a.suburb || a.quarter || a.residential || "";
    const city = a.city || a.town || a.village || a.county || "";
    const name = [road, area, city].filter(Boolean).join(", ")
      || j.display_name?.split(",").slice(0, 3).join(",")
      || "Unknown location";
    geoCache[key] = name;
    return name;
  } catch { return "—"; }
}

/* ---- iPhone-style slide to start/stop ---- */
function SlideToStart({ on, onToggle }) {
  const trackRef = useRef(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const startX = useRef(0);

  const maxX = () => (trackRef.current ? trackRef.current.offsetWidth - 62 : 200);

  const down = (e) => {
    setDrag(true);
    startX.current = (e.touches ? e.touches[0].clientX : e.clientX) - x;
  };
  const move = (e) => {
    if (!drag) return;
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - startX.current;
    setX(Math.max(0, Math.min(maxX(), cx)));
  };
  const up = () => {
    if (!drag) return;
    setDrag(false);
    if (x > maxX() * 0.75) onToggle();
    setX(0);
  };

  useEffect(() => {
    if (!drag) return;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  });

  return (
    <div className="slide-attend" ref={trackRef}>
      <div className="slide-text" style={{ opacity: drag || x > 8 ? 0 : 1, transition: "opacity 0.15s" }}>{on ? "Slide to Stop Attendance  ⟶" : "Slide to Start Attendance  ⟶"}</div>
      <button
        className={`slide-knob ${on ? "on" : ""} ${drag ? "dragging" : ""}`}
        style={{ left: 6 + x }}
        onMouseDown={down}
        onTouchStart={down}
      >
        {on ? <Square size={15} /> : <Play size={15} />}
      </button>
    </div>
  );
}

import L from "leaflet";

const todayStr = () =>
  new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/* ------------------------------------------------ OTP LOGIN ------------------------------------------------ */
function FieldLogin({ onLogin }) {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!mobile || !password) { setErr("Enter mobile and password"); return; }
    setBusy(true); setErr("");
    try {
      const user = await api.login(mobile.trim(), password);
      try {
        const Cap = window.Capacitor;
        if (Cap && Cap.Plugins && Cap.Plugins.LocalNotifications) {
          await Cap.Plugins.LocalNotifications.requestPermissions();
        } else if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
      } catch {}
      onLogin(user);
    } catch (e) {
      setErr(e.message || "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="phone-body" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          <img src={logoImg} alt="Eurobond" style={{ height: 42 }} />
        </div>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginBottom: 26 }}>
          Login with your mobile number and password
        </p>
        <div className="f-form" style={{ padding: 0 }}>
          <label>Mobile Number <b>*</b></label>
          <input
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
            value={mobile}
            onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "")); setErr(""); }}
            style={{ width: "100%", marginBottom: 14, fontSize: 16, letterSpacing: 1 }}
          />
          <label>Password <b>*</b></label>
          <div style={{ position: "relative", marginBottom: 6 }}>
            <input
              type={show ? "text" : "password"}
              placeholder="Your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={{ width: "100%", paddingRight: 42 }}
            />
            <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {err && <div style={{ color: "#d64545", fontSize: 12.5, fontWeight: 700, margin: "6px 0" }}>{err}</div>}
          <button className="f-submit" style={{ width: "100%", marginTop: 12, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={submit}>
            {busy ? "Signing in…" : "Login"}
          </button>
          <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)", textAlign: "center" }}>
            Use the mobile &amp; password given by your admin.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------ SHARED HEAD ------------------------------------------------ */
function ScreenHead({ title, back = true, right = null }) {
  const nav = useNavigate();
  return (
    <div className="f-screen-head">
      {back && (
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="grow" style={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: 16 }}>{title}</div>
      {right}
    </div>
  );
}

/* ------------------------------------------------ HOME ------------------------------------------------ */
function FieldHome({ attendanceOn, setAttendanceOn, tracking, expenses, followups, leaves, onStartAttendance }) {
  const [seg, setSeg] = useState("Matrics");
  const [sheet, setSheet] = useState(false);
  const [, tickHome] = useState(0);
  const nav = useNavigate();

  /* live clock for Summary duration (was crashing: durationMs undefined) */
  useEffect(() => {
    if (!attendanceOn || seg !== "Summary") return;
    const id = setInterval(() => tickHome((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [attendanceOn, seg]);

  const durationMs = tracking.startedAt
    ? (attendanceOn
        ? Date.now() - tracking.startedAt
        : (tracking.stoppedAt || tracking.startedAt) - tracking.startedAt)
    : 0;

  const fuDone = followups.filter((f) => (f.status || "").toLowerCase() === "completed").length;
  const leavePending = leaves.filter((l) => (l.status || "").toLowerCase() === "pending").length;
  const expMonth = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const metrics = [
    { label: "Distance", icon: <Navigation size={15} />, big: fmtKm(tracking.km), note: attendanceOn ? "tracking live" : "today", to: "/app/attendance" },
    { label: "Follow-up", icon: <ClipboardList size={15} />, big: `${fuDone}/${followups.length}`, note: "completed / total", to: "/app/followup" },
    { label: "Leave", icon: <CalendarDays size={15} />, big: leavePending, note: "pending approvals", to: "/app/leave" },
    { label: "Expense", icon: <Wallet size={15} />, big: "₹" + expMonth.toLocaleString("en-IN"), note: "total claimed", to: "/app/expense" },
  ];

  return (
    <>
      <div className="f-hero">
        <div className="f-hero-top">
          <div>
            <div className="f-hello">Good day 👋</div>
            <div className="f-name">{CU().name}</div>
            <div className="f-date">{todayStr()} · {(CU().designation || CU().role || "Field")}</div>
          </div>
          <BellWithBadge onClick={() => nav("/app/notifications")} />
        </div>
        <SlideToStart on={attendanceOn} onToggle={() => { if (!attendanceOn) { onStartAttendance(); } else { setAttendanceOn(false); } }} />
      </div>

      <div className="f-seg">
        {["Matrics", "Summary"].map((sg) => (
          <button key={sg} className={seg === sg ? "active" : ""} onClick={() => setSeg(sg)}>{sg}</button>
        ))}
      </div>

      {seg === "Matrics" && (
        <div className="f-cards">
          {metrics.map((m) => (
            <Link to={m.to} key={m.label} className="f-metric" style={{ textDecoration: "none", color: "inherit" }}>
              <h5>{m.icon} {m.label}</h5>
              <div className="big">{m.big}</div>
              <small>{m.note}</small>
            </Link>
          ))}
        </div>
      )}
      {seg === "Summary" && (
        <div className="f-list-pad">
          <div className="f-metric" style={{ marginBottom: 10 }}>
            <h5><Navigation size={15} /> Today's distance</h5>
            <div className="big">{fmtKm(tracking.km)}</div>
            <small>{tracking.points.length} location points recorded</small>
          </div>
          <div className="f-metric" style={{ marginBottom: 10 }}>
            <h5><Clock size={15} /> Working time</h5>
            <div className="big">{tracking.startedAt ? fmtDuration(durationMs) : "00:00:00"}</div>
            <small>since attendance start</small>
          </div>
          <div className="f-metric">
            <h5><CheckCircle2 size={15} /> Beat route</h5>
            <div className="big" style={{ fontSize: 18 }}>{(CU().beat || "—")}</div>
            <small>{(CU().city || "—")}</small>
          </div>
        </div>
      )}

      {sheet && (
        <div className="f-sheet-mask" onClick={() => setSheet(false)}>
          <div className="f-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, marginBottom: 12 }}>Quick actions</div>
            <div className="f-sheet-grid">
              {[
                { t: "Add Follow Up", ic: <ClipboardList size={18} />, to: "/app/followup/new" },
                { t: "Apply Leave", ic: <CalendarDays size={18} />, to: "/app/leave/new" },
                { t: "Add Expense", ic: <Wallet size={18} />, to: "/app/expense/new" },
                { t: "Add Site-Project", ic: <Building2 size={18} />, to: "/app/project/new" },
              ].map((a) => (
                <button key={a.t} onClick={() => { setSheet(false); nav(a.to); }}>
                  <span className="ic">{a.ic}</span>
                  {a.t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button className="f-fab" onClick={() => setSheet(true)}><Plus size={24} /></button>
    </>
  );
}

/* ------------------------------------------------ ATTENDANCE + GPS TRACKING ------------------------------------------------ */
function FieldAttendance({ attendanceOn, setAttendanceOn, tracking, setTracking, gpsAlarm }) {
  const [battery, setBattery] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOn = () => setOnline(true), onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    let batt;
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        batt = b;
        const upd = () => setBattery(Math.round(b.level * 100));
        upd(); b.addEventListener("levelchange", upd);
      }).catch(() => {});
    }
    return () => { window.removeEventListener("online", onOn); window.removeEventListener("offline", onOff); };
  }, []);

  const [tab, setTab] = useState("Details");
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const lineRef = useRef(null);
  const markerRef = useRef(null);
  const [, tick] = useState(0);
  const [names, setNames] = useState({});

  /* live duration ticker — only while actively running (freezes on stop) */
  useEffect(() => {
    if (!attendanceOn) return;
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [attendanceOn]);

  /* duration: live only while ON; once stopped, freeze at stoppedAt - startedAt */
  const durationMs = tracking.startedAt
    ? (attendanceOn ? Date.now() - tracking.startedAt : (tracking.stoppedAt || tracking.startedAt) - tracking.startedAt)
    : 0;

  /* map: create when Map tab opens, destroy when leaving (fixes reopen bug) */
  useEffect(() => {
    if (tab !== "Map" || !mapRef.current) return;
    const start = tracking.points[0] || { lat: 19.076, lng: 72.8777 };
    mapObj.current = L.map(mapRef.current).setView([start.lat, start.lng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapObj.current);
    const clean = tracking.points.filter((p) => p.accuracy == null || p.accuracy <= 35);
    lineRef.current = L.polyline(clean.map((p) => [p.lat, p.lng]), { color: "#8854d0", weight: 5 }).addTo(mapObj.current);
    // eggplant dots for each recorded point
    clean.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 3.5, color: "#8854d0", weight: 0, fillColor: "#8854d0", fillOpacity: 0.7 }).addTo(mapObj.current);
    });
    // green START marker
    if (clean.length) {
      L.circleMarker([clean[0].lat, clean[0].lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#20bf6b", fillOpacity: 1 }).bindPopup("Start").addTo(mapObj.current);
    }
    const latlngs = tracking.points;
    if (latlngs.length) {
      const last = latlngs[latlngs.length - 1];
      // red END / current marker
      markerRef.current = L.circleMarker([last.lat, last.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#eb3b5a", fillOpacity: 1 }).bindPopup(attendanceOn ? "Current" : "End").addTo(mapObj.current);
      mapObj.current.setView([last.lat, last.lng], 16);
    }
    setTimeout(() => mapObj.current?.invalidateSize(), 80);
    // red markers where the user stopped
    timelinePoints.filter((p) => p.stop).forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#eb3b5a", fillOpacity: 1 })
        .bindPopup("Stop point")
        .addTo(mapObj.current);
    });
    return () => {
      mapObj.current?.remove();
      mapObj.current = null; lineRef.current = null; markerRef.current = null;
    };
  }, [tab]);

  /* live update line/marker while map open */
  useEffect(() => {
    if (tab !== "Map" || !mapObj.current || !lineRef.current) return;
    const latlngs = tracking.points.filter((p) => p.accuracy == null || p.accuracy <= 35).map((p) => [p.lat, p.lng]);
    lineRef.current.setLatLngs(latlngs);
    if (latlngs.length) {
      const last = latlngs[latlngs.length - 1];
      if (markerRef.current) markerRef.current.setLatLng(last);
      else markerRef.current = L.circleMarker(last, { radius: 8, color: "#fff", weight: 3, fillColor: "#4b5cf0", fillOpacity: 1 }).addTo(mapObj.current);
      mapObj.current.panTo(last);
    }
  }, [tracking.points.length, tab]);

  /* timeline: fetch location names for spaced-out points (every ~5th point) */
  useEffect(() => {
    if (tab !== "Timeline") return;
    let stop = false;
    const pts = timelinePoints.slice(0, 15);
    (async () => {
      for (const p of pts) {
        if (stop) return;
        const key = p.lat.toFixed(4) + "," + p.lng.toFixed(4);
        if (names[key]) continue;
        const nm = await placeName(p.lat, p.lng);
        if (stop) return;
        setNames((n) => ({ ...n, [key]: nm }));
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();
    return () => { stop = true; };
  }, [tab, tracking.points.length]);

  const km = tracking.km;

  /* spaced timeline: keep meaningful points, add cumulative km + stop flag */
  const timelinePoints = useMemo(() => {
    const pts = tracking.points.filter((p) => p.accuracy == null || p.accuracy <= 35);
    const out = [];
    let cum = 0, last = null, lastKept = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (last) {
        const d = haversineKm(last, p);
        if (d * 1000 >= 8 && d < 0.5) cum += d;
      }
      // keep a point if it's ~80m from the last kept one, or a stop (long gap), or first/last
      const far = !lastKept || haversineKm(lastKept, p) * 1000 >= 80;
      const gap = last ? (p.time - last.time) : 0;
      const isStop = gap > 120000; // no movement 2+ min
      if (far || isStop || i === 0 || i === pts.length - 1) {
        out.push({ ...p, cumKm: cum, stop: isStop });
        lastKept = p;
      }
      last = p;
    }
    return out.reverse(); // newest first
  }, [tracking.points]);

  const duration = durationMs;

  const week = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({ d: d.getDate(), w: d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2), today: i === 0 });
    }
    return days;
  }, []);

  return (
    <>
      <ScreenHead title="Attendance" />
      <div style={{ display: "flex", gap: 8, padding: "10px 18px 0", fontSize: 11.5, fontWeight: 700 }}>
        <span style={{ background: online ? "#e8f7ee" : "#fdecec", color: online ? "#1f9d55" : "#c03636", padding: "4px 10px", borderRadius: 20 }}>
          {online ? "● Online" : "○ Offline"}
        </span>
        {battery != null && (
          <span style={{ background: battery <= 20 ? "#fdecec" : "#eef1ff", color: battery <= 20 ? "#c03636" : "#3949ab", padding: "4px 10px", borderRadius: 20 }}>
            🔋 {battery}%
          </span>
        )}
        {attendanceOn && (
          <span style={{ background: "#eef1ff", color: "#3949ab", padding: "4px 10px", borderRadius: 20 }}>
            ● Tracking live
          </span>
        )}
      </div>

      {gpsAlarm && (
        <div className="gps-alarm">
          <AlertCircle size={18} /> GPS is OFF — please turn on location to continue tracking!
        </div>
      )}

      <div style={{ display: "flex", gap: 8, padding: "12px 18px 0" }}>
        {week.map((x, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 12,
            background: x.today ? "var(--accent)" : "#fff",
            color: x.today ? "#fff" : "var(--ink)",
            boxShadow: "var(--shadow)", fontWeight: 700, fontSize: 12.5,
          }}>
            <div style={{ opacity: 0.75, fontSize: 10.5 }}>{x.w}</div>
            {x.d}
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 18px 0" }}>
        {/* STATUS ONLY — not a button. Start/Stop is done from the Home slider. */}
        <div
          style={{
            width: "100%", borderRadius: 14, padding: "13px 16px",
            background: attendanceOn ? "var(--accent)" : "#eef1f7",
            color: attendanceOn ? "#fff" : "var(--muted)",
            fontWeight: 800, fontSize: 13.5, textAlign: "center",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
            fontFamily: "Bricolage Grotesque", userSelect: "none", cursor: "default",
          }}
        >
          <span style={{
            width: 9, height: 9, borderRadius: 5, flexShrink: 0,
            background: attendanceOn ? "#7ef2a5" : "#b9c1cf",
            boxShadow: attendanceOn ? "0 0 0 4px rgba(126,242,165,.25)" : "none",
          }} />
          {attendanceOn ? "Attendance ON · GPS Tracking Live" : "Attendance OFF · GPS Tracking Stopped"}
        </div>
        {tracking.error && !gpsAlarm && (
          <div style={{ marginTop: 10, background: "#fdecec", color: "#c03636", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {tracking.error} — please allow location permission.
          </div>
        )}
      </div>

      <div className="track-stat">
        <div className="chart-card card-pad">
          <div className="stat-value">{fmtKm(km)}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>DISTANCE</div>
        </div>
        <div className="chart-card card-pad">
          <div className="stat-value">{fmtDuration(duration)}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>DURATION</div>
        </div>
        <div className="chart-card card-pad">
          <div className="stat-value">{tracking.points.length}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>POINTS</div>
        </div>
      </div>

      <div className="f-seg" style={{ margin: "0 18px 12px" }}>
        {["Details", "Timeline", "Map", "Summary"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Details" && (
        <div className="f-list-pad">
          {[
            ["Status", attendanceOn ? "Present · Tracking live" : tracking.points.length ? "Stopped" : "Not started"],
            ["Start time", tracking.startedAt ? new Date(tracking.startedAt).toLocaleTimeString("en-IN") : "--"],
            ["Stop time", tracking.stoppedAt ? new Date(tracking.stoppedAt).toLocaleTimeString("en-IN") : attendanceOn ? "Running…" : "--"],
            ["Distance travelled", fmtKm(km)],
            ["Location points", String(tracking.points.length)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", fontSize: 13 }}>
              <span style={{ color: "var(--muted)", fontWeight: 700 }}>{k}</span>
              <span style={{ fontWeight: 700, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "Timeline" && (
        <div className="f-list-pad">
          {timelinePoints.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 30 }}>
              No location data yet. Start attendance to begin tracking.
            </div>
          )}
          {timelinePoints.slice(0, 15).map((p, i) => {
            const key = p.lat.toFixed(4) + "," + p.lng.toFixed(4);
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff", borderRadius: 12, padding: "11px 12px", marginBottom: 8, boxShadow: "var(--shadow)", fontSize: 12.5, borderLeft: p.stop ? "4px solid #eb3b5a" : "4px solid var(--accent)" }}>
                <MapPin size={16} color={p.stop ? "#eb3b5a" : "var(--accent)"} style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{names[key] || "Finding location…"}</b>
                  {p.stop && <span style={{ background: "#fdecec", color: "#c03636", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 6, marginLeft: 6 }}>STOP</span>}
                  <div style={{ color: "var(--muted)", marginTop: 2 }}>
                    {fmtKm(p.cumKm || 0)} from start · ±{Math.round(p.accuracy || 0)} m
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 11 }}>
                    {p.battery != null && <span style={{ color: p.battery <= 20 ? "#c03636" : "#3949ab" }}>🔋 {p.battery}%</span>}
                    <span style={{ color: p.online === false ? "#c03636" : "#1f9d55" }}>{p.online === false ? "○ Offline" : "● Online"}</span>
                  </div>
                </div>
                <span style={{ color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap" }}>{new Date(p.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "Map" && (
        <>
          <div className="map-box" ref={mapRef} />
          <p style={{ fontSize: 11.5, color: "var(--muted)", padding: "10px 20px" }}>
            Blue line shows your travelled route.
          </p>
        </>
      )}

      {tab === "Summary" && (
        <div className="f-list-pad">
          <div className="f-metric" style={{ marginBottom: 10 }}>
            <h5><Navigation size={15} /> Total distance</h5>
            <div className="big">{fmtKm(km)}</div>
            <small>Total distance travelled</small>
          </div>
          <div className="f-metric" style={{ marginBottom: 10 }}>
            <h5><Clock size={15} /> Duration</h5>
            <div className="big">{fmtDuration(duration)}</div>
            <small>{tracking.startedAt ? new Date(tracking.startedAt).toLocaleTimeString("en-IN") : "--"} → {tracking.stoppedAt ? new Date(tracking.stoppedAt).toLocaleTimeString("en-IN") : attendanceOn ? "live" : "--"}</small>
          </div>
          <div className="f-metric">
            <h5><Smartphone size={15} /> Avg speed</h5>
            <div className="big">{duration > 0 && km > 0 ? `${(km / (duration / 3600000)).toFixed(1)} km/h` : "--"}</div>
            <small>distance ÷ time</small>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------ EXPENSE ------------------------------------------------ */
function FieldExpense({ list, add }) {
  const [tab, setTab] = useState("Submitted");
  const tabs = ["Draft", "Submitted", "Approved", "Reject", "Paid"];
  const nav = useNavigate();
  const rows = list.filter((e) => {
    if (tab === "Reject") return e.status === "Reject" || e.status === "Rejected";
    if (tab === "Submitted") return e.status === "Submitted" || e.status === "Pending";
    return e.status === tab;
  });
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <>
      <ScreenHead title="Expenses" right={<button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav("/app/expense/new")}>+ Add</button>} />
      <div style={{ margin: "14px 18px 0", background: "linear-gradient(120deg,#4b5cf0,#7b5cf0)", borderRadius: 16, color: "#fff", padding: "16px 18px" }}>
        <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>TOTAL CLAIMED</div>
        <div style={{ fontFamily: "Bricolage Grotesque", fontSize: 28, fontWeight: 800 }}>₹{total.toLocaleString("en-IN")}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{list.length} claims · FY 2026-27</div>
      </div>
      <div className="f-seg" style={{ margin: "12px 18px" }}>
        {tabs.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="f-list-pad">
        {rows.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 26 }}>No {tab.toLowerCase()} expenses</div>}
        {rows.map((e, i) => (
          <div key={i} onClick={() => e._id && nav(`/app/thread/expense/${e._id}`)} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{e.category} · {e.type}</span>
              <span>₹{e.amount.toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              <span>{e.desc}</span>
              <span>{e.createdAt}</span>
            </div>
            {e.rejectRemark && <div style={{ background: "#fdecec", color: "#c03636", fontSize: 11.5, padding: "6px 8px", borderRadius: 8, marginTop: 6 }}>Rejected: {e.rejectRemark}</div>}
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, fontWeight: 700 }}>Tap to view / reply →</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FieldExpenseNew({ add }) {
  const nav = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ date: today, type: "Local", category: "Travel", amount: "", desc: "" });
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const u = await api.uploadPhoto(file, "expense"); setDoc(u.url); }
    catch (e) { alert("Upload failed: " + e.message); }
    setBusy(false);
  };

  return (
    <>
      <ScreenHead title="Add Expense" />
      <div className="f-form">
        <label>Date <b>*</b></label>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />

        <label>Expense Type <b>*</b></label>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
          <option>Local</option><option>Outstation</option><option>ExStation</option><option>Tour</option>
        </select>

        <label>Category <b>*</b></label>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
          <option>Travel</option><option>Food</option><option>Fuel</option><option>Stay</option><option>Other</option>
        </select>

        <label>Amount (₹) <b>*</b></label>
        <input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} style={{ width: "100%", marginBottom: 12 }} />

        <label>Description</label>
        <textarea rows={3} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />

        <label>Bill / Document (optional)</label>
        <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => upload(e.target.files[0])} style={{ marginBottom: 8 }} />
        {busy && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Uploading…</div>}
        {doc && <div style={{ fontSize: 12, color: "#1f9d55", marginBottom: 8 }}>✓ Document attached</div>}

        <button
          className="f-submit" style={{ width: "100%" }}
          disabled={!f.amount || busy}
          onClick={() => {
            add({ createdAt: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), user: CU().name, createdBy: CU().name, date: f.date, type: f.type, category: f.category, amount: Number(f.amount), status: "Submitted", desc: f.desc || "--", ...(doc ? { photo: doc } : {}) });
            nav("/app/expense");
          }}
        >
          Submit Expense
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------ LEAVE ------------------------------------------------ */
function FieldLeave({ leaves, add }) {
  const nav = useNavigate();
  return (
    <>
      <ScreenHead title="Leave" right={<button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav("/app/leave/new")}>+ Apply</button>} />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[["CL", "6/8"], ["SL", "4/6"], ["PL", "10/12"]].map(([k, v]) => (
            <div key={k} className="chart-card" style={{ textAlign: "center", padding: "12px 6px" }}>
              <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 18 }}>{v}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{k} left</div>
            </div>
          ))}
        </div>
        {leaves.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 26 }}>No leave applications yet</div>}
        {leaves.map((l, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{l.type} · {l.mode}</span>
              <span style={{ color: l.status === "Approved" ? "#1f9d55" : "#c99400" }}>{l.status}</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{l.from} → {l.to} · {l.reason}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FieldLeaveNew({ add }) {
  const nav = useNavigate();
  const [f, setF] = useState({ type: "Casual Leave", mode: "Full Day", from: "", to: "", reason: "" });
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const u = await api.uploadPhoto(file, "leave"); setDoc(u.url); }
    catch (e) { alert("Upload failed: " + e.message); }
    setBusy(false);
  };
  return (
    <>
      <ScreenHead title="Apply Leave" />
      <div className="f-form">
        <label>Leave Type <b>*</b></label>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
          <option>Casual Leave</option><option>Sick Leave</option><option>Privilege Leave</option>
        </select>
        <label>Mode <b>*</b></label>
        <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
          <option>Full Day</option><option>Half Day</option>
        </select>
        <label>From <b>*</b></label>
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        <label>To <b>*</b></label>
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        <label>Reason</label>
        <textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        <label>Attachment (optional)</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => upload(e.target.files[0])} style={{ marginBottom: 8 }} />
        {busy && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Uploading…</div>}
        {doc && <div style={{ fontSize: 12, color: "#1f9d55", marginBottom: 8 }}>✓ Document attached</div>}
        <button
          className="f-submit" style={{ width: "100%" }}
          disabled={!f.from || !f.to || busy}
          onClick={() => { add({ ...f, status: "Pending", createdBy: CU().name, ...(doc ? { photo: doc } : {}) }); nav("/app/leave"); }}
        >
          Submit Application
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------ FOLLOW UP ------------------------------------------------ */
function FieldFollowUp({ items, add }) {
  const nav = useNavigate();
  const [updModal, setUpdModal] = useState(null); // item index for adding update

  const doCall = (num) => { if (num) window.location.href = `tel:${num}`; };
  const doWhats = (num) => { if (num) window.open(`https://wa.me/91${num}`, "_blank"); };
  const doShare = (x) => {
    const text = `${x.customer || x.partyName}\n${x.projectName || ""}\n${x.address || ""}\n${x.contactName || ""} ${x.contactNumber || ""}`;
    if (navigator.share) navigator.share({ title: x.customer || "Contact", text });
    else { navigator.clipboard?.writeText(text); alert("Details copied"); }
  };

  return (
    <>
      <ScreenHead title="Follow Up" right={<button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav("/app/followup/new")}>+ New</button>} />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {items.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 26 }}>No follow-ups yet</div>}
        {items.map((x, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{x.customer || x.partyName || "Follow-up"}</span>
              <span style={{ color: (x.status === "Completed") ? "#1f9d55" : "#c99400", fontSize: 12 }}>{x.status || "To-Do"}</span>
            </div>
            {x.category && <div style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>{x.category}{x.projectName ? " · " + x.projectName : ""}</div>}
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              {(x.type || x.mode || "Call")} · {x.date || x.createdAt || todayStr()}
            </div>
            {x.address && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>📍 {x.address}</div>}

            {/* updates history */}
            {(x.updates || []).slice(1).map((u, j) => (
              <div key={j} style={{ fontSize: 11.5, marginTop: 4, paddingLeft: 8, borderLeft: "2px solid var(--line)" }}>
                <b>{u.type}</b> · {u.date} — {u.remark}
              </div>
            ))}

            {/* action buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => doCall(x.contactNumber)} style={actBtn("#1f9d55")}>📞 Call</button>
              <button onClick={() => doWhats(x.whatsapp || x.contactNumber)} style={actBtn("#25d366")}>💬 WhatsApp</button>
              <button onClick={() => doShare(x)} style={actBtn("#3949ab")}>↗ Share</button>
            </div>
            <button onClick={() => setUpdModal(i)} style={{ width: "100%", marginTop: 8, padding: "8px", borderRadius: 9, border: "1.5px dashed var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 12.5 }}>
              + Add Next Visit / Remark
            </button>
            <button onClick={() => { QUOTE_PREFILL.data = x; nav("/app/m/quotation/new"); }} style={{ width: "100%", marginTop: 6, padding: "8px", borderRadius: 9, border: "none", background: "#eef1ff", color: "var(--navy)", fontWeight: 700, fontSize: 12.5 }}>
              📄 Add to Quotation
            </button>
          </div>
        ))}
      </div>

      {updModal !== null && (
        <UpdatePopup
          onClose={() => setUpdModal(null)}
          onSave={(u) => { add({ ...items[updModal], _update: u, _idx: updModal }); setUpdModal(null); }}
        />
      )}
    </>
  );
}

function actBtn(color) {
  return { flex: 1, padding: "7px", borderRadius: 9, border: "none", background: color, color: "#fff", fontWeight: 700, fontSize: 11.5 };
}

function UpdatePopup({ onClose, onSave }) {
  const [type, setType] = useState("Call");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  return (
    <div className="f-sheet-mask" style={{ zIndex: 70 }} onClick={onClose}>
      <div className="f-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Add Next Visit / Remark</div>
        <label style={{ fontWeight: 700, fontSize: 13 }}>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", marginBottom: 10, marginTop: 4 }}>
          <option>Call</option><option>Visit</option><option>Email</option><option>WhatsApp</option>
        </select>
        <label style={{ fontWeight: 700, fontSize: 13 }}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", marginBottom: 10, marginTop: 4 }} />
        <label style={{ fontWeight: 700, fontSize: 13 }}>Remark</label>
        <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: "100%", marginBottom: 14, marginTop: 4 }} />
        <button className="f-submit" style={{ width: "100%" }} disabled={!remark} onClick={() => onSave({ type, date, remark, at: new Date().toLocaleString("en-IN") })}>Save Update</button>
      </div>
    </div>
  );
}

function FieldFollowUpNew({ add }) {
  const nav = useNavigate();
  const [f, setF] = useState({
    category: "Architect", partyName: "", projectName: "", address: "", pincode: "",
    gst: "", pan: "", type: "Call", date: "", notes: "",
  });
  const [contacts, setContacts] = useState([{ name: "", mobile: "", whatsapp: "" }]);
  const [other, setOther] = useState({ birthday: "", anniversary: "", feedback: "" });
  const [locBusy, setLocBusy] = useState(false);

  const captureLocation = () => {
    setLocBusy(true);
    if (!navigator.geolocation) { setLocBusy(false); alert("Location not available"); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, lat } = pos.coords;
        const la = pos.coords.latitude, ln = pos.coords.longitude;
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${ln}&zoom=18`, { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        const a = j.address || {};
        const full = j.display_name || "";
        const pin = a.postcode || "";
        setF((x) => ({ ...x, address: full, pincode: pin }));
      } catch { alert("Could not get address"); }
      setLocBusy(false);
    }, () => { setLocBusy(false); alert("Location permission needed"); }, { enableHighAccuracy: true, timeout: 15000 });
  };

  const setContact = (i, key, val) => setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  const addContact = () => setContacts((cs) => [...cs, { name: "", mobile: "", whatsapp: "" }]);
  const removeContact = (i) => setContacts((cs) => cs.filter((_, idx) => idx !== i));

  const inp = { width: "100%", marginBottom: 12 };
  const CATS = ["Architect", "Fabricator", "Consultant", "Dealer", "Builder", "Corporate", "Customer"];

  return (
    <>
      <ScreenHead title="Add Follow Up" />
      <div className="f-form">
        <label>Category <b>*</b></label>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp}>
          {CATS.map((c) => <option key={c}>{c}</option>)}
        </select>

        <label>Party Name <b>*</b></label>
        <input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} style={inp} />

        <label>Project Name</label>
        <input value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} style={inp} />

        <label>Address</label>
        <button type="button" onClick={captureLocation} disabled={locBusy}
          style={{ width: "100%", marginBottom: 8, padding: "10px", borderRadius: 10, border: "1.5px solid var(--navy)", background: "#eef1ff", color: "var(--navy)", fontWeight: 700, fontSize: 13 }}>
          {locBusy ? "Getting location…" : "📍 Capture Current Location"}
        </button>
        <textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Auto-filled from location" style={inp} />

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label>Pincode</label>
            <input value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} style={inp} />
          </div>
        </div>

        <label>GST Number</label>
        <input value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value.toUpperCase() })} style={inp} />
        <label>PAN Number</label>
        <input value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} style={inp} />

        <div style={{ fontWeight: 800, fontSize: 13.5, margin: "6px 0 10px", color: "var(--navy)" }}>Contact Info</div>
        {contacts.map((c, i) => (
          <div key={i} style={{ background: "#f7f9ff", borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Contact {i + 1}</span>
              {contacts.length > 1 && <button type="button" onClick={() => removeContact(i)} style={{ background: "none", border: "none", color: "#c03636", fontSize: 12, fontWeight: 700 }}>Remove</button>}
            </div>
            <input value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} placeholder="Contact Name" style={{ width: "100%", marginBottom: 8 }} />
            <input inputMode="numeric" value={c.mobile} onChange={(e) => setContact(i, "mobile", e.target.value.replace(/\D/g, ""))} placeholder="Contact Number" style={{ width: "100%", marginBottom: 8 }} />
            <input inputMode="numeric" value={c.whatsapp} onChange={(e) => setContact(i, "whatsapp", e.target.value.replace(/\D/g, ""))} placeholder="WhatsApp Number" style={{ width: "100%" }} />
          </div>
        ))}
        <button type="button" onClick={addContact} style={{ width: "100%", marginBottom: 14, padding: "9px", borderRadius: 10, border: "1.5px dashed var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 13 }}>
          ➕ Add Another Contact
        </button>

        <div style={{ fontWeight: 800, fontSize: 13.5, margin: "6px 0 10px", color: "var(--navy)" }}>Other Info</div>
        <label>Birthday</label>
        <input type="date" value={other.birthday} onChange={(e) => setOther({ ...other, birthday: e.target.value })} style={inp} />
        <label>Anniversary</label>
        <input type="date" value={other.anniversary} onChange={(e) => setOther({ ...other, anniversary: e.target.value })} style={inp} />
        <label>Feedback</label>
        <textarea rows={2} value={other.feedback} onChange={(e) => setOther({ ...other, feedback: e.target.value })} style={inp} />

        <label>Follow-up Type <b>*</b></label>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} style={inp}>
          <option>Call</option><option>Visit</option><option>Email</option><option>WhatsApp</option>
        </select>
        <label>Follow-up Date <b>*</b></label>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={inp} />
        <label>Remark / Notes</label>
        <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={inp} />

        <button
          className="f-submit" style={{ width: "100%" }}
          disabled={!f.partyName || !f.date}
          onClick={() => {
            const primary = contacts[0] || {};
            add({
              ...f, customer: f.partyName,
              contacts, birthday: other.birthday, anniversary: other.anniversary, feedback: other.feedback,
              contactName: primary.name, contactNumber: primary.mobile, whatsapp: primary.whatsapp,
              status: "To-Do", createdBy: CU().name,
              updates: [{ date: f.date, type: f.type, remark: f.notes, at: new Date().toLocaleString("en-IN") }],
            });
            nav("/app/followup");
          }}
        >
          Save Follow Up
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------ SIMPLE FORM SCREENS ------------------------------------------------ */
function FieldProjectNew() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", stage: "Initiation", city: "", value: "" });
  const [ok, setOk] = useState(false);
  return (
    <>
      <ScreenHead title="Add Site-Project" />
      <div className="f-form">
        <label>Project Name <b>*</b></label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        <label>Stage</label>
        <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
          <option>Initiation</option><option>Planning</option><option>Execution</option><option>Monitoring</option>
        </select>
        <label>City</label>
        <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        <label>Approx Value (₹)</label>
        <input inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, "") })} style={{ width: "100%", marginBottom: 16 }} />
        {ok && <div style={{ background: "#e8f7ee", color: "#1f9d55", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>✔ Project saved</div>}
        <button className="f-submit" style={{ width: "100%" }} disabled={!f.name} onClick={async () => {
          try {
            await api.create("siteProject", { name: f.name, stage: f.stage, status: "Inprocess", city: f.city, value: f.value, createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
            setOk(true); setTimeout(() => nav("/app"), 900);
          } catch (e) { alert(e.message); }
        }}>
          Save Project
        </button>
      </div>
    </>
  );
}

function FieldTarget() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.list("target").then((d) => {
      const mine = (d.records || []).map((r) => ({ ...r.data, _by: r.created_by_name }))
        .filter((t) => !t.user || t.user === CU().name);
      setRows(mine);
    }).catch(() => setRows([]));
  }, []);

  return (
    <>
      <ScreenHead title="Target" back={false} />
      <div className="f-list-pad" style={{ paddingTop: 16 }}>
        {rows === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>
            <Target size={34} style={{ opacity: 0.4, marginBottom: 10 }} />
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No targets assigned yet</div>
            Your manager will assign targets from the admin panel.
          </div>
        ) : rows.map((t, i) => {
          const ach = Number(t.achieved || 0), tgt = Number(t.amount || t.target || 0);
          const pc = tgt > 0 ? Math.min(100, Math.round((ach / tgt) * 100)) : 0;
          return (
            <div key={i} className="f-metric" style={{ marginBottom: 10 }}>
              <h5><Target size={15} /> {t.title || t.period || "Target"} <span className="pct">{pc}%</span></h5>
              <div className="big">₹{ach.toLocaleString("en-IN")} / ₹{tgt.toLocaleString("en-IN")}</div>
              <div className="bar"><i style={{ width: pc + "%" }} /></div>
              <small>{t.period || ""} {t.note ? "· " + t.note : ""}</small>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------ PROFILE ------------------------------------------------ */
function FieldProfile({ onLogout }) {
  const u = CU();
  const row = (ic, k, v) => (
    <div key={k} style={{ display: "flex", gap: 12, alignItems: "center", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", fontSize: 13 }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>{ic}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "var(--muted)", fontSize: 11, fontWeight: 700 }}>{k}</div>
        <div style={{ fontWeight: 700 }}>{v}</div>
      </div>
    </div>
  );
  return (
    <>
      <ScreenHead title="Profile" back={false} />
      <div style={{ textAlign: "center", padding: "18px 18px 6px" }}>
        <div style={{ width: 78, height: 78, borderRadius: "50%", margin: "0 auto 10px", background: "linear-gradient(135deg,#4b5cf0,#7b5cf0)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 28 }}>
          {u.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
        </div>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 18 }}>{u.name}</div>
        <div style={{ color: "var(--muted)", fontSize: 12.5, fontWeight: 700 }}>{u.code} · {u.role}</div>
        <div style={{ margin: "12px auto 0", maxWidth: 260 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
            <span>Profile completion</span><span>85%</span>
          </div>
          <div style={{ height: 7, background: "#e8ebf6", borderRadius: 99, marginTop: 4 }}>
            <div style={{ width: "85%", height: "100%", background: "var(--accent)", borderRadius: 99 }} />
          </div>
        </div>
      </div>
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {row(<Phone size={15} />, "Mobile", u.mobile || u.phone || "—")}
        {row(<Mail size={15} />, "Email", u.email || "—")}
        {row(<MapPin size={15} />, "City", u.city)}
        {row(<User size={15} />, "Reporting Manager", u.manager || "—")}
        {row(<CalendarDays size={15} />, "Weekly Off", u.weekly_off || u.weeklyOff || "—")}
        {row(<MapIcon size={15} />, "Beat Route", u.beat)}
        {row(<Smartphone size={15} />, "Device", "CRM Eurobond v1.0.0 · Android")}
        <button className="f-submit" style={{ width: "100%", background: "#d64545", marginTop: 8 }} onClick={onLogout}>
          <LogOut size={15} style={{ verticalAlign: -2, marginRight: 6 }} /> Logout
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------ MENU DRAWER ------------------------------------------------ */
function MenuDrawer({ open, close }) {
  const nav = useNavigate();
  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (!open) return;
    api.list("teamAccess").then((d) => {
      const rec = (d.records || [])[0];
      setAccess(rec ? rec.data.map : {});
    }).catch(() => setAccess({}));
  }, [open]);
  if (!open) return null;
  // map menu path → module key for access check
  const modOf = (to) => { const m = to.match(/\/app\/m\/(\w+)/); return m ? m[1] : null; };
  const myRole = CU().role || "";
  const canSee = (to) => {
    const mod = modOf(to);
    if (!mod || !access || !access[myRole]) return true; // no restriction set → show all
    return access[myRole][mod] !== false;
  };
  const rawGroups = [
    { h: "MAIN", items: [["Home", <Home size={16} />, "/app"], ["Follow Up", <ClipboardList size={16} />, "/app/followup"], ["Near By Customers", <MapPin size={16} />, "/app/nearby"]] },
    { h: "WORK", items: [["Enquiry", <FileText size={16} />, "/app/m/enquiry"], ["Quotation", <FileText size={16} />, "/app/m/quotation"], ["Sales to Spec", <ClipboardList size={16} />, "/app/m/salesToSpec"], ["Spec to Sales", <ClipboardList size={16} />, "/app/m/specToSales"], ["Leave", <CalendarDays size={16} />, "/app/leave"]] },
    { h: "CUSTOMERS", items: [["Distributor", <Building2 size={16} />, "/app/m/distributor"], ["Dealer", <Building2 size={16} />, "/app/m/dealer"], ["Influencer", <Users size={16} />, "/app/m/influencer"]] },
    { h: "MANAGEMENT", items: [["Target", <Target size={16} />, "/app/target"], ["Attendance", <CalendarCheck size={16} />, "/app/attendance"], ["Site Project", <Building2 size={16} />, "/app/m/siteProject"], ["Task", <ClipboardList size={16} />, "/app/m/task"]] },
  ];
  const groups = rawGroups.map((g) => ({ ...g, items: g.items.filter(([, , to]) => canSee(to)) })).filter((g) => g.items.length);
  return (
    <div className="f-sheet-mask" onClick={close} style={{ zIndex: 60 }}>
      <div className="f-menu" onClick={(e) => e.stopPropagation()}>
        <div className="f-menu-head">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ background: "#fff", borderRadius: 10, padding: "6px 10px", display: "inline-block", marginBottom: 10 }}>
                <img src={logoImg} alt="Eurobond" style={{ height: 26, display: "block" }} />
              </div>
              <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 16 }}>{CU().name}</div>
              <div style={{ fontSize: 11.5, opacity: 0.85 }}>{(CU().code || CU().mobile || "")} · {(CU().designation || CU().role || "Field")}</div>
            </div>
            <button onClick={close} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: 9, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={16} /></button>
          </div>
        </div>
        <div style={{ padding: "10px 0", overflowY: "auto", flex: 1 }}>
          {groups.map((g) => (
            <div key={g.h}>
              <div style={{ padding: "10px 18px 4px", fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "var(--muted)" }}>{g.h}</div>
              {g.items.map(([t, ic, to]) => (
                <button key={t} className="f-menu-item" onClick={() => { close(); nav(to); }}>
                  <span className="ic">{ic}</span> {t} <ChevronRight size={14} style={{ marginLeft: "auto", color: "var(--muted)" }} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------ GENERIC FIELD MODULES ------------------------------------------------ */
/* App modules read the SAME config as the admin backend, so fields match exactly.
   Only modules with app:true are exposed in the field app. */
const QUOTE_PREFILL = { data: null };

const APP_MODS = Object.fromEntries(Object.entries(MODULES).filter(([, c]) => c.app));

function FieldModule({ mod }) {
  const cfg = APP_MODS[mod];
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    if (cfg.salesView) {
      api.list(mod, false).then((d) => {
        let list = (d.records || []).map((r) => ({ _id: r.id, ...r.data }));
        const myCity = (CU().city || "").toLowerCase();
        list = list.filter((r) => (r.city || "").toLowerCase() === myCity);
        setRows(list);
      }).catch(() => setRows([]));
    } else if (mod === "task") {
      // tasks assigned to me OR created by me
      api.list(mod, false).then((d) => {
        const me = CU();
        const list = (d.records || []).map((r) => ({ _id: r.id, ...r.data }))
          .filter((r) => r.assignee === me.name || r.createdBy === me.name);
        setRows(list);
      }).catch(() => setRows([]));
    } else {
      api.list(mod, true).then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => setRows([]));
    }
  }, [mod]);

  if (!cfg) return <><ScreenHead title="Not found" /></>;
  const primary = cfg.columns.find((c) => !["id", "createdAt", "createdBy", "status"].includes(c.key))?.key || "id";
  const subCols = cfg.columns.filter((c) => !["id", "createdAt", "createdBy", "status", primary].includes(c.key)).slice(0, 2);

  return (
    <>
      <ScreenHead title={cfg.appLabel || cfg.crumb} right={cfg.appReadOnly ? null : <button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav(`/app/m/${mod}/new`)}>+ Add</button>} />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {rows === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>No records yet. Tap + Add to create one.</div>
        ) : rows.map((r, i) => (
          <div key={i} onClick={() => {
            if (mod === "task") nav(`/app/thread/task/${r._id}`);
            else if (cfg.isSpecThread) nav(`/app/thread/${mod}/${r._id}`);
          }} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", cursor: (cfg.isSpecThread || mod === "task") ? "pointer" : "default" }}>
            {r.photo && <img src={r.photo} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 8, maxHeight: 180, objectFit: "cover" }} />}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{r[primary] || cfg.appLabel}</span>
              <span style={{ color: "#c99400", fontSize: 12 }}>{r.status || ""}</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
              {r.id ? r.id + " · " : ""}{subCols.map((c) => r[c.key]).filter(Boolean).join(" · ") || r.createdAt || ""}
            </div>
            {(cfg.salesView || r.mobile || r.contact) && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {r.mobile && <button onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${r.mobile}`; }} style={actBtn("#1f9d55")}>📞 Call</button>}
                {r.mobile && <button onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/91${r.mobile}`, "_blank"); }} style={actBtn("#25d366")}>💬 WhatsApp</button>}
                {r.attachment && <button onClick={(e) => { e.stopPropagation(); window.open(r.attachment, "_blank"); }} style={actBtn("#3949ab")}>📎 File</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function FieldModuleNew({ mod }) {
  const cfg = APP_MODS[mod];
  const nav = useNavigate();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [userOpts, setUserOpts] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [upBusy, setUpBusy] = useState(false);

  useEffect(() => {
    if ((cfg?.form || []).some((x) => x.optionsSource === "users")) {
      api.listUsers().then((d) => setUserOpts((d.users || []).filter((u) => u.status == 1).map((u) => u.name))).catch(() => {});
    }
  }, [mod]);

  const doUpload = async (file) => {
    if (!file) return;
    setPhoto(file); setUpBusy(true);
    try { const r = await api.uploadPhoto(file, mod); setPhotoUrl(r.url); }
    catch (e) { alert("Photo upload failed: " + e.message); }
    setUpBusy(false);
  };

  if (!cfg) return <><ScreenHead title="Not found" /></>;
  const fields = cfg.form || [];
  const missing = fields.filter((x) => x.required && !f[x.name]);
  const firstTab = cfg.tabs?.[0]?.key || "Pending";

  return (
    <>
      <ScreenHead title={"Add " + (cfg.appLabel || cfg.crumb)} />
      <div className="f-form">
        {fields.map((x) => {
          const opts = x.optionsSource === "users" ? userOpts : x.options;
          return (
            <div key={x.name}>
              <label>{x.label} {x.required && <b>*</b>}</label>
              {opts ? (
                <select value={f[x.name] || ""} onChange={(e) => setF({ ...f, [x.name]: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
                  <option value="">Select</option>
                  {opts.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : x.type === "textarea" ? (
                <textarea rows={3} value={f[x.name] || ""} onChange={(e) => setF({ ...f, [x.name]: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
              ) : (
                <input type={x.type || "text"} value={f[x.name] || ""} onChange={(e) => setF({ ...f, [x.name]: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
              )}
            </div>
          );
        })}

        <label>Photo (optional)</label>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => doUpload(e.target.files[0])} style={{ marginBottom: 6 }} />
        {upBusy && <div style={{ fontSize: 12, color: "var(--muted)" }}>Uploading photo…</div>}
        {photoUrl && <img src={photoUrl} alt="uploaded" style={{ width: "100%", borderRadius: 10, marginBottom: 8 }} />}

        <button
          className="f-submit" style={{ width: "100%", marginTop: 4, opacity: busy ? 0.7 : 1 }}
          disabled={missing.length > 0 || busy || upBusy}
          onClick={async () => {
            setBusy(true);
            try {
              const seq = String(Date.now()).slice(-4);
              const autoId = cfg.idPrefix ? `${cfg.idPrefix}-${seq}` : undefined;
              const created = await api.create(mod, {
                ...(autoId ? { id: autoId } : {}),
                ...f,
                ...(photoUrl ? { photo: photoUrl } : {}),
                status: firstTab,
                createdBy: CU().name,
                createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
              });
              // sales to spec → notify tagged spec person, with link to open the thread
              if (mod === "salesToSpec" && f.specPerson) {
                try { await api.notify({ to: f.specPerson, title: "Sales to Spec — " + (f.project || ""), message: `${CU().name} tagged you: ${f.help || ""}`, link: `/app/thread/salesToSpec/${created && created.id ? created.id : ""}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
              }
              // spec to sales → notify the sales person
              if (mod === "specToSales" && f.salesPerson) {
                try { await api.notify({ to: f.salesPerson, title: "Spec to Sales — " + (f.project || ""), message: `${CU().name}: ${f.help || ""}`, link: `/app/thread/specToSales/${created && created.id ? created.id : ""}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
              }
              // site project with specification help → notify spec person
              if (mod === "siteProject" && f.specPerson && f.specHelp) {
                try { await api.notify({ to: f.specPerson, title: "Specification help — " + (f.name || "Project"), message: `${CU().name} needs spec help on "${f.name}": ${f.specHelp}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
              }
              // task → notify the assignee
              if (mod === "task" && f.assignee) {
                try { await api.notify({ to: f.assignee, title: "New task assigned", message: `${CU().name} assigned you: ${f.title || "a task"}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
              }
              nav(`/app/m/${mod}`);
            } catch (e) { alert(e.message); setBusy(false); }
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}

function FieldNotifications() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [read, setRead] = useState(() => getReadIds());

  useEffect(() => {
    api.myNotifications().then((d) => {
      const me = CU();
      const mine = (d.records || [])
        .map((r) => ({ _id: String(r.id), ...r.data }))
        .filter((n) => isMine(n, me));
      setRows(mine);
      /* opening the screen marks everything as read -> badge clears, stays cleared */
      if (mine.length) markRead(mine.map((n) => n._id));
    }).catch(() => setRows([]));
  }, []);

  const open = (n) => {
    markRead(n._id);
    setRead(getReadIds());
    if (n.link) nav(n.link);
  };

  return (
    <>
      <ScreenHead title="Notifications" />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {rows === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>
            <Bell size={34} style={{ opacity: 0.4, marginBottom: 10 }} />
            <div style={{ fontWeight: 700 }}>No notifications yet</div>
          </div>
        ) : rows.map((n, i) => {
          const unread = !read.has(String(n._id));
          return (
            <div key={i} onClick={() => open(n)} style={{
              background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8,
              boxShadow: "var(--shadow)", borderLeft: `4px solid ${unread ? "var(--accent)" : "#d7dce5"}`,
              cursor: "pointer", opacity: unread ? 1 : 0.72,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {unread && <span style={{ width: 7, height: 7, borderRadius: 4, background: "#e5484d", flexShrink: 0 }} />}
                <div style={{ fontWeight: unread ? 700 : 600, fontSize: 13.5, flex: 1 }}>{n.title || "Notification"}</div>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 3 }}>{n.message}</div>
              {n.createdAt && <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 5 }}>{n.createdAt}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}


function FieldSpecThread({ id }) {
  const nav = useNavigate();
  const [rec, setRec] = useState(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("specApproval", id).then((d) => setRec({ _id: d.record.id, ...d.record.data })).catch(() => {});
  useEffect(() => { load(); }, [id]);

  const send = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let doc = "";
      if (file) { const u = await api.uploadPhoto(file, "specApproval"); doc = u.url; }
      const thread = [...(rec.thread || []), { by: CU().name, text: text.trim(), doc, at: new Date().toLocaleString("en-IN") }];
      const data = { ...rec, thread }; delete data._id;
      await api.update("specApproval", id, data);
      if (rec.specPerson) { try { await api.notify({ to: rec.specPerson, title: "Reply on spec " + (rec.id || ""), message: `${CU().name}: ${text.trim() || "sent a document"}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {} }
      setText(""); setFile(null); load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  if (!rec) return <><ScreenHead title="Spec Approval" /><div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</div></>;
  const thread = rec.thread || [];

  return (
    <>
      <ScreenHead title={rec.id || "Spec Approval"} />
      <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eceff8" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{rec.project}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Tagged: {rec.specPerson} · <b style={{ color: rec.status === "Approved" ? "#1f9d55" : rec.status === "Rejected" ? "#c03636" : "#c99400" }}>{rec.status || "Pending"}</b></div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{rec.help}</div>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 150 }}>
        {thread.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 20 }}>No replies yet.</div>}
        {thread.map((m, i) => {
          const mine = m.by === CU().name;
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
              <div style={{ background: mine ? "var(--navy)" : "#fff", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "9px 12px", fontSize: 13, boxShadow: "var(--shadow)" }}>
                {m.text}
                {m.doc && <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}>📎 View document</a>}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.by} · {m.at}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "calc(62px + env(safe-area-inset-bottom))", left: 0, right: 0, maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: "#fff", borderTop: "1px solid var(--line)", zIndex: 45 }}>
        <label style={{ display: "grid", placeItems: "center", cursor: "pointer", color: "var(--muted)", width: 38 }}>
          📎<input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} />
        </label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={file ? file.name : "Type a reply…"}
          style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 20, padding: "10px 14px", fontSize: 13, outline: "none" }} />
        <button className="f-submit" style={{ padding: "8px 16px", borderRadius: 20 }} disabled={busy} onClick={send}>Send</button>
      </div>
    </>
  );
}

function FieldProjectDetail({ id }) {
  const nav = useNavigate();
  const [rec, setRec] = useState(null);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("siteProject", id).then((d) => setRec({ _id: d.record.id, ...d.record.data })).catch(() => {});
  useEffect(() => { load(); }, [id]);

  const addVisit = async () => {
    if (!remark.trim()) return;
    setBusy(true);
    try {
      const month = new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      const visits = [...(rec.visits || []), { month, remark: remark.trim(), by: CU().name, at: new Date().toLocaleString("en-IN") }];
      const data = { ...rec, visits }; delete data._id;
      await api.update("siteProject", id, data);
      setRemark(""); load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  if (!rec) return <><ScreenHead title="Project" /><div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</div></>;
  const visits = rec.visits || [];

  return (
    <>
      <ScreenHead title={rec.name || "Project"} />
      <div style={{ padding: 16 }}>
        {rec.photo && <img src={rec.photo} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 12, maxHeight: 200, objectFit: "cover" }} />}
        <div style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "var(--shadow)", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{rec.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
            {rec.projectType || ""}{rec.city ? " · " + rec.city : ""}{rec.stage ? " · " + rec.stage : ""}
          </div>
          {rec.firm && <div style={{ fontSize: 12.5, marginTop: 3 }}>Firm: {rec.firm}</div>}
          {rec.value && <div style={{ fontSize: 12.5, marginTop: 3 }}>Value: ₹{Number(rec.value).toLocaleString("en-IN")}</div>}
        </div>

        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Monthly Visit Log</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add this month's visit remark…" style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }} />
          <button className="f-submit" style={{ padding: "8px 16px" }} disabled={busy} onClick={addVisit}>Add</button>
        </div>

        {visits.length === 0 ? <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 16 }}>No visits logged yet.</div>
        : visits.slice().reverse().map((v, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8, boxShadow: "var(--shadow)", borderLeft: "3px solid var(--navy)" }}>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>{v.month}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{v.remark}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{v.by} · {v.at}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FieldEnquiry() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    // show enquiries assigned to me OR created by me
    api.list("enquiry", false).then((d) => {
      const me = CU();
      const list = (d.records || []).map((r) => ({ _id: r.id, ...r.data }))
        .filter((r) => r.assignedTo === me.name || r.createdBy === me.name || !r.assignedTo);
      setRows(list);
    }).catch(() => setRows([]));
  }, []);

  const types = ["Product", "Price", "Dealership", "Project", "Other"];
  const filtered = (rows || []).filter((r) =>
    (!type || r.enquiryType === type) &&
    (!q || (r.customer || "").toLowerCase().includes(q.toLowerCase()) || (r.firm || "").toLowerCase().includes(q.toLowerCase()) || (r.id || "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <>
      <ScreenHead title="Enquiry" />
      <div style={{ padding: "12px 16px 0" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / firm / id…" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d7dcef", fontSize: 13.5, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
          <button onClick={() => setType("")} style={chip(!type)}>All</button>
          {types.map((t) => <button key={t} onClick={() => setType(t)} style={chip(type === t)}>{t}</button>)}
        </div>
      </div>
      <div className="f-list-pad" style={{ paddingTop: 8 }}>
        {rows === null ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Loading…</div>
        : filtered.length === 0 ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>No enquiries found.</div>
        : filtered.map((r, i) => (
          <div key={i} onClick={() => nav(`/app/thread/enquiry/${r._id}`)} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{r.customer || "Enquiry"}</span>
              <span style={{ color: "#c99400", fontSize: 11.5 }}>{r.status || "Review Pending"}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {r.id ? r.id + " · " : ""}{r.enquiryType || ""}{r.product ? " · " + r.product : ""}
            </div>
            {r.firm && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{r.firm}{r.city ? " · " + r.city : ""}</div>}
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, fontWeight: 700 }}>Tap to reply →</div>
          </div>
        ))}
      </div>
    </>
  );
}

function chip(active) {
  return { padding: "6px 14px", borderRadius: 20, border: active ? "none" : "1px solid #d7dcef", background: active ? "var(--navy)" : "#fff", color: active ? "#fff" : "var(--muted)", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 };
}

function FieldQuotationNew({ prefill }) {
  const nav = useNavigate();
  const loc = typeof window !== "undefined" ? window.history.state : null;
  const pf = prefill || {};
  const [f, setF] = useState({
    category: pf.category || "", partyName: pf.customer || pf.partyName || "", projectName: pf.projectName || "",
    address: pf.address || "", pincode: pf.pincode || "", gst: pf.gst || "", pan: pf.pan || "",
    contactName: pf.contactName || "", contactNumber: pf.contactNumber || "",
    rate: "", validTill: "", notes: "",
  });
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);

  const ratePerSqm = f.rate ? (Number(f.rate) * 10.764).toFixed(2) : "";
  const inp = { width: "100%", marginBottom: 12 };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const u = await api.uploadPhoto(file, "quotation"); setPhoto(u.url); }
    catch (e) { alert("Upload failed: " + e.message); }
    setBusy(false);
  };

  return (
    <>
      <ScreenHead title="New Quotation" />
      <div className="f-form">
        {pf.customer && <div style={{ background: "#e8f7ee", color: "#1f7a44", fontSize: 12, padding: "8px 10px", borderRadius: 8, marginBottom: 12 }}>✓ Details carried from Follow Up</div>}

        <label>Category</label>
        <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp} />
        <label>Party Name <b>*</b></label>
        <input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} style={inp} />
        <label>Project Name</label>
        <input value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} style={inp} />
        <label>Address</label>
        <textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} style={inp} />
        <label>Pincode</label>
        <input value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} style={inp} />
        <label>GST Number</label>
        <input value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value.toUpperCase() })} style={inp} />
        <label>PAN Number</label>
        <input value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} style={inp} />
        <label>Contact Name</label>
        <input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} style={inp} />
        <label>Contact Number</label>
        <input inputMode="numeric" value={f.contactNumber} onChange={(e) => setF({ ...f, contactNumber: e.target.value.replace(/\D/g, "") })} style={inp} />

        <label>Rate (per sq ft ₹) <b>*</b></label>
        <input inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, "") })} placeholder="e.g. 190" style={inp} />
        {ratePerSqm && (
          <div style={{ background: "#eef1ff", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 }}>
            <b>Rate per sq meter:</b> ₹{ratePerSqm}
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>({f.rate} × 10.764)</div>
          </div>
        )}

        <label>Valid Till</label>
        <input type="date" value={f.validTill} onChange={(e) => setF({ ...f, validTill: e.target.value })} style={inp} />
        <label>Notes</label>
        <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={inp} />

        <label>Photo (optional)</label>
        <input type="file" accept="image/*" onChange={(e) => upload(e.target.files[0])} style={{ marginBottom: 8 }} />
        {busy && <div style={{ fontSize: 12, color: "var(--muted)" }}>Uploading…</div>}
        {photo && <img src={photo} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />}

        <button className="f-submit" style={{ width: "100%" }}
          disabled={!f.partyName || !f.rate || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.create("quotation", {
                id: "QUOT-" + String(Date.now()).slice(-4),
                ...f, customer: f.partyName, ratePerSqm, status: "Pending",
                createdBy: CU().name, createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                ...(photo ? { photo } : {}),
              });
              nav("/app/m/quotation");
            } catch (e) { alert(e.message); setBusy(false); }
          }}>
          Save Quotation
        </button>
      </div>
    </>
  );
}

function FieldNearBy() {
  const [rows, setRows] = useState(null);
  const [myLoc, setMyLoc] = useState(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMyLoc("denied"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    // gather parties from followups + projects that have a saved location
    Promise.all([api.list("followup", false), api.list("siteProject", false)])
      .then(([a, b]) => {
        const all = [...(a.records || []), ...(b.records || [])].map((r) => r.data);
        setRows(all.filter((r) => r.address || r.city));
      })
      .catch(() => setRows([]));
  }, []);

  const withDist = useMemo(() => {
    if (!rows) return null;
    if (!myLoc || myLoc === "denied") return rows.map((r) => ({ ...r, dist: null }));
    return rows
      .map((r) => ({ ...r, dist: r.lat && r.lng ? haversineKm(myLoc, { lat: Number(r.lat), lng: Number(r.lng) }) : null }))
      .sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999));
  }, [rows, myLoc]);

  return (
    <>
      <ScreenHead title="Near By Customers" />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {myLoc === "denied" && <div style={{ background: "#fdf0e6", color: "#a35a1f", padding: 10, borderRadius: 10, fontSize: 12.5, marginBottom: 12 }}>Location off — showing all saved customers. Turn on location to sort by distance.</div>}
        {withDist === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Finding customers near you…</div>
        ) : withDist.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>No saved customers with location yet.</div>
        ) : withDist.map((r, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{r.partyName || r.customer || r.name || "Customer"}</span>
              {r.dist != null && <span style={{ color: "var(--accent)", fontSize: 12 }}>{fmtKm(r.dist)}</span>}
            </div>
            {r.category && <div style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 700, marginTop: 2 }}>{r.category}</div>}
            {r.address && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>📍 {r.address}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {r.contactNumber && <button onClick={() => (window.location.href = `tel:${r.contactNumber}`)} style={actBtn("#1f9d55")}>📞 Call</button>}
              {(r.whatsapp || r.contactNumber) && <button onClick={() => window.open(`https://wa.me/91${r.whatsapp || r.contactNumber}`, "_blank")} style={actBtn("#25d366")}>💬 WhatsApp</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FieldNearByRoute() { return <FieldNearBy />; }

const STATUS_OPTS = {
  enquiry: ["Review Pending", "Inprocess", "Completed", "Win", "Close"],
  task: ["Pending", "In Progress", "Completed", "Close", "Rejected"],
  salesToSpec: ["Pending", "Process", "Work Done", "Approved", "Rejected"],
  specToSales: ["Pending", "Process", "Work Done", "Approved", "Rejected"],
};

function FieldThreadRoute() {
  const { mod, rid } = useParams();
  return <FieldGenericThread mod={mod} id={rid} />;
}

function FieldGenericThread({ mod, id }) {
  const [rec, setRec] = useState(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(mod, id).then((d) => setRec({ _id: d.record.id, ...d.record.data })).catch(() => {});
  useEffect(() => { load(); }, [mod, id]);

  const send = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let doc = "";
      if (file) { const u = await api.uploadPhoto(file, mod); doc = u.url; }
      const thread = [...(rec.thread || []), { by: CU().name, text: text.trim(), doc, at: new Date().toLocaleString("en-IN") }];
      const data = { ...rec, thread }; delete data._id;
      await api.update(mod, id, data);
      setText(""); setFile(null); load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  if (!rec) return <><ScreenHead title="Details" /><div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</div></>;
  const thread = rec.thread || [];

  return (
    <>
      <ScreenHead title={rec.id || "Details"} />
      <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eceff8" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{rec.project || rec.customer || rec.title || rec.category || rec.type || mod} {rec.amount ? "· ₹" + Number(rec.amount).toLocaleString("en-IN") : ""}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{rec.product || rec.desc || rec.help || ""}</div>
        {(rec.colourApproved || rec.sqmApproved) && (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {rec.colourApproved && <span style={{ fontSize: 11, background: "#eef1ff", color: "#3949ab", padding: "3px 8px", borderRadius: 6 }}>Colour: {rec.colourApproved}</span>}
            {rec.sqmApproved && <span style={{ fontSize: 11, background: "#e8f7ee", color: "#1f7a44", padding: "3px 8px", borderRadius: 6 }}>Sq.m: {rec.sqmApproved}</span>}
          </div>
        )}
        {rec.rejectRemark && <div style={{ background: "#fdecec", color: "#c03636", fontSize: 12, padding: "6px 8px", borderRadius: 8, marginTop: 6 }}>Rejected: {rec.rejectRemark}</div>}
        {STATUS_OPTS[mod] && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Update Status</label>
            <select value={rec.status || ""} onChange={async (e) => {
              const data = { ...rec, status: e.target.value }; delete data._id;
              try { await api.update(mod, id, data); setRec({ ...rec, status: e.target.value }); } catch (er) { alert(er.message); }
            }} style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #d7dcef", fontSize: 13, marginTop: 4 }}>
              {STATUS_OPTS[mod].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 150 }}>
        {thread.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 20 }}>No messages yet. You can reply below.</div>}
        {thread.map((m, i) => {
          const mine = m.by === CU().name;
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
              <div style={{ background: mine ? "var(--navy)" : "#fff", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "9px 12px", fontSize: 13, boxShadow: "var(--shadow)" }}>
                {m.text}
                {m.doc && <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}>📎 View document</a>}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.by} · {m.at}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "fixed", bottom: "calc(62px + env(safe-area-inset-bottom))", left: 0, right: 0, maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: "#fff", borderTop: "1px solid var(--line)", zIndex: 45 }}>
        <label style={{ display: "grid", placeItems: "center", cursor: "pointer", width: 38 }}>📎<input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} /></label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={file ? file.name : "Type a reply…"} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 20, padding: "10px 14px", fontSize: 13, outline: "none" }} />
        <button className="f-submit" style={{ padding: "8px 16px", borderRadius: 20 }} disabled={busy} onClick={send}>Send</button>
      </div>
    </>
  );
}

function SpecThreadRoute() {
  const { specId } = useParams();
  return <FieldSpecThread id={specId} />;
}

function VisitPopup({ onClose, onConfirm }) {
  const [type, setType] = useState("Local");
  const [subType, setSubType] = useState("Outstation");
  const [name, setName] = useState("");
  const ok = name.trim().length > 0;
  return (
    <div className="f-sheet-mask" style={{ zIndex: 70 }} onClick={onClose}>
      <div className="f-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 17, marginBottom: 14 }}>Start Attendance</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {["Local", "Tour"].map((t) => (
            <button key={t} onClick={() => setType(t)}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: type === t ? "2px solid var(--navy)" : "1.5px solid #d7dcef", background: type === t ? "#eef1ff" : "#fff", fontWeight: 800, fontSize: 14, color: type === t ? "var(--navy)" : "var(--muted)" }}>
              {t}
            </button>
          ))}
        </div>
        {type === "Tour" && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>Tour Type <b style={{ color: "#d64545" }}>*</b></label>
            <select value={subType} onChange={(e) => setSubType(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 11, border: "1.5px solid #d7dcef", fontSize: 15 }}>
              <option>Outstation</option>
              <option>ExStation</option>
            </select>
          </div>
        )}
        <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
          {type === "Local" ? "City / Area name" : "Tour place name"} <b style={{ color: "#d64545" }}>*</b>
        </label>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder={type === "Local" ? "e.g. Bangalore" : "e.g. Kalburgi"}
          style={{ width: "100%", padding: "12px", borderRadius: 11, border: "1.5px solid #d7dcef", fontSize: 15, marginBottom: 16 }}
        />
        <button
          className="f-submit" style={{ width: "100%", opacity: ok ? 1 : 0.5 }}
          disabled={!ok}
          onClick={() => onConfirm({ type: type === "Tour" ? subType : "Local", name: name.trim() })}
        >
          Start Attendance
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------ APP SHELL ------------------------------------------------ */
export default function FieldApp() {
  const nav = useNavigate();
  useNotifTapHandler();               // phone notification tap -> open screen + mark read
  const [authed, setAuthed] = useState(auth.isLoggedIn);
  const [menu, setMenu] = useState(false);
  const [visitPopup, setVisitPopup] = useState(false);
  const visitInfoRef = useRef({ type: "Local", name: "" });
  const [attendanceOn, setAttendanceOn] = useState(false);

  /* If a session is still RUNNING on the server (app was closed/killed mid-attendance),
     silently resume tracking that SAME session — no fresh start, keeps existing km. */
  useEffect(() => {
    if (!authed) return;
    api.attToday().then((d) => {
      if (d.session && d.session.status === "RUNNING" && !attendanceOn) {
        sessionRef.current = Number(d.session.id);
        setAttendanceOn(true);
      }
    }).catch(() => {});
    // eslint-disable-next-line
  }, [authed]);

  const [tracking, setTracking] = useState({ points: [], km: 0, startedAt: null, stoppedAt: null, error: "" });
  const [gpsAlarm, setGpsAlarm] = useState(false);
  const alarmCtx = useRef(null);
  const alarmTimer = useRef(null);
  const lastPointAt = useRef(0);
  const trackingErrorRef = useRef("");
  const stopRef = useRef(null);
  const sessionRef = useRef(null);
  const batteryRef = useRef(null);
  const lastSavedPt = useRef(null);   // last point actually stored (1 km / idle filter)

  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        const upd = () => { batteryRef.current = Math.round(b.level * 100); };
        upd(); b.addEventListener("levelchange", upd);
      }).catch(() => {});
    }
  }, []);
  const pendingRef = useRef([]);      // points not yet uploaded
  const uploadTimer = useRef(null);

  const [expenses, setExpenses] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [followups, setFollowups] = useState([]);

  /* load my data on login + refresh whenever app comes to foreground (approvals reflect) */
  useEffect(() => {
    if (!authed) return;
    const loadLists = () => {
      api.list("expense", true).then((d) => setExpenses((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});
      api.list("leave", true).then((d) => setLeaves((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});
      api.list("followup", true).then((d) => setFollowups((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});
    };
    loadLists();
    const onVis = () => { if (document.visibilityState === "visible") loadLists(); };
    document.addEventListener("visibilitychange", onVis);

    // poll notifications; fire a phone notification for any NEW one addressed to me
    let seen = new Set(JSON.parse(localStorage.getItem("eb_seen_notif") || "[]"));
    const pollNotif = () => {
      api.myNotifications().then((d) => {
        const me = CU();
        const mine = (d.records || []).map((r) => ({ id: r.id, ...r.data }))
          .filter((n) => !n.to || n.to === me.name || n.to === me.code || n.to === me.mobile);
        const readSet = getReadIds();
        mine.forEach((n) => {
          const nid = String(n.id);
          if (!seen.has(nid) && !readSet.has(nid)) {          // already-read ones never re-fire
            seen.add(nid);
            phoneNotify(n.title || "Eurobond CRM", n.message || "", { notifId: nid, link: n.link || "/app/notifications" });
          }
        });
        localStorage.setItem("eb_seen_notif", JSON.stringify([...seen].slice(-200)));
      }).catch(() => {});
    };
    const firstLoad = !localStorage.getItem("eb_seen_notif");
    if (firstLoad) {
      // seed seen set silently so we don't spam old notifications on first login
      api.myNotifications().then((d) => {
        const ids = (d.records || []).map((r) => r.id);
        localStorage.setItem("eb_seen_notif", JSON.stringify(ids));
        seen = new Set(ids);
      }).catch(() => {});
    }
    const notifTimer = setInterval(pollNotif, 60000);   // 60s — server load for 500 users

    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(notifTimer); };
  }, [authed]);

  /* GPS start/stop driven by attendanceOn — saves to Hostinger */
  useEffect(() => {
    let cancelled = false;
    if (attendanceOn) {
      setTracking((t) => ({ ...t, points: [], km: 0, startedAt: Date.now(), stoppedAt: null, error: "" }));
      pendingRef.current = [];
      lastSavedPt.current = null;
      syncGpsCfg();
      // start server session
      api.attStart(visitInfoRef.current)
        .then((d) => { if (!cancelled) { sessionRef.current = d.session_id; localStorage.setItem("eb_att_on", "1"); } })
        .catch((e) => setTracking((t) => ({ ...t, error: e.message })));

      stopRef.current = watchLocation(
        (p) => {
          lastPointAt.current = Date.now();
          trackingErrorRef.current = "";
          setGpsAlarm(false);

          const cfg = loadGpsCfg();
          if (!withinOfficeHours(cfg)) return;                 // outside office hours -> nothing stored/sent

          const last = lastSavedPt.current;
          if (last) {
            const moved = haversineKm(last, p);                 // km since last saved point
            const idleFor = Date.now() - (last.t || 0);
            /* keep the point only if he really moved 1 km, or he's idle and 5 min passed */
            if (moved < (cfg.minDistanceKm ?? 1) && idleFor < (cfg.idleMaxMs ?? 300000)) return;
          }
          p.t = Date.now();
          p.online = navigator.onLine;
          p.battery = batteryRef.current;
          lastSavedPt.current = p;

          pendingRef.current.push(p);
          setTracking((t) => {
            const points = [...t.points, p];
            return { ...t, points, km: totalDistanceKm(points) };
          });
        },
        (err) => {
          trackingErrorRef.current = err.message || "Location error";
          setTracking((t) => ({ ...t, error: err.message || "Location error" }));
        }
      );

      // upload buffered points every 20s
      uploadTimer.current = setInterval(async () => {
        if (!sessionRef.current || pendingRef.current.length === 0) return;
        const batch = pendingRef.current.splice(0);
        try { await api.attPoints(sessionRef.current, batch); }
        catch { pendingRef.current.unshift(...batch); } // retry next time
      }, 60000);   // flush buffered points once a minute

    } else if (stopRef.current) {
      stopRef.current(); stopRef.current = null;
      clearInterval(uploadTimer.current);
      setTracking((t) => (t.startedAt ? { ...t, stoppedAt: Date.now() } : t));
      // final flush + stop session
      (async () => {
        const sid = sessionRef.current;
        if (sid) {
          if (pendingRef.current.length) { try { await api.attPoints(sid, pendingRef.current.splice(0)); } catch {} }
          try { await api.attStop(sid); } catch {}
          localStorage.removeItem("eb_att_on");
          sessionRef.current = null;
        }
      })();
    }
    return () => { cancelled = true; if (stopRef.current) { stopRef.current(); stopRef.current = null; } clearInterval(uploadTimer.current); };
  }, [attendanceOn]);

  /* ---- GPS-off alarm: phone notification + loud beep + vibrate until GPS is back ---- */
  useEffect(() => {
    const beep = () => {
      try {
        if (!alarmCtx.current) alarmCtx.current = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = alarmCtx.current;
        if (ctx.state === "suspended") ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square"; o.frequency.value = 1000;
        g.gain.setValueAtTime(0.6, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.6);
      } catch {}
      if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
    };

    const notify = () => {
      try {
        // Capacitor native local notification (shows in phone tray)
        const Cap = window.Capacitor;
        if (Cap && Cap.Plugins && Cap.Plugins.LocalNotifications) {
          Cap.Plugins.LocalNotifications.schedule({
            notifications: [{ id: Date.now() % 100000, title: "⚠️ GPS is OFF", body: "Turn ON location to continue attendance tracking." }],
          });
        } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "gps-alarm" });
        } else if ("Notification" in window && Notification.permission === "granted") {
          new Notification("⚠️ GPS is OFF", { body: "Please turn ON your location.", tag: "gps-alarm" });
        }
      } catch {}
    };

    if (gpsAlarm) {
      beep(); notify();
      alarmTimer.current = setInterval(() => { beep(); notify(); }, 2000);
    } else {
      clearInterval(alarmTimer.current);
      if (navigator.vibrate) navigator.vibrate(0);
      try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: "gps-ok" }); } catch {}
    }
    return () => clearInterval(alarmTimer.current);
  }, [gpsAlarm]);

  /* watchdog: no GPS point for 45s while attendance on, or a location error => alarm */
  useEffect(() => {
    if (!attendanceOn) { setGpsAlarm(false); return; }
    lastPointAt.current = Date.now();
    const id = setInterval(() => {
      setGpsAlarm(!!trackingErrorRef.current);
    }, 4000);
    return () => { clearInterval(id); setGpsAlarm(false); };
  }, [attendanceOn]);

  if (!authed) {
    return (
      <div className="phone-stage">
        <div className="phone">
          <FieldLogin onLogin={() => setAuthed(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="phone-stage">
      <div className="phone">
        {/* top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(12px + env(safe-area-inset-top)) 16px 12px", background: "#fff", borderBottom: "1px solid #eceff8" }}>
          <button onClick={() => setMenu(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Menu size={22} /></button>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <img src={logoImg} alt="Eurobond" style={{ height: 22 }} />
          </div>
        </div>

        <div className="phone-body">
          <Routes>
            <Route index element={<FieldHome attendanceOn={attendanceOn} setAttendanceOn={setAttendanceOn} tracking={tracking} expenses={expenses} followups={followups} leaves={leaves} onStartAttendance={() => setVisitPopup(true)} />} />
            <Route path="attendance" element={<FieldAttendance attendanceOn={attendanceOn} setAttendanceOn={setAttendanceOn} tracking={tracking} setTracking={setTracking} gpsAlarm={gpsAlarm} />} />
            <Route path="expense" element={<FieldExpense list={expenses} add={(e) => setExpenses((x) => [e, ...x])} />} />
            <Route path="expense/new" element={<FieldExpenseNew add={async (e) => { try { const r = await api.create("expense", e); setExpenses((x) => [{ _id: r.id, ...e }, ...x]); } catch (err) { alert(err.message); } }} />} />
            <Route path="leave" element={<FieldLeave leaves={leaves} add={(l) => setLeaves((x) => [l, ...x])} />} />
            <Route path="leave/new" element={<FieldLeaveNew add={async (l) => { try { const r = await api.create("leave", l); setLeaves((x) => [{ _id: r.id, ...l }, ...x]); const mgr = CU().manager; if (mgr) { try { await api.notify({ to: mgr, title: "Leave request", message: `${CU().name} applied for ${l.type} (${l.from} to ${l.to})`, createdAt: new Date().toLocaleString("en-IN") }); } catch {} } } catch (err) { alert(err.message); } }} />} />
            <Route path="followup" element={<FieldFollowUp items={followups} add={async (f) => {
              if (f._update) {
                const idx = f._idx;
                const target = followups[idx];
                const updates = [...(target.updates || []), f._update];
                const data = { ...target, updates }; delete data._id; delete data._update; delete data._idx;
                setFollowups((x) => x.map((it, i) => (i === idx ? { ...it, updates } : it)));
                if (target._id) { try { await api.update("followup", target._id, data); } catch {} }
              } else {
                try { const r = await api.create("followup", f); setFollowups((x) => [{ _id: r.id, ...f }, ...x]); } catch (err) { alert(err.message); }
              }
            }} />} />
            <Route path="followup/new" element={<FieldFollowUpNew add={async (f) => { try { const r = await api.create("followup", f); setFollowups((x) => [{ _id: r.id, ...f }, ...x]); } catch (err) { alert(err.message); } }} />} />
            <Route path="project/new" element={<FieldModuleNew mod="siteProject" />} />
            {Object.keys(APP_MODS).map((m) => (
              <Route key={m} path={`m/${m}`} element={m === "enquiry" ? <FieldEnquiry /> : <FieldModule mod={m} />} />
            ))}
            {Object.keys(APP_MODS).map((m) => (
              <Route key={m + "n"} path={`m/${m}/new`} element={
                m === "quotation" ? <FieldQuotationNew prefill={QUOTE_PREFILL.data} />
                : <FieldModuleNew mod={m} />
              } />
            ))}
            <Route path="target" element={<FieldTarget />} />
            <Route path="notifications" element={<FieldNotifications />} />
            <Route path="spec/:specId" element={<SpecThreadRoute />} />
            <Route path="nearby" element={<FieldNearBy />} />
            <Route path="thread/:mod/:rid" element={<FieldThreadRoute />} />
            <Route path="profile" element={<FieldProfile onLogout={() => { api.logout(); setAuthed(false); setAttendanceOn(false); nav("/"); }} />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>

        {/* bottom nav */}
        <div className="f-nav">
          <NavLink to="/app" end><Home size={19} /><span>Home</span></NavLink>
          <NavLink to="/app/attendance"><CalendarCheck size={19} /><span>Attendance</span></NavLink>
          <NavLink to="/app/target"><Target size={19} /><span>Target</span></NavLink>
          <NavLink to="/app/profile"><User size={19} /><span>Profile</span></NavLink>
        </div>

        <MenuDrawer open={menu} close={() => setMenu(false)} />
        {visitPopup && (
          <VisitPopup
            onClose={() => setVisitPopup(false)}
            onConfirm={(info) => { visitInfoRef.current = info; setVisitPopup(false); setAttendanceOn(true); nav("/app/attendance"); }}
          />
        )}
      </div>
    </div>
  );
}
