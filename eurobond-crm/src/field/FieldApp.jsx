import logoImg from "../assets/logo.jpg";
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, NavLink, useNavigate, Navigate, useParams } from "react-router-dom";
import {
  Home, CalendarCheck, Target, User, Users, Plus, Menu, Bell, ChevronRight, ChevronLeft,
  MapPin, Clock, Wallet, ClipboardList, LogOut, Phone, Mail, Building2, X,
  PlaneTakeoff, FileText, CalendarDays, Briefcase, ListChecks, Map as MapIcon,
  Play, Square, Navigation, Smartphone, CheckCircle2, AlertCircle, Eye, EyeOff, Camera, Search, Filter,
} from "lucide-react";
import { watchLocation, totalDistanceKm, haversineKm, fmtKm, fmtDuration } from "../lib/geo.js";
import { api, auth } from "../lib/api.js";
import { MODULES } from "../admin/moduleConfigs.jsx";

/* logged-in field user (from auth) with safe fallbacks */
const CU = () => auth.user || {};

/* app role -> visibility key */
const roleKey = () => {
  const r = `${CU().role || ""}`.toLowerCase();
  const d = `${CU().designation || ""}`.toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("hod")) return (r.includes("spec") || d.includes("spec")) ? "hod-spec" : "hod-sales";
  if (r.includes("spec") || d.includes("spec")) return "spec";
  return "sales";
};
const roleCanSee = (allowed) => !allowed || allowed.includes(roleKey());

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
const QUOTE_PREFILL = { data: null };
const isMine = (n, me) => {
  /* audience-based (Holiday/Announcement): All / Zone / City / Users */
  if (n.audienceType) {
    const t = n.audienceType, v = String(n.audienceValue || "").toLowerCase();
    if (t === "All") return true;
    if (t === "Zone") return v.split(",").map((x) => x.trim()).includes((me.zone || "").toLowerCase());
    if (t === "City") return v.split(",").map((x) => x.trim()).includes((me.city || "").toLowerCase());
    if (t === "Users") return v.split(",").map((x) => x.trim()).includes((me.name || "").toLowerCase());
    return false;
  }
  if (n.to === "ADMIN") return false;
  return !n.to || n.to === me.name || n.to === me.code || n.to === me.mobile;
};

/* ---------------- GPS / OFFICE-HOURS CONFIG (server-load control) ----------------
   Points are recorded ONLY when the person actually moved 1 km,
   or once every 5 min while idle. Outside office hours nothing is sent.
   Admin can override these from Masters -> App Settings.                        */
const GPS_CFG = {
  intervalSec: 30,           // record one point every 30 seconds (moving OR idle)
  minDistanceKm: 0,          // 0 = pure time-based
  idleMaxMs: 30 * 1000,
  officeStart: "09:00",
  officeEnd: "20:00",
  officeHoursOnly: false,
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
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`, { headers: { "Accept-Language": "en" } });
    const j = await r.json();
    const a = j.address || {};
    const road = a.road || a.pedestrian || a.footway || "";
    const area = a.neighbourhood || a.suburb || a.quarter || a.residential || "";
    const city = a.city || a.town || a.village || a.county || "";
    const state = a.state || "";
    const pin = a.postcode || "";
    /* FULL location: road, area, city, state + pincode */
    const name = [road, area, city, state].filter(Boolean).join(", ") + (pin ? " - " + pin : "")
      || j.display_name
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
function FieldHome({ attendanceOn, setAttendanceOn, tracking, expenses, followups, leaves, onStartAttendance, onStopAttendance }) {
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
    { label: "Customer", icon: <ClipboardList size={15} />, big: `${followups.length}`, note: "total customers", to: "/app/customers" },
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
        <SlideToStart on={attendanceOn} onToggle={() => { if (!attendanceOn) { onStartAttendance(); } else { onStopAttendance(); } }} />
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
                { t: "Add Customer", ic: <ClipboardList size={18} />, to: "/app/followup/new" },
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
      /* idle (sitting) points -> vankaya/purple dots */
      latlngs.forEach((p, i) => {
        if (i === 0 || i === latlngs.length - 1) return;
        const prev = latlngs[i - 1];
        const movedKm = haversineKm(prev, p);
        if (movedKm < 0.05) {
          L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 2, fillColor: "#7b2d8b", fillOpacity: 0.95 })
            .bindPopup("Sitting / stopped here").addTo(mapObj.current);
        }
      });
      if (attendanceOn) {
        /* live marker: moving -> bike glide; sitting -> "Sitting" label */
        const idleNow = Date.now() - (last.t || 0) > 3 * 60 * 1000 || latlngs.length < 2 ||
          haversineKm(latlngs[latlngs.length - 2] || last, last) < 0.05;
        const liveIcon = L.divIcon({
          className: "",
          html: `<div class="uber-dot">${idleNow ? '<span class="sit-tag">Sitting</span>' : ''}<span class="uber-pulse"></span><span class="uber-core">🏍️</span></div>`,
          iconSize: [46, 58], iconAnchor: [23, 29],
        });
        markerRef.current = L.marker([last.lat, last.lng], { icon: liveIcon, zIndexOffset: 999 }).addTo(mapObj.current);
      } else {
        markerRef.current = L.circleMarker([last.lat, last.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#eb3b5a", fillOpacity: 1 }).bindPopup("End").addTo(mapObj.current);
      }
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

  /* live glide: kotha GPS point vachinappudu marker smooth ga move (Uber feel) */
  useEffect(() => {
    if (tab !== "Map" || !attendanceOn || !markerRef.current || !mapObj.current) return;
    const last = tracking.points[tracking.points.length - 1];
    if (!last) return;
    const from = markerRef.current.getLatLng();
    const to = L.latLng(last.lat, last.lng);
    if (from.equals(to)) return;
    const steps = 30; let i = 0;
    const t = setInterval(() => {
      i++;
      const lat = from.lat + (to.lat - from.lat) * (i / steps);
      const lng = from.lng + (to.lng - from.lng) * (i / steps);
      markerRef.current.setLatLng([lat, lng]);
      if (i >= steps) { clearInterval(t); mapObj.current.panTo(to, { animate: true, duration: 0.6 }); if (lineRef.current) lineRef.current.addLatLng(to); }
    }, 33);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [tracking.points.length, tab, attendanceOn]);

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
    const pts = timelinePoints.filter((x) => !x.appClosed).slice(0, 30);
    (async () => {
      for (const p of pts) {
        if (stop) return;
        const key = p.lat.toFixed(4) + "," + p.lng.toFixed(4);
        if (names[key]) continue;
        const nm = await placeName(p.lat, p.lng);
        if (stop) return;
        setNames((n) => ({ ...n, [key]: nm }));
        await new Promise((r) => setTimeout(r, 900));
      }
    })();
    return () => { stop = true; };
  }, [tab, tracking.points.length]);

  const km = tracking.km;

  /* timeline: EVERY recorded point is shown (login address, battery, online) +
     "App Closed" gaps in between. Points already come at ~90s interval. */
  const timelinePoints = useMemo(() => {
    const pts = tracking.points;   // show every recorded point (no accuracy filter)
    const out = [];
    let cum = 0, last = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const gap = last ? ((p.time || 0) - (last.time || 0)) : 0;
      if (last) {
        const d = haversineKm(last, p);
        if (d < 0.5) cum += d;
      }
      /* 5+ min gap between points = app was closed in between */
      if (gap > 300000 && last) {
        out.push({ ...last, cumKm: cum, appClosed: true, closedFrom: last.time, closedTo: p.time });
      }
      const isStop = gap > 120000 && gap <= 300000;   // stayed 2-5 min at same spot
      out.push({ ...p, cumKm: cum, stop: isStop, isStart: i === 0 });
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
              {attendanceOn ? "Getting your first location… please wait a few seconds." : "No location data yet. Start attendance to begin tracking."}
            </div>
          )}
          {timelinePoints.slice(0, 40).map((p, i) => {
            const key = p.lat.toFixed(4) + "," + p.lng.toFixed(4);
            if (p.appClosed) {
              const mins = Math.round((p.closedTo - p.closedFrom) / 60000);
              return (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff5f5", borderRadius: 12, padding: "11px 12px", marginBottom: 8, fontSize: 12.5, borderLeft: "4px solid #c03636" }}>
                  <Smartphone size={16} color="#c03636" />
                  <div style={{ flex: 1 }}>
                    <b style={{ color: "#c03636" }}>App Closed</b>
                    <div style={{ color: "var(--muted)", marginTop: 2 }}>
                      {new Date(p.closedFrom).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} → {new Date(p.closedTo).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {mins} min not tracked
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#fff", borderRadius: 12, padding: "11px 12px", marginBottom: 8, boxShadow: "var(--shadow)", fontSize: 12.5, borderLeft: p.stop ? "4px solid #eb3b5a" : "4px solid var(--accent)" }}>
                <MapPin size={16} color={p.stop ? "#eb3b5a" : "var(--accent)"} style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{names[key] || "Finding location…"}</b>
                  {p.isStart && <span style={{ background: "#e8f7ee", color: "#1f7a44", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 6, marginLeft: 6 }}>LOGIN</span>}
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
  const tabs = ["Submitted", "Approved", "Reject", "Paid"];
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
  const [presents, setPresents] = useState(null);

  /* ee nela lo naa attendance (present days) count */
  useEffect(() => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const to = now.toISOString().slice(0, 10);
    api.attList(from, to)
      .then((d) => {
        const mine = (d.sessions || []).filter((x) => Number(x.user_id) === Number(CU().id));
        setPresents(new Set(mine.map((x) => x.work_date)).size);
      })
      .catch(() => setPresents(0));
  }, []);

  /* leave days helper (Half Day = 0.5) */
  const days = (l) => {
    const a = new Date(l.from), b = new Date(l.to || l.from);
    const n = Math.max(1, Math.round((b - a) / 86400000) + 1);
    return (l.mode || "").toLowerCase().includes("half") ? n * 0.5 : n;
  };
  const now = new Date();
  const mKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const approved = leaves.filter((l) => (l.status || "").toLowerCase() === "approved");

  /* ee nela approved leaves total */
  const monthLeaves = approved.filter((l) => (l.from || "").startsWith(mKey)).reduce((s, l) => s + days(l), 0);

  /* PL: 30/year, April 1 reset — HOD approve ayina Privilege Leaves matrame minus */
  const fyStart = new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
  const plUsed = approved
    .filter((l) => (l.type || "").toLowerCase().includes("privilege") && new Date(l.from) >= fyStart)
    .reduce((s, l) => s + days(l), 0);
  const plLeft = Math.max(0, 30 - plUsed);

  const tiles = [
    { v: presents === null ? "…" : presents, k: "Presents", note: "this month" },
    { v: monthLeaves, k: "Leaves", note: "this month" },
    { v: plLeft, k: "PL Balance", note: "of 30 / year" },
  ];

  return (
    <>
      <ScreenHead title="Leave" right={<button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav("/app/leave/new")}>+ Apply</button>} />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {tiles.map((t) => (
            <div key={t.k} className="chart-card" style={{ textAlign: "center", padding: "12px 6px" }}>
              <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 18 }}>{t.v}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{t.k}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted)" }}>{t.note}</div>
            </div>
          ))}
        </div>
        {leaves.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 26 }}>No leave applications yet</div>}
        {leaves.map((l, i) => (
          <div key={i}
            onClick={() => l._id && nav(`/app/thread/leave/${l._id}`)}
            style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{l.type} · {l.mode}</span>
              <span style={{ color: l.status === "Approved" ? "#1f9d55" : l.status === "Rejected" ? "#c03636" : "#c99400" }}>{l.status}</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{l.from} → {l.to} · {l.reason}</div>
            <div style={{ color: "var(--accent)", fontSize: 11, marginTop: 6, fontWeight: 700 }}>💬 Tap to view / chat</div>
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

/* WhatsApp on follow-up save — admin App Settings lo API set aithe ne pampistundi.
   Template tarvata set cheddam annaru — appati varaku ee chinna draft veltundi. */
async function sendFollowupWhatsApp(number, party, type, date) {
  try {
    if (!number) return;
    const d = await api.list("appSettings", false);
    const cfg = ((d.records || [])[0] || {}).data || {};
    if (!cfg.waEnabled || !cfg.waApiUrl) return;
    const msg = `Dear ${party}, thank you for your time. Our Eurobond team has recorded a ${type} follow-up with you${date ? " (next: " + date + ")" : ""}. — Eurobond`;
    await fetch(cfg.waApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.waApiKey ? { Authorization: "Bearer " + cfg.waApiKey } : {}) },
      body: JSON.stringify({ to: "91" + String(number).slice(-10), message: msg }),
    });
  } catch { /* silent — followup save block avvakudadu */ }
}

function FieldFollowUpNew({ add }) {
  const nav = useNavigate();
  const pf = FOLLOWUP_PREFILL.data; FOLLOWUP_PREFILL.data = null;   // one-time prefill from Customer -> Follow Up
  const [f, setF] = useState({
    category: pf?.type || "Architect", partyName: pf?.name || "", projectName: "", address: "", pincode: "",
    gst: "", pan: "", type: "Call", date: "", notes: "", lat: null, lng: null,
  });
  const [contacts, setContacts] = useState([{ name: pf?.name || "", mobile: pf?.mobile || "", whatsapp: pf?.mobile || "" }]);
  const [locBusy, setLocBusy] = useState(true);

  /* address AUTO — form open avvagane GPS capture, edit cheyaledu (fake address end) */
  useEffect(() => {
    if (!navigator.geolocation) { setLocBusy(false); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const la = pos.coords.latitude, ln = pos.coords.longitude;
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${ln}&zoom=18`, { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        setF((x) => ({ ...x, address: j.display_name || `${la.toFixed(5)}, ${ln.toFixed(5)}`, pincode: (j.address || {}).postcode || "", lat: la, lng: ln }));
      } catch {
        setF((x) => ({ ...x, lat: pos.coords.latitude, lng: pos.coords.longitude }));
      }
      setLocBusy(false);
    }, () => setLocBusy(false), { enableHighAccuracy: true, timeout: 15000 });
  }, []);

  const setContact = (i, key, val) => setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  const addContact = () => setContacts((cs) => [...cs, { name: "", mobile: "", whatsapp: "" }]);
  const removeContact = (i) => setContacts((cs) => cs.filter((_, idx) => idx !== i));

  const inp = { width: "100%", marginBottom: 12 };
  const CATS = ["Architect", "Fabricator", "Consultant", "Dealer", "Builder", "Corporate", "Customer"];

  return (
    <>
      <ScreenHead title="Add Customer" />
      <div className="f-form">
        <label>Category <b>*</b></label>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp}>
          {CATS.map((c) => <option key={c}>{c}</option>)}
        </select>

        <label>Party Name <b>*</b></label>
        <input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} style={inp} />

        <label>Project Name</label>
        <input value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} style={inp} />

        <label>Address (auto — current location)</label>
        <div style={{ ...inp, background: "#f1f4fb", border: "1.5px solid #d7dcef", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: locBusy ? "var(--muted)" : "#33406b", minHeight: 42 }}>
          {locBusy ? "📍 Getting your location…" : (f.address ? `📍 ${f.address}` : "⚠️ Location unavailable — turn on GPS")}
        </div>

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
              contacts,
              contactName: primary.name, contactNumber: primary.mobile, whatsapp: primary.whatsapp,
              mobile: primary.mobile, place: f.address.split(",").slice(-3, -1).join(",").trim(),
              status: "To-Do", createdBy: CU().name,
              updates: [{ date: f.date, type: f.type, remark: f.notes, at: new Date().toLocaleString("en-IN") }],
            });
            /* WhatsApp: visit chesamu ani chinna draft customer ki (settings lo enable unte) */
            sendFollowupWhatsApp(primary.whatsapp || primary.mobile, f.partyName, f.type, f.date);
            if (window.confirm("Customer saved. Add a Quotation for this customer now?")) {
              QUOTE_PREFILL.data = { customer: f.partyName, mobile: primary.mobile, city: f.address };
              nav("/app/m/quotation/new");
            } else nav("/app/customers");
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
            await api.create("projectProjection", { name: f.name, stage: f.stage, status: "Running", city: f.city, value: f.value, createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
            setOk(true); setTimeout(() => nav("/app"), 900);
          } catch (e) { alert(e.message); }
        }}>
          Save Project
        </button>
      </div>
    </>
  );
}

/* ============================================================================
   TARGET & PERFORMANCE
   Admin target set chestaru; sales/spec person achievements add chestaru
   (date + project/customer + sq.feet + amount + invoice attach optional).
   Performance colors: 100%+ green · 60%+ amber · below red.
============================================================================ */
const pcColor = (pc) => (pc >= 100 ? "#1f9d55" : pc >= 60 ? "#e8a020" : "#d64545");

function FieldTarget() {
  const [targets, setTargets] = useState(null);
  const [entries, setEntries] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const isSpec = `${CU().role || ""} ${CU().designation || ""}`.toLowerCase().includes("spec");

  const load = () => {
    Promise.all([api.list("target", false), api.list("salesEntry", false)])
      .then(([t, e]) => {
        setTargets((t.records || []).map((r) => r.data).filter((x) => x.user === CU().name));
        setEntries((e.records || []).map((r) => ({ _id: r.id, ...r.data })).filter((x) => x.createdBy === CU().name));
      })
      .catch(() => setTargets([]));
  };
  useEffect(load, []);

  /* period ("July 2026") ki naa entries totals */
  const achFor = (t) => {
    const per = (t.period || "").toLowerCase().replace(/\s+/g, " ").trim();
    const inPeriod = entries.filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      const label = d.toLocaleString("en-IN", { month: "long", year: "numeric" }).toLowerCase();
      const label2 = d.toLocaleString("en-IN", { month: "short", year: "numeric" }).toLowerCase();
      return per.includes(label) || per.includes(label2) || label.includes(per);
    });
    const src = inPeriod.length ? inPeriod : entries;   // period match kakapothe anni
    return {
      sqft: src.reduce((s, e) => s + Number(e.sqft || 0), 0),
      amount: src.reduce((s, e) => s + Number(e.amount || 0), 0),
    };
  };

  return (
    <>
      <ScreenHead title="Target" back={false}
        right={<button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => setShowAdd(true)}>+ Add {isSpec ? "Approval" : "Sale"}</button>} />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {targets === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {targets.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 26, fontSize: 13 }}>
                <Target size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div style={{ fontWeight: 700 }}>No targets assigned yet</div>
              </div>
            )}
            {targets.map((t, i) => {
              const ach = achFor(t);
              const tgtS = Number(t.targetSqft || t.target || 0);
              const tgtA = Number(t.targetAmount || 0);
              const pcS = tgtS > 0 ? Math.round((ach.sqft / tgtS) * 100) : 0;
              const pcA = tgtA > 0 ? Math.round((ach.amount / tgtA) * 100) : 0;
              const mainPc = tgtA > 0 && !isSpec ? pcA : pcS;
              return (
                <div key={i} className="f-metric card-3d" style={{ marginBottom: 12, borderLeft: `5px solid ${pcColor(mainPc)}` }}>
                  <h5><Target size={15} /> {t.period || "Target"}
                    <span className="pct" style={{ background: pcColor(mainPc), color: "#fff", padding: "2px 9px", borderRadius: 8 }}>{mainPc}%</span>
                  </h5>
                  {tgtS > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}>
                        <span>Sq.Feet {isSpec ? "Approved" : "Sold"}</span>
                        <span style={{ color: pcColor(pcS) }}>{ach.sqft.toLocaleString("en-IN")} / {tgtS.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="bar"><i style={{ width: Math.min(100, pcS) + "%", background: pcColor(pcS) }} /></div>
                    </div>
                  )}
                  {tgtA > 0 && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}>
                        <span>Sales Amount</span>
                        <span style={{ color: pcColor(pcA) }}>₹{ach.amount.toLocaleString("en-IN")} / ₹{tgtA.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="bar"><i style={{ width: Math.min(100, pcA) + "%", background: pcColor(pcA) }} /></div>
                    </div>
                  )}
                  <small>{t.note || ""}</small>
                </div>
              );
            })}

            <div style={{ fontWeight: 800, fontSize: 14, margin: "16px 0 8px", fontFamily: "Bricolage Grotesque" }}>
              My {isSpec ? "Approval" : "Sales"} Entries ({entries.length})
            </div>
            {entries.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 12.5, textAlign: "center", padding: 14 }}>Use "+ Add" to record your entries</div>
            ) : entries.slice().reverse().map((e, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "11px 13px", marginBottom: 8, boxShadow: "var(--shadow)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{e.project}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{e.date} {e.invoice && <a href={e.invoice} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>· Invoice</a>}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{Number(e.sqft || 0).toLocaleString("en-IN")} sq.ft</div>
                  {e.amount > 0 && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>₹{Number(e.amount).toLocaleString("en-IN")}</div>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {showAdd && <AddSaleEntry isSpec={isSpec} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </>
  );
}

function AddSaleEntry({ isSpec, onClose, onSaved }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), project: "", sqft: "", amount: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const inp = { width: "100%", marginBottom: 12 };
  return (
    <div className="f-sheet-mask" style={{ zIndex: 70 }} onClick={busy ? undefined : onClose}>
      <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Add {isSpec ? "Approval" : "Sale"} Entry</div>
        <label>Date <b>*</b></label>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={inp} />
        <label>Project / Customer Name <b>*</b></label>
        <input value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} style={inp} />
        <label>Sq.Feet {isSpec ? "Approved" : "Sold"} <b>*</b></label>
        <input type="number" value={f.sqft} onChange={(e) => setF({ ...f, sqft: e.target.value })} style={inp} />
        {!isSpec && (<><label>Amount (₹)</label>
        <input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={inp} /></>)}
        <label>Invoice / Document (optional)</label>
        <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files[0])} style={{ marginBottom: 14 }} />
        <button className="f-submit" style={{ width: "100%", opacity: busy ? 0.6 : 1 }} disabled={busy || !f.project || !f.sqft}
          onClick={async () => {
            setBusy(true);
            try {
              let invoice = "";
              if (file) { const u = await api.uploadPhoto(file, "salesEntry"); invoice = u.url; }
              await api.create("salesEntry", {
                id: "SLE-" + String(Date.now()).slice(-4),
                ...f, invoice, entryType: isSpec ? "Specs" : "Sales",
                createdBy: CU().name,
                createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
              });
              onSaved();
            } catch (e) { alert(e.message); setBusy(false); }
          }}>
          {busy ? "Saving…" : "Save Entry"}
        </button>
      </div>
    </div>
  );
}

/* ---- HOD: Team Performance (Sales HOD -> sales team, Spec HOD -> spec team) ---- */
function FieldTeamPerformance() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("performance");
  const isSpecHod = `${CU().role || ""} ${CU().designation || ""}`.toLowerCase().includes("spec");

  useEffect(() => {
    Promise.all([api.listUsers(), api.list("target", false), api.list("salesEntry", false)])
      .then(([u, t, e]) => {
        const me = CU().name;
        const team = (u.users || []).filter((x) => x.manager === me && x.status == 1);
        const targets = (t.records || []).map((r) => r.data);
        const entries = (e.records || []).map((r) => r.data);
        setData(team.map((m) => {
          const tg = targets.filter((x) => x.user === m.name);
          const en = entries.filter((x) => x.createdBy === m.name);
          const tgtS = tg.reduce((s, x) => s + Number(x.targetSqft || x.target || 0), 0);
          const tgtA = tg.reduce((s, x) => s + Number(x.targetAmount || 0), 0);
          const achS = en.reduce((s, x) => s + Number(x.sqft || 0), 0);
          const achA = en.reduce((s, x) => s + Number(x.amount || 0), 0);
          const pc = isSpecHod
            ? (tgtS > 0 ? Math.round((achS / tgtS) * 100) : 0)
            : (tgtA > 0 ? Math.round((achA / tgtA) * 100) : (tgtS > 0 ? Math.round((achS / tgtS) * 100) : 0));
          return { m, tgtS, tgtA, achS, achA, pc };
        }));
      })
      .catch(() => setData([]));
  }, []);

  return (
    <>
      <ScreenHead title="Team Performance" />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} color="var(--muted)" style={{ position: "absolute", left: 11, top: 11 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team member…" style={{ width: "100%", padding: "9px 12px 9px 33px", borderRadius: 11, border: "1.5px solid #d7dcef", fontSize: 13, background: "#fff" }} />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "9px 12px", borderRadius: 11, border: "1.5px solid #d7dcef", fontSize: 13, background: "#fff" }}>
            <option value="performance">Top performers</option>
            <option value="lowest">Lowest first</option>
            <option value="name">Name</option>
          </select>
        </div>
        {data === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>Loading…</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>
            <Users size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>No team members mapped to you</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Ask admin to set your name in the "Manager" field for your team members.</div>
          </div>
        ) : data
          .filter(({ m }) => !q.trim() || m.name.toLowerCase().includes(q.toLowerCase()))
          .sort((a, b) => sortBy === "name" ? a.m.name.localeCompare(b.m.name) : sortBy === "lowest" ? a.pc - b.pc : b.pc - a.pc)
          .map(({ m, tgtS, tgtA, achS, achA, pc }, i) => (
          <div key={i} className="card-3d" style={{ background: "#fff", borderRadius: 14, padding: "13px 15px", marginBottom: 10, borderLeft: `5px solid ${pcColor(pc)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{m.name}<div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>{m.designation || m.role} {m.city ? "· " + m.city : ""}</div></div>
              <span style={{ background: pcColor(pc), color: "#fff", fontWeight: 800, fontSize: 12, padding: "3px 10px", borderRadius: 9 }}>{pc}%</span>
            </div>
            <div className="bar" style={{ marginTop: 8 }}><i style={{ width: Math.min(100, pc) + "%", background: pcColor(pc) }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted)", marginTop: 6, fontWeight: 600 }}>
              <span>{isSpecHod ? "Approved" : "Sold"}: {achS.toLocaleString("en-IN")} / {tgtS.toLocaleString("en-IN")} sq.ft</span>
              {!isSpecHod && tgtA > 0 && <span>₹{achA.toLocaleString("en-IN")} / ₹{tgtA.toLocaleString("en-IN")}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- HOD: Leave Approval (team leave requests approve/reject) ---- */
function FieldLeaveApproval() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [team, setTeam] = useState([]);

  const load = () => {
    Promise.all([api.listUsers(), api.list("leave", false)])
      .then(([u, l]) => {
        const myTeam = (u.users || []).filter((x) => x.manager === CU().name).map((x) => x.name);
        setTeam(myTeam);
        setRows((l.records || []).map((r) => ({ _id: r.id, ...r.data }))
          .filter((x) => myTeam.includes(x.createdBy || x.appliedBy || x.user)));
      })
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  const act = async (row, status) => {
    try {
      const data = { ...row, status, approvedBy: CU().name, approvedAt: new Date().toLocaleString("en-IN") };
      delete data._id;
      await api.update("leave", row._id, data);
      const who = row.createdBy || row.appliedBy || row.user;
      try { await api.notify({ to: who, title: `Leave ${status}`, message: `${row.type || "Leave"} (${row.from}${row.to ? " → " + row.to : ""}) — ${status} by ${CU().name}`, link: "/app/leave", createdAt: new Date().toLocaleString("en-IN") }); } catch {}
      load();
    } catch (e) { alert(e.message); }
  };

  const pending = (rows || []).filter((r) => (r.status || "").toLowerCase() === "pending" || !r.status);
  const done = (rows || []).filter((r) => (r.status || "").toLowerCase() !== "pending" && r.status);

  const Card = ({ r, actions }) => (
    <div className="card-3d" style={{ background: "#fff", borderRadius: 13, padding: "12px 14px", marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800, fontSize: 13.5 }}>{r.createdBy || r.appliedBy || r.user}</div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 7, background: (r.status || "Pending") === "Approved" ? "#e8f7ee" : (r.status || "Pending") === "Rejected" ? "#fdecec" : "#fff7e0", color: (r.status || "Pending") === "Approved" ? "#1f7a44" : (r.status || "Pending") === "Rejected" ? "#c03636" : "#9a7500" }}>{r.status || "Pending"}</span>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 3 }}><b>{r.type || "Leave"}</b> · {r.from}{r.to && r.to !== r.from ? " → " + r.to : ""} {r.mode ? "· " + r.mode : ""}</div>
      {r.reason && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{r.reason}</div>}
      {r.photo && (
        <a href={r.photo} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6 }}>
          {String(r.photo).match(/\.pdf$/i)
            ? <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>📄 View Attachment</span>
            : <img src={r.photo} alt="attachment" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #dfe4f0" }} />}
        </a>
      )}
      <button onClick={() => nav(`/app/thread/leave/${r._id}`)} style={{ width: "100%", marginTop: 8, padding: "8px", borderRadius: 9, border: "1px solid var(--accent)", background: "#eef1ff", color: "var(--accent)", fontWeight: 700, fontSize: 12 }}>💬 Chat with applicant</button>
      {actions && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => act(r, "Approved")} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "#1f9d55", color: "#fff", fontWeight: 800, fontSize: 12.5 }}>✓ Approve</button>
          <button onClick={() => act(r, "Rejected")} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "#d64545", color: "#fff", fontWeight: 800, fontSize: 12.5 }}>✕ Reject</button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <ScreenHead title="Leave Approval" />
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {rows === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8, fontFamily: "Bricolage Grotesque" }}>Pending ({pending.length})</div>
            {pending.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 14 }}>No pending requests from your team.</div>}
            {pending.map((r, i) => <Card key={i} r={r} actions />)}
            {done.length > 0 && <div style={{ fontWeight: 800, fontSize: 13.5, margin: "14px 0 8px", fontFamily: "Bricolage Grotesque" }}>History</div>}
            {done.slice(0, 20).map((r, i) => <Card key={i} r={r} />)}
          </>
        )}
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
  /* Each drawer item carries its Team-Access KEY (4th element) — this must exactly
     match the keys used in admin TeamAccess. Access map is the ONLY control. */
  const myRole = CU().role || "";
  const canSee = (key) => {
    if (!key) return true;                          // no key (Home) → always
    if (!access || !access[myRole]) return true;    // admin never saved a map → show all
    return access[myRole][key] !== false;           // saved map decides
  };
  const rawGroups = [
    { h: "MAIN", items: [
      ["Home", <Home size={16} />, "/app", null],
      ["Customer", <ClipboardList size={16} />, "/app/followup/new", "customerForm"],
      ["Customers", <Users size={16} />, "/app/customers", "customers"],
      ["Near By Customers", <MapPin size={16} />, "/app/nearby", "nearby"],
    ] },
    { h: "WORK", items: [
      ["Enquiry", <FileText size={16} />, "/app/m/enquiry", "enquiry"],
      ["Quotation", <FileText size={16} />, "/app/m/quotation", "quotation"],
      ["Project Projection", <Building2 size={16} />, "/app/m/projectProjection", "projectProjection"],
      ["Sales to Spec", <ClipboardList size={16} />, "/app/m/salesToSpec", "salesToSpec"],
      ["Spec to Sales", <ClipboardList size={16} />, "/app/m/specToSales", "specToSales"],
      ["Expense", <Wallet size={16} />, "/app/m/expense", "expense"],
      ["Leave", <CalendarDays size={16} />, "/app/leave", "leave"],
    ] },
    { h: "MANAGEMENT", items: [
      ["Target", <Target size={16} />, "/app/target", "target"],
      ["Team Performance", <Users size={16} />, "/app/team", "teamPerformance"],
      ["Leave Approval", <CalendarDays size={16} />, "/app/leave-approval", "leaveApproval"],
      ["Attendance", <CalendarCheck size={16} />, "/app/attendance", "attendance"],
      ["Site Project", <Building2 size={16} />, "/app/project/new", "siteProjectForm"],
      ["Task", <ClipboardList size={16} />, "/app/m/task", "task"],
    ] },
  ];
  const groups = rawGroups.map((g) => ({ ...g, items: g.items.filter(([, , , key]) => canSee(key)) })).filter((g) => g.items.length);
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
    } else if (mod === "salesToSpec" || mod === "specToSales") {
      /* cross-visibility: entry chesina vaadu + tag ayina vaadu iddariki kanipiyali */
      api.list(mod, false).then((d) => {
        const me = CU().name;
        const list = (d.records || []).map((r) => ({ _id: r.id, ...r.data }))
          .filter((r) => r.createdBy === me || r.specPerson === me || r.salesPerson === me);
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
      <ScreenHead title={cfg.appLabel || cfg.crumb} right={(cfg.appReadOnly || mod === "salesToSpec" || mod === "specToSales" || mod === "projectProjection") ? null : <button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav(`/app/m/${mod}/new`)}>+ Add</button>} />
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
  const [specOpts, setSpecOpts] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [upBusy, setUpBusy] = useState(false);

  useEffect(() => {
    if ((cfg?.form || []).some((x) => x.optionsSource === "users" || x.optionsSource === "specUsers")) {
      api.listUsers().then((d) => {
        const act = (d.users || []).filter((u) => u.status == 1);
        setUserOpts(act.map((u) => u.name));
        setSpecOpts(act.filter((u) => `${u.role || ""} ${u.designation || ""}`.toLowerCase().includes("spec")).map((u) => u.name));
      }).catch(() => {});
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
          const opts = x.optionsSource === "users" ? userOpts : x.optionsSource === "specUsers" ? specOpts : x.options;
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
              /* Site Project entry -> Project Projection record; spec mention unte
                 salesToSpec "Revert" record kuda create + spec person ki notification */
              if (mod === "projectProjection" && f.specPerson) {
                try {
                  const sts = await api.create("salesToSpec", {
                    id: "STS-" + String(Date.now()).slice(-4),
                    project: f.name, firm: f.firm, city: f.city, value: f.value,
                    help: f.specHelp || "", specPerson: f.specPerson,
                    source: "Revert", projectionId: created && created.id ? created.id : "",
                    status: "Pending", createdBy: CU().name,
                    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                  });
                  await api.notify({ to: f.specPerson, title: "Sales to Spec — " + (f.name || ""), message: `${CU().name} tagged you: ${f.specHelp || ""}`, link: `/app/thread/salesToSpec/${sts && sts.id ? sts.id : ""}`, createdAt: new Date().toLocaleString("en-IN") });
                } catch {}
              }
              // sales to spec → notify tagged spec person, with link to open the thread
              if (mod === "salesToSpec" && f.specPerson) {
                try { await api.notify({ to: f.specPerson, title: "Sales to Spec — " + (f.project || ""), message: `${CU().name} tagged you: ${f.help || ""}`, link: `/app/thread/salesToSpec/${created && created.id ? created.id : ""}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
              }
              // spec to sales → notify the sales person
              if (mod === "specToSales" && f.salesPerson) {
                try {
                  /* spec direct visit: projection record + sales person ki "Direct" entry */
                  const pj = await api.create("projectProjection", {
                    id: "PPJ-" + String(Date.now()).slice(-4),
                    name: f.project, firm: f.firm || "", city: f.city || "", value: f.value || "",
                    details: f.help || "", status: "Running", source: "Direct",
                    createdBy: CU().name,
                    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                  });
                  await api.create("salesToSpec", {
                    id: "STS-" + String(Date.now()).slice(-4),
                    project: f.project, help: f.help || "", specPerson: CU().name, salesPerson: f.salesPerson,
                    source: "Direct", projectionId: pj && pj.id ? pj.id : "",
                    status: "Approved", createdBy: CU().name,
                    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                  });
                  await api.notify({ to: f.salesPerson, title: "Spec to Sales — " + (f.project || ""), message: `${CU().name}: ${f.help || ""}`, link: `/app/thread/specToSales/${created && created.id ? created.id : ""}`, createdAt: new Date().toLocaleString("en-IN") });
                } catch {}
              }
              // site project with specification help → notify spec person
              if (false) {
                try { await api.notify({ to: f.specPerson, title: "Specification help — " + (f.name || "Project"), message: `${CU().name} needs spec help on "${f.name}": ${f.specHelp}`, link: "/app/m/salesToSpec", createdAt: new Date().toLocaleString("en-IN") }); } catch {}
              }
              // task → notify the assignee
              if (mod === "task" && f.assignee) {
                try { await api.notify({ to: f.assignee, title: "New task assigned", message: `${CU().name} assigned you: ${f.title || "a task"}`, link: "/app/m/task", createdAt: new Date().toLocaleString("en-IN") }); } catch {}
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
      if (rec.specPerson) { try { await api.notify({ to: rec.specPerson, title: "Reply on spec " + (rec.id || ""), message: `${CU().name}: ${text.trim() || "sent a document"}`, link: "/app/thread/salesToSpec/" + id, createdAt: new Date().toLocaleString("en-IN") }); } catch {} }
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

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 170 }}>
        {thread.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 20 }}>No replies yet.</div>}
        {thread.map((m, i) => {
          const mine = m.by === CU().name;
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
              <div style={{ background: mine ? "var(--navy)" : "#fff", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "9px 12px", fontSize: 13, boxShadow: "var(--shadow)" }}>
                {m.text}
                {m.doc && (String(m.doc).match(/\.pdf$/i)
                  ? <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}>📄 View PDF</a>
                  : <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5 }}><img src={m.doc} alt="" style={{ maxWidth: 160, borderRadius: 8, display: "block" }} /></a>)}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.by} · {m.at}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "fixed", bottom: "calc(74px + env(safe-area-inset-bottom))", left: 0, right: 0, maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: "#fff", borderTop: "1px solid var(--line)", zIndex: 45 }}>
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

  const load = () => api.get("projectProjection", id).then((d) => setRec({ _id: d.record.id, ...d.record.data })).catch(() => {});
  useEffect(() => { load(); }, [id]);

  const addVisit = async () => {
    if (!remark.trim()) return;
    setBusy(true);
    try {
      const month = new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      const visits = [...(rec.visits || []), { month, remark: remark.trim(), by: CU().name, at: new Date().toLocaleString("en-IN") }];
      const data = { ...rec, visits }; delete data._id;
      await api.update("projectProjection", id, data);
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

/* ============================================================================
   CUSTOMERS — follow-up entries nunchi automatic ga build ayina list.
   Search + filter; Near-by mode: user ki set chesina range (admin -> Users)
   lopala unna customers matrame.
============================================================================ */
function FieldCustomers({ nearbyOnly = false }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [myLoc, setMyLoc] = useState(null);
  const rangeM = Number(CU().nearby_range_m || CU().nearbyRange || 500);   // per-user (admin set)

  useEffect(() => {
    if (!nearbyOnly) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMyLoc("denied"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [nearbyOnly]);

  useEffect(() => {
    const t = setTimeout(() => {
      api.customers(q.trim()).then((d) => setRows(d.customers || [])).catch(() => setRows([]));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const list = useMemo(() => {
    if (!rows) return null;
    if (!nearbyOnly) return rows;
    if (!myLoc || myLoc === "denied") return rows;
    return rows
      .map((r) => ({ ...r, dist: r.lat && r.lng ? haversineKm(myLoc, { lat: Number(r.lat), lng: Number(r.lng) }) : null }))
      .filter((r) => r.dist != null && r.dist * 1000 <= rangeM)
      .sort((a, b) => a.dist - b.dist);
  }, [rows, myLoc, nearbyOnly, rangeM]);

  return (
    <>
      <ScreenHead title={nearbyOnly ? "Near By Customers" : "Customers"} />
      <div className="f-list-pad" style={{ paddingTop: 12 }}>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={15} color="var(--muted)" style={{ position: "absolute", left: 12, top: 12 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / mobile / place…"
            style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12, border: "1.5px solid #d7dcef", fontSize: 13.5, background: "#fff" }} />
        </div>

        {nearbyOnly && (
          <div style={{ background: "#eef4ff", color: "#33406b", padding: "8px 11px", borderRadius: 10, fontSize: 12, marginBottom: 10, fontWeight: 600 }}>
            Showing customers within <b>{rangeM >= 1000 ? (rangeM / 1000) + " km" : rangeM + " m"}</b> of you
          </div>
        )}
        {nearbyOnly && myLoc === "denied" && (
          <div style={{ background: "#fdf0e6", color: "#a35a1f", padding: 10, borderRadius: 10, fontSize: 12.5, marginBottom: 12 }}>
            Location is off — turn on GPS to see near-by customers.
          </div>
        )}

        {list === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Loading customers…</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>
            <Users size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>{nearbyOnly ? "No customers in your range" : "No customers yet"}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Customer entries you save will appear here automatically.</div>
          </div>
        ) : list.map((r, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
              <span>{r.name}</span>
              {r.dist != null && <span style={{ color: "var(--accent)", fontSize: 12 }}>{fmtKm(r.dist)}</span>}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 3 }}>
              {r.type && <span style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{r.type}</span>}
              <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{r.followups} follow-up{r.followups > 1 ? "s" : ""}</span>
            </div>
            {(r.place || r.address) && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>📍 {r.place || r.address}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {r.mobile && <button onClick={() => (window.location.href = `tel:${r.mobile}`)} style={actBtn("#1f9d55")}>📞 Call</button>}
              {r.mobile && <button onClick={() => window.open(`https://wa.me/91${r.mobile}`, "_blank")} style={actBtn("#25d366")}>💬 WhatsApp</button>}
              <button onClick={() => setViewCust(r)} style={{ ...actBtn("#3949ab"), background: "#eef1ff", color: "#3949ab" }}>👁 View</button>
              <button onClick={() => { FOLLOWUP_PREFILL.data = r; nav("/app/followup/new"); }} style={{ ...actBtn("#0b3c8c"), background: "#e8f0ff", color: "#0b3c8c" }}>➕ Follow Up</button>
            </div>
          </div>
        ))}
      </div>
      {viewCust && (
        <div className="f-sheet-mask" onClick={() => setViewCust(null)}>
          <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>{viewCust.name}</div>
            <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
              {viewCust.mobile && <div><b>Mobile:</b> {viewCust.mobile}</div>}
              {viewCust.type && <div><b>Type:</b> {viewCust.type}</div>}
              {viewCust.place && <div><b>Place:</b> {viewCust.place}</div>}
              {viewCust.address && <div><b>Address:</b> {viewCust.address}</div>}
              <div><b>Follow-ups:</b> {viewCust.followups}</div>
              {viewCust.last_followup && <div><b>Last Entry:</b> {String(viewCust.last_followup).slice(0, 16)}</div>}
              {viewCust.by && <div><b>By:</b> {viewCust.by}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {viewCust.mobile && <button onClick={() => (window.location.href = `tel:${viewCust.mobile}`)} style={{ flex: 1, ...actBtn("#1f9d55") }}>📞 Call</button>}
              <button onClick={() => { FOLLOWUP_PREFILL.data = viewCust; setViewCust(null); nav("/app/followup/new"); }} style={{ flex: 1, ...actBtn("#0b3c8c") }}>➕ Follow Up</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}



const STATUS_OPTS = {
  enquiry: ["Review Pending", "Inprocess", "Completed", "Win", "Close"],
  projectProjection: ["Running", "Hold", "Win", "Loss"],
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
  const [specUsers, setSpecUsers] = useState([]);
  const [tag, setTag] = useState("");

  const load = () => api.get(mod, id).then((d) => setRec({ _id: d.record.id, ...d.record.data })).catch(() => {});
  useEffect(() => { load(); }, [mod, id]);

  /* Project Projection chat: SPEC TEAM matrame tag cheyagalaru */
  useEffect(() => {
    if (mod !== "projectProjection") return;
    api.listUsers().then((d) => {
      const spec = (d.users || []).filter((u) =>
        `${u.role || ""} ${u.designation || ""}`.toLowerCase().includes("spec"));
      setSpecUsers(spec);
    }).catch(() => {});
  }, [mod]);

  const send = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let doc = "";
      if (file) { const u = await api.uploadPhoto(file, mod); doc = u.url; }
      const msgText = (tag ? `@${tag} ` : "") + text.trim();
      const thread = [...(rec.thread || []), { by: CU().name, text: msgText, doc, tag, at: new Date().toLocaleString("en-IN") }];
      const data = { ...rec, thread }; delete data._id;
      await api.update(mod, id, data);
      /* admin panel bell ki: evaru reply chesaro name tho + click cheste aa module open */
      try {
        const cfg = APP_MODS[mod] || {};
        await api.notify({ to: "ADMIN", title: `${CU().name} replied — ${rec.id || mod}`, message: msgText.slice(0, 120), adminLink: "/admin/" + (cfg.path || "sfa/" + mod), createdAt: new Date().toLocaleString("en-IN") });
      } catch {}
      /* tagged spec person ki notification */
      if (tag) {
        try { await api.notify({ to: tag, title: `Tagged in ${rec.name || rec.id || "project"}`, message: msgText.slice(0, 120), link: `/app/thread/${mod}/${id}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
      }
      /* leave chat: applicant <-> HOD person-to-person notification (same row, both sides) */
      if (mod === "leave") {
        const applicant = rec.createdBy;
        const other = CU().name === applicant ? (rec.approvedBy || rec.manager || CU().manager) : applicant;
        if (other && other !== CU().name) {
          try { await api.notify({ to: other, title: `Message on Leave`, message: `${CU().name}: ${msgText.slice(0, 100)}`, link: `/app/thread/leave/${id}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
        }
      }
      setText(""); setFile(null); setTag(""); load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  if (!rec) return <><ScreenHead title="Details" /><div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</div></>;
  const thread = rec.thread || [];

  return (
    <>
      <ScreenHead title={rec.id || "Details"} />
      <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #eceff8" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{rec.name || rec.project || rec.customer || rec.title || rec.category || rec.type || mod} {rec.amount || rec.value ? "· ₹" + Number(rec.amount || rec.value).toLocaleString("en-IN") : ""}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{rec.product || rec.desc || rec.help || rec.details || rec.specHelp || ""}</div>
        {/* Expense full details */}
        {mod === "expense" && (
          <div style={{ marginTop: 8, background: "#f6f8fd", borderRadius: 10, padding: "9px 11px", fontSize: 12, display: "grid", gap: 4 }}>
            {rec.category && <div><b>Category:</b> {rec.category}</div>}
            {rec.type && <div><b>Type:</b> {rec.type}</div>}
            {rec.amount != null && <div><b>Amount:</b> ₹{Number(rec.amount).toLocaleString("en-IN")}</div>}
            {rec.date && <div><b>Date:</b> {rec.date}</div>}
            {rec.desc && rec.desc !== "--" && <div><b>Description:</b> {rec.desc}</div>}
            {rec.createdBy && <div><b>By:</b> {rec.createdBy}</div>}
            {rec.status && <div><b>Status:</b> {rec.status}</div>}
          </div>
        )}
        {/* Leave full details */}
        {mod === "leave" && (
          <div style={{ marginTop: 8, background: "#f6f8fd", borderRadius: 10, padding: "9px 11px", fontSize: 12, display: "grid", gap: 4 }}>
            {rec.type && <div><b>Leave Type:</b> {rec.type}</div>}
            {rec.mode && <div><b>Mode:</b> {rec.mode}</div>}
            {rec.from && <div><b>From:</b> {rec.from}</div>}
            {rec.to && <div><b>To:</b> {rec.to}</div>}
            {rec.reason && <div><b>Reason:</b> {rec.reason}</div>}
            {rec.approvedBy && <div><b>Approved By:</b> {rec.approvedBy}</div>}
            {rec.status && <div><b>Status:</b> {rec.status}</div>}
          </div>
        )}
        {/* full project details (Sales/Spec/Projection): open cheyaganē full info */}
        {["projectProjection", "salesToSpec", "specToSales"].includes(mod) && (
          <div style={{ marginTop: 8, background: "#f6f8fd", borderRadius: 10, padding: "9px 11px", fontSize: 12, display: "grid", gap: 4 }}>
            {rec.firm && <div><b>Firm/Builder:</b> {rec.firm}</div>}
            {rec.city && <div><b>City:</b> {rec.city}</div>}
            {rec.projectType && <div><b>Type:</b> {rec.projectType}</div>}
            {(rec.value || rec.amount) && <div><b>Value:</b> ₹{Number(rec.value || rec.amount).toLocaleString("en-IN")}</div>}
            {rec.salesPerson && <div><b>Sales Person:</b> {rec.salesPerson}</div>}
            {rec.specPerson && <div><b>Spec Person:</b> {rec.specPerson}</div>}
            {rec.source && <div><b>Source:</b> {rec.source}</div>}
            {rec.createdBy && <div><b>Created By:</b> {rec.createdBy}</div>}
            {rec.details && <div><b>Details:</b> {rec.details}</div>}
          </div>
        )}
        {/* first photos attached at creation */}
        {(rec.photo || rec.photos || rec.doc) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {[rec.photo, rec.doc, ...(Array.isArray(rec.photos) ? rec.photos : [])].filter(Boolean).map((u, i) => (
              String(u).match(/\.pdf$/i)
                ? <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>📄 Attachment</a>
                : <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #dfe4f0" }} /></a>
            ))}
          </div>
        )}
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
              const newStatus = e.target.value;
              let remark = "";
              if (mod === "projectProjection") {
                /* monthly update: remark minimum 50 characters — "followup" lanti chinna text accept kaadu */
                remark = (window.prompt(`Monthly update remark (minimum 50 characters) — ${newStatus}:`) || "").trim();
                if (remark.length < 50) { alert(`Remark too short (${remark.length}/50 characters). Please write in detail — what happened and what is the next step.`); return; }
              }
              const data = { ...rec, status: newStatus }; delete data._id;
              if (mod === "projectProjection") {
                const month = new Date().toLocaleString("en-IN", { month: "short", year: "numeric" });
                data.lastUpdate = `${month}: ${newStatus}`;
                data.monthlyUpdates = [...(rec.monthlyUpdates || []), { month, status: newStatus, remark, by: CU().name, at: new Date().toLocaleString("en-IN") }];
                data.thread = [...(rec.thread || []), { by: CU().name, text: `📅 Monthly Update (${month}) — ${newStatus}: ${remark}`, at: new Date().toLocaleString("en-IN") }];
              }
              try { await api.update(mod, id, data); setRec({ ...rec, ...data, _id: rec._id }); } catch (er) { alert(er.message); }
            }} style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #d7dcef", fontSize: 13, marginTop: 4 }}>
              {STATUS_OPTS[mod].map((s) => <option key={s}>{s}</option>)}
            </select>
            {mod === "projectProjection" && (
              <button onClick={async () => {
                const remark = (window.prompt("Monthly follow-up remark (min 50 chars):") || "").trim();
                if (remark.length < 50) { alert(`Too short (${remark.length}/50).`); return; }
                const month = new Date().toLocaleString("en-IN", { month: "short", year: "numeric" });
                const data = { ...rec };
                delete data._id;
                data.lastUpdate = `${month}: follow-up`;
                data.monthlyUpdates = [...(rec.monthlyUpdates || []), { month, remark, by: CU().name, at: new Date().toLocaleString("en-IN") }];
                data.thread = [...(rec.thread || []), { by: CU().name, text: `📅 Follow-up (${month}): ${remark}`, at: new Date().toLocaleString("en-IN") }];
                try { await api.update(mod, id, data); setRec({ ...rec, ...data, _id: rec._id }); } catch (e) { alert(e.message); }
              }} style={{ width: "100%", marginTop: 8, padding: "9px", borderRadius: 9, border: "1px solid var(--accent)", background: "#eef1ff", color: "var(--accent)", fontWeight: 700, fontSize: 12.5 }}>
                📅 Add Monthly Follow-up
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 170 }}>
        {thread.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 20 }}>No messages yet. You can reply below.</div>}
        {thread.map((m, i) => {
          const mine = m.by === CU().name;
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
              <div style={{ background: mine ? "var(--navy)" : "#fff", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "9px 12px", fontSize: 13, boxShadow: "var(--shadow)" }}>
                {m.text}
                {m.doc && (String(m.doc).match(/\.pdf$/i)
                  ? <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}>📄 View PDF</a>
                  : <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 5 }}><img src={m.doc} alt="" style={{ maxWidth: 160, borderRadius: 8, display: "block" }} /></a>)}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.by} · {m.at}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "fixed", bottom: "calc(74px + env(safe-area-inset-bottom))", left: 0, right: 0, maxWidth: 480, margin: "0 auto", padding: "8px 12px 10px", background: "#fff", borderTop: "1px solid var(--line)", zIndex: 45 }}>
        {mod === "projectProjection" && specUsers.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: "8px 10px", borderRadius: 10, border: "1.5px solid #d7dcef", fontSize: 12.5, background: tag ? "#eef1ff" : "#fff", fontWeight: tag ? 700 : 400 }}>
            <option value="">🏷️ Tag spec team person (optional)</option>
            {specUsers.map((u) => <option key={u.id} value={u.name}>{u.name} — {u.designation || u.role}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ display: "grid", placeItems: "center", cursor: "pointer", width: 38 }}>📎<input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} /></label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={file ? file.name : "Type a reply…"} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 20, padding: "10px 14px", fontSize: 13, outline: "none" }} />
        <button className="f-submit" style={{ padding: "8px 16px", borderRadius: 20 }} disabled={busy} onClick={send}>Send</button>
        </div>
      </div>
    </>
  );
}

function SpecThreadRoute() {
  const { specId } = useParams();
  return <FieldSpecThread id={specId} />;
}

/* ============================================================================
   ATTENDANCE START WIZARD
   Local  -> location (strict India dropdown) -> selfie (+auto GPS address) -> start
   Tour   -> ExStation/Outstation -> Public (selfie only) / Personal (odometer
             reading photo + selfie) -> location -> start
   WFH    -> selfie (+address) -> start
============================================================================ */

/* location input — free typing, auto Title Case (jaipor -> Jaipor) */
function LocationPicker({ value, onPick }) {
  const [q, setQ] = useState(value || "");
  const toTitle = (t) => t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return (
    <div style={{ marginBottom: 14 }}>
      <input
        value={q}
        onChange={(e) => {
          const v = toTitle(e.target.value);
          setQ(v);
          onPick(v.trim() ? { name: v.trim() } : null);
        }}
        placeholder="Enter area / village / city name"
        style={{ width: "100%", padding: "12px", borderRadius: 11, border: value ? "2px solid #1f9d55" : "1.5px solid #d7dcef", fontSize: 15 }}
      />
    </div>
  );
}

/* camera capture box: photo + auto GPS address underneath */
function PhotoCapture({ label, photo, onPhoto, address, capture = "user" }) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>{label} <b style={{ color: "#d64545" }}>*</b></label>
      <label style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexDirection: "column",
        border: photo ? "2px solid #1f9d55" : "1.5px dashed #b9c1d9", borderRadius: 13,
        minHeight: photo ? 10 : 92, padding: 10, cursor: "pointer", background: photo ? "#f3fbf6" : "#fafbff",
      }}>
        {busy ? <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Compressing…</span>
        : photo ? (
          <>
            <img src={photo.preview} alt="" style={{ width: "100%", maxHeight: 170, objectFit: "cover", borderRadius: 9 }} />
            <span style={{ fontSize: 11.5, color: "#1f9d55", fontWeight: 700 }}>✓ Photo ready — tap to retake</span>
          </>
        ) : (
          <>
            <Camera size={26} color="var(--accent)" />
            <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Tap to take photo</span>
          </>
        )}
        <input type="file" accept="image/*" capture={capture} style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            setBusy(true);
            const { compressImage } = await import("../lib/api.js");
            const small = await compressImage(f).catch(() => f);
            onPhoto({ file: small, preview: URL.createObjectURL(small) });
            setBusy(false);
            e.target.value = "";
          }} />
      </label>
      {photo && address && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, background: "#eef4ff", borderRadius: 9, padding: "7px 10px" }}>
          <MapPin size={13} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11.5, color: "#33406b", lineHeight: 1.45 }}>{address}</span>
        </div>
      )}
    </div>
  );
}

function AttendanceWizard({ mode = "start", visitInfo = null, onClose, onDone }) {
  /* mode: "start" -> full flow; "stop" -> logout photos (rules per visit type) */
  const [type, setType] = useState(visitInfo?.visit_type || "Local");     // Local / Tour / WFH
  const [subType, setSubType] = useState(
    ["ExStation", "Outstation"].includes(visitInfo?.visit_type) ? visitInfo.visit_type : "ExStation");
  const [transport, setTransport] = useState(visitInfo?.transport || "Public");
  const [loc, setLoc] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [reading, setReading] = useState(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /* current GPS -> readable address (photo kinda automatic ga) */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const a = await placeName(pos.coords.latitude, pos.coords.longitude).catch(() => "");
        setAddress(a || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
      },
      () => setAddress(""),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  const isStop = mode === "stop";
  const effType = isStop ? (["ExStation", "Outstation"].includes(visitInfo?.visit_type) ? "Tour" : visitInfo?.visit_type || "Local") : type;
  const effTransport = isStop ? (visitInfo?.transport || "Public") : transport;

  /* which photos does THIS flow need? (meeru cheppina rules exact ga)
     Local: selfie | WFH: selfie
     Tour+Public: selfie only | Tour+Personal: odometer reading + selfie   */
  const needReading = effType === "Tour" && effTransport === "Personal";
  const needSelfie = true;
  const needLocation = !isStop && effType !== "WFH";

  const ready = (!needLocation || loc) && (!needSelfie || selfie) && (!needReading || reading);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr("");
    try {
      const up = async (p) => (await api.uploadPhoto(p.file, "attendance")).url;
      const selfieUrl = selfie ? await up(selfie) : "";
      const readingUrl = reading ? await up(reading) : "";
      onDone({
        type: isStop ? undefined : (type === "Tour" ? subType : type),
        name: isStop ? undefined : (effType === "WFH" ? "Work From Home" : (loc ? [loc.name, loc.district].filter(Boolean).join(", ") : "")),
        transport: isStop ? undefined : (type === "Tour" ? transport : ""),
        selfie: selfieUrl, reading: readingUrl, address,
      });
    } catch (e) { setErr(e.message || "Upload failed — try again"); setBusy(false); }
  };

  return (
    <div className="f-sheet-mask" style={{ zIndex: 70 }} onClick={busy ? undefined : onClose}>
      <div className="f-sheet" style={{ maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 17, marginBottom: 14 }}>
          {isStop ? "Stop Attendance" : "Start Attendance"}
        </div>

        {!isStop && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {["Local", "Tour", "WFH"].map((t) => (
              <button key={t} onClick={() => setType(t)}
                style={{ flex: 1, padding: "11px 4px", borderRadius: 12, border: type === t ? "2px solid var(--navy)" : "1.5px solid #d7dcef", background: type === t ? "#eef1ff" : "#fff", fontWeight: 800, fontSize: 13, color: type === t ? "var(--navy)" : "var(--muted)" }}>
                {t === "WFH" ? "Work From Home" : t}
              </button>
            ))}
          </div>
        )}

        {!isStop && type === "Tour" && (
          <>
            <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>Tour Type <b style={{ color: "#d64545" }}>*</b></label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["ExStation", "Outstation"].map((t) => (
                <button key={t} onClick={() => setSubType(t)}
                  style={{ flex: 1, padding: "10px", borderRadius: 11, border: subType === t ? "2px solid var(--navy)" : "1.5px solid #d7dcef", background: subType === t ? "#eef1ff" : "#fff", fontWeight: 700, fontSize: 12.5, color: subType === t ? "var(--navy)" : "var(--muted)" }}>
                  {t}
                </button>
              ))}
            </div>
            <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>Transport <b style={{ color: "#d64545" }}>*</b></label>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["Public", "Personal"].map((t) => (
                <button key={t} onClick={() => setTransport(t)}
                  style={{ flex: 1, padding: "10px", borderRadius: 11, border: transport === t ? "2px solid var(--navy)" : "1.5px solid #d7dcef", background: transport === t ? "#eef1ff" : "#fff", fontWeight: 700, fontSize: 12.5, color: transport === t ? "var(--navy)" : "var(--muted)" }}>
                  {t} Transport
                </button>
              ))}
            </div>
          </>
        )}

        {needLocation && (
          <>
            <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
              {type === "Local" ? "Local Area / City" : "Tour Place"} <b style={{ color: "#d64545" }}>*</b>
            </label>
            <LocationPicker value={loc ? loc.name : ""} onPick={setLoc} />
          </>
        )}

        {needReading && (
          <PhotoCapture label={isStop ? "Closing Reading Photo (Bike/Car)" : "Reading Photo (Bike/Car)"}
            photo={reading} onPhoto={setReading} address={address} capture="environment" />
        )}
        {needSelfie && (
          <PhotoCapture label="Your Photo (Selfie)" photo={selfie} onPhoto={setSelfie} address={address} capture="user" />
        )}

        {err && <div style={{ background: "#fdecec", color: "#c03636", borderRadius: 9, padding: "8px 11px", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

        <button className="f-submit" style={{ width: "100%", opacity: ready && !busy ? 1 : 0.5 }} disabled={!ready || busy} onClick={submit}>
          {busy ? "Uploading…" : isStop ? "Stop Attendance" : "Start Attendance"}
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
  const [stopPopup, setStopPopup] = useState(false);
  const visitInfoRef = useRef({ type: "Local", name: "" });
  const todaySessionRef = useRef(null);       // {visit_type, transport} — stop-flow photo rules ki
  const stopExtraRef = useRef(null);          // logout photos/address -> attStop body
  const [attendanceOn, setAttendanceOn] = useState(false);

  /* App open aithe: server lo session inka RUNNING unte -> automatic ga ON state loki,
     GPS tracking malli start (SAME session, existing km untundi). User ki malli
     "Slide to Start" kaadu — already logged-in/ON ga kanipistundi. Only Logout untundi. */
  useEffect(() => {
    if (!authed) return;
    api.attToday().then((d) => {
      if (d.session && d.session.status === "RUNNING") {
        sessionRef.current = Number(d.session.id);
        todaySessionRef.current = d.session;
        if (d.session.start_time) {
          const st = new Date(d.session.start_time.replace(" ", "T")).getTime();
          setTracking((t) => ({ ...t, startedAt: t.startedAt || st, stoppedAt: null }));
        }
        if (!attendanceOn) { resumeRef.current = true; setAttendanceOn(true); }   // -> ON state, resume tracking
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
  const resumeRef = useRef(false);    // true when re-opening a RUNNING session

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
      const resuming = resumeRef.current;         // app re-open on a RUNNING session
      if (!resuming) {
        setTracking((t) => ({ ...t, points: [], km: 0, startedAt: Date.now(), stoppedAt: null, error: "" }));
        pendingRef.current = [];
        lastSavedPt.current = null;
      }
      syncGpsCfg();
      if (resuming && sessionRef.current) {
        /* resume: server nunchi ee session points load chesi timeline continue */
        api.attPointsList && api.attPointsList(sessionRef.current)
          .then((d) => { if (!cancelled && d && d.points) setTracking((t) => ({ ...t, points: d.points, km: d.km || t.km })); })
          .catch(() => {});
        resumeRef.current = false;
      } else {
        // fresh start -> create server session
        api.attStart(visitInfoRef.current)
          .then((d) => { if (!cancelled) { sessionRef.current = d.session_id; localStorage.setItem("eb_att_on", "1"); } })
          .catch((e) => setTracking((t) => ({ ...t, error: e.message })));
      }

      stopRef.current = watchLocation(
        (p) => {
          lastPointAt.current = Date.now();
          trackingErrorRef.current = "";
          setGpsAlarm(false);

          const cfg = loadGpsCfg();
          if (!withinOfficeHours(cfg)) return;                 // outside office hours -> nothing stored/sent

          const last = lastSavedPt.current;
          if (last) {                                            // first point always kept immediately
            const sinceMs = Date.now() - (last.t || 0);
            const intervalMs = (cfg.intervalSec ?? 30) * 1000;
            const minKm = cfg.minDistanceKm ?? 0;
            if (sinceMs < intervalMs && (minKm <= 0 || haversineKm(last, p) < minKm)) return;
          }
          p.t = Date.now();
          p.time = p.time || Date.now();
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
          try { await api.attStop(sid, stopExtraRef.current || {}); stopExtraRef.current = null; } catch {}
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
            <Route index element={<FieldHome attendanceOn={attendanceOn} setAttendanceOn={setAttendanceOn} tracking={tracking} expenses={expenses} followups={followups} leaves={leaves} onStartAttendance={() => setVisitPopup(true)} onStopAttendance={() => setStopPopup(true)} />} />
            <Route path="attendance" element={<FieldAttendance attendanceOn={attendanceOn} setAttendanceOn={setAttendanceOn} tracking={tracking} setTracking={setTracking} gpsAlarm={gpsAlarm} />} />
            <Route path="expense" element={<FieldExpense list={expenses} add={(e) => setExpenses((x) => [e, ...x])} />} />
            <Route path="expense/new" element={<FieldExpenseNew add={async (e) => { try { const r = await api.create("expense", e); setExpenses((x) => [{ _id: r.id, ...e }, ...x]); } catch (err) { alert(err.message); } }} />} />
            <Route path="leave" element={<FieldLeave leaves={leaves} add={(l) => setLeaves((x) => [l, ...x])} />} />
            <Route path="leave/new" element={<FieldLeaveNew add={async (l) => { try { const r = await api.create("leave", l); setLeaves((x) => [{ _id: r.id, ...l }, ...x]); const mgr = CU().manager; if (mgr) { try { await api.notify({ to: mgr, title: "Leave request", message: `${CU().name} applied for ${l.type} (${l.from} to ${l.to})`, link: "/app/leave-approval", createdAt: new Date().toLocaleString("en-IN") }); } catch {} } } catch (err) { alert(err.message); } }} />} />
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
            <Route path="project/new" element={<FieldModuleNew mod="projectProjection" />} />
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
            <Route path="team" element={<FieldTeamPerformance />} />
            <Route path="leave-approval" element={<FieldLeaveApproval />} />
            <Route path="notifications" element={<FieldNotifications />} />
            <Route path="spec/:specId" element={<SpecThreadRoute />} />
            <Route path="nearby" element={<FieldCustomers nearbyOnly />} />
            <Route path="customers" element={<FieldCustomers />} />
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
          <AttendanceWizard
            mode="start"
            onClose={() => setVisitPopup(false)}
            onDone={(info) => {
              visitInfoRef.current = info;
              todaySessionRef.current = { visit_type: info.type, transport: info.transport };
              setVisitPopup(false); setAttendanceOn(true); nav("/app/attendance");
            }}
          />
        )}
        {stopPopup && (
          <AttendanceWizard
            mode="stop"
            visitInfo={todaySessionRef.current}
            onClose={() => setStopPopup(false)}
            onDone={(info) => {
              stopExtraRef.current = { selfie: info.selfie, reading: info.reading, address: info.address };
              setStopPopup(false); setAttendanceOn(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
