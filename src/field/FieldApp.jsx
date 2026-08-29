import logoImg from "../assets/logo.jpg";
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link, NavLink, useNavigate, Navigate, useParams } from "react-router-dom";
import {
  Home, CalendarCheck, Target, User, Users, Plus, Menu, Bell, ChevronRight, ChevronLeft,
  MapPin, Clock, Wallet, ClipboardList, LogOut, Phone, Mail, Building2, X,
  PlaneTakeoff, FileText, CalendarDays, Briefcase, ListChecks, Map as MapIcon,
  Play, Square, Navigation, Smartphone, CheckCircle2, AlertCircle, Eye, EyeOff, Camera, Search, Filter, Pencil,
} from "lucide-react";
import { watchLocation, startTracker, stopTracker, setTrackerHandler, setTrackerSession, isTrackerActive, showTrackingNotification, hideTrackingNotification, totalDistanceKm, haversineKm, fmtKm, fmtDuration } from "../lib/geo.js";
import { api, auth } from "../lib/api.js";
import { buildExpensePdf } from "../lib/expensePdf.js";
import { MODULES } from "../admin/moduleConfigs.jsx";

/* logged-in field user (from auth) with safe fallbacks */
const CU = () => auth.user || {};
const rawTimeApp = (dt) => {
  if (!dt) return null;
  const m = String(dt).match(/(\d{2}):(\d{2})/);
  if (!m) return null;
  let h = +m[1]; const min = m[2]; const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
};

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
const QUOTE_EDIT = { data: null };
const FOLLOWUP_PREFILL = { data: null };
const FOLLOWUP_QUICK = { data: null };
/* in-app photo/PDF zoom viewer (CRM lo open, verey link kaadu) */
const openAppPhoto = (url) => { if (url) window.dispatchEvent(new CustomEvent("app-photo", { detail: url })); };
const CUST_EDIT = { data: null };
const EXP_EDIT = { data: null };
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
  intervalSec: 900,          // record one point every 15 minutes (900s) — clean timeline, low battery
  minDistanceKm: 0,
  idleMaxMs: 10 * 1000,
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
      const LN = Cap.Plugins.LocalNotifications;
      /* ensure an Android notification channel exists (needed on Android 8+) */
      if (LN.createChannel) {
        LN.createChannel({
          id: "eurobond_crm",
          name: "Eurobond CRM",
          description: "CRM alerts",
          importance: 5,           // HIGH — heads-up banner
          visibility: 1,
          sound: "default",
          vibration: true,
          lights: true,
        }).catch(() => {});
      }
      LN.schedule({
        notifications: [{
          id: Date.now() % 2000000000,
          title, body,
          channelId: "eurobond_crm",
          smallIcon: "ic_stat_notify",
          sound: "default",
          extra,                                   // { notifId, link } -> used on tap
        }],
      }).catch(() => {});
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
    try {
      const r = Cap.Plugins.LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
        const ex = (ev && ev.notification && ev.notification.extra) || {};
        if (ex.notifId) markRead(ex.notifId);
        /* this is the field APP — never open admin routes here. Admin links go to the
           app's own notifications screen instead. */
        let link = ex.link || "/app/notifications";
        if (link.startsWith("/admin")) link = "/app/notifications";
        if (!link.startsWith("/app")) link = "/app/notifications";
        nav(link);
      });
      if (r && typeof r.then === "function") r.then((x) => { h = x; }).catch(() => {});
      else h = r;
    } catch {}
    return () => { try { h && h.remove && h.remove(); } catch {} };
  }, []);
}

/* ---- reverse geocoding (location names) with cache ---- */
const geoCache = {};
async function placeName(lat, lng) {
  const key = lat.toFixed(4) + "," + lng.toFixed(4);
  if (geoCache[key]) return geoCache[key];
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { "Accept-Language": "en" } });
    const j = await r.json();
    const a = j.address || {};
    /* named landmark (hospital, mall, building, shop, office...) if present */
    const place = a.amenity || a.building || a.shop || a.office || a.hospital || a.school || a.college || a.hotel || a.mall || j.name || "";
    const house = a.house_number || "";
    const road = a.road || a.pedestrian || a.footway || "";
    /* include as many locality levels as available for a long Google-style address */
    const locality = [a.neighbourhood, a.suburb, a.quarter, a.residential, a.city_district].filter((x, i, arr) => x && arr.indexOf(x) === i);
    const city = a.city || a.town || a.village || a.county || "";
    const state = a.state || "";
    const pin = a.postcode || "";
    const parts = [place, [house, road].filter(Boolean).join(" "), ...locality, city, state].filter(Boolean);
    let name = (parts.join(", ") + (pin ? " " + pin : "")).trim();
    /* if our composed address is short, fall back to the full display_name (minus country) */
    if (name.split(",").length < 4 && j.display_name) {
      name = j.display_name.replace(/, India$/, "").replace(/, \d{6}, India$/, m => m.replace(", India", ""));
    }
    if (!name) name = j.display_name || "Unknown location";
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
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);        // 1 = enter mobile, 2 = enter otp
  const [maskedEmail, setMaskedEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendOtp = async () => {
    if (!mobile) { setErr("Enter your mobile / code"); return; }
    setBusy(true); setErr("");
    try {
      const r = await api.sendOtp(mobile.trim());
      if (r.sent) {
        setMaskedEmail(r.email || "");
        setStep(2);
        setResendIn(90);
      } else {
        setErr(r.error ? "Could not send OTP: " + r.error : "Could not send OTP. Contact admin.");
      }
    } catch (e) { setErr(e.message || "Failed to send OTP"); }
    setBusy(false);
  };

  const verify = async () => {
    if (!otp || otp.length < 4) { setErr("Enter the 6-digit OTP"); return; }
    setBusy(true); setErr("");
    try {
      const user = await api.verifyOtp(mobile.trim(), otp.trim());
      try {
        const Cap = window.Capacitor;
        if (Cap && Cap.Plugins && Cap.Plugins.LocalNotifications) await Cap.Plugins.LocalNotifications.requestPermissions();
        else if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      } catch {}
      onLogin(user);
    } catch (e) { setErr(e.message || "Invalid OTP"); setBusy(false); }
  };

  return (
    <div className="phone-body" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          <img src={logoImg} alt="Eurobond" style={{ height: 42 }} />
        </div>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginBottom: 26 }}>
          {step === 1 ? "Login with your mobile number — OTP will be sent to your registered email" : `Enter the OTP sent to ${maskedEmail || "your email"}`}
        </p>
        <div className="f-form" style={{ padding: 0 }}>
          {step === 1 ? (
            <>
              <label>Mobile Number / Employee Code <b>*</b></label>
              <input
                placeholder="Mobile or code"
                value={mobile}
                onChange={(e) => { setMobile(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                style={{ width: "100%", marginBottom: 14, fontSize: 16, letterSpacing: 1 }}
              />
              {err && <div style={{ color: "#d64545", fontSize: 12.5, fontWeight: 700, margin: "6px 0" }}>{err}</div>}
              <button className="f-submit" style={{ width: "100%", marginTop: 12, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={sendOtp}>
                {busy ? "Sending OTP…" : "Send OTP"}
              </button>
            </>
          ) : (
            <>
              <label>Enter OTP <b>*</b></label>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit OTP"
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && verify()}
                style={{ width: "100%", marginBottom: 12, fontSize: 22, letterSpacing: 8, textAlign: "center", fontWeight: 800 }}
              />
              {err && <div style={{ color: "#d64545", fontSize: 12.5, fontWeight: 700, margin: "6px 0" }}>{err}</div>}
              <button className="f-submit" style={{ width: "100%", marginTop: 6, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={verify}>
                {busy ? "Verifying…" : "Verify & Login"}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 12 }}>
                <button onClick={() => { setStep(1); setOtp(""); setErr(""); }} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>← Change number</button>
                <button disabled={resendIn > 0 || busy} onClick={sendOtp} style={{ background: "none", border: "none", color: resendIn > 0 ? "var(--muted)" : "var(--accent)", fontWeight: 700, cursor: resendIn > 0 ? "default" : "pointer" }}>
                  {resendIn > 0 ? `Resend in ${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, "0")}` : "Resend OTP"}
                </button>
              </div>
            </>
          )}
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
const ATT_START_HOUR = 6;   // morning 6 AM
const ATT_END_HOUR = 21;    // night 9 PM
const withinAttWindow = () => { const h = new Date().getHours(); return h >= ATT_START_HOUR && h < ATT_END_HOUR; };
function FieldHome({ attendanceOn, doneToday, setAttendanceOn, tracking, expenses, followups, leaves, onStartAttendance, onStopAttendance }) {
  const [seg, setSeg] = useState("Matrics");
  const [sheet, setSheet] = useState(false);
  const [, tickHome] = useState(0);
  const nav = useNavigate();

  /* holiday reminders — run once per day (region-wise: 2 days before, 1 day before, same day) */
  useEffect(() => {
    const key = "holRemind_" + new Date().toISOString().slice(0, 10);
    if (!localStorage.getItem(key)) {
      api.holidayRemind().then(() => localStorage.setItem(key, "1")).catch(() => {});
    }
  }, []);

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
        {doneToday ? (
          <div style={{ background: "#e8f7ee", border: "1.5px solid #7ed9a0", borderRadius: 16, padding: "16px", textAlign: "center", fontWeight: 800, color: "#1f7a44", fontSize: 14 }}>
            ✓ Attendance completed for today
          </div>
        ) : !withinAttWindow() && !attendanceOn ? (
          <div style={{ background: "#f1f3f8", border: "1.5px solid #d7dcef", borderRadius: 16, padding: "16px", textAlign: "center", fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>
            Attendance available 6:00 AM – 9:00 PM
          </div>
        ) : (
          <SlideToStart on={attendanceOn} onToggle={() => { if (!attendanceOn) { onStartAttendance(); } else { onStopAttendance(); } }} />
        )}
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
                { t: "Add New Customer", ic: <ClipboardList size={18} />, to: "/app/followup/new" },
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
function FieldAttendance({ attendanceOn, setAttendanceOn, tracking, setTracking, gpsAlarm, todaySession, sessionId }) {
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
  const [custPins, setCustPins] = useState([]);
  /* load customers added by me today (with coordinates) → purple pins on the map */
  useEffect(() => {
    if (tab !== "Map") return;
    const today = new Date().toISOString().slice(0, 10);
    api.customers("", true).then((d) => {
      const pins = (d.customers || []).filter((c) => {
        const dt = String(c.created_at || c.createdAt || c.date || "").slice(0, 10);
        return c.lat && c.lng && dt === today;
      }).map((c) => ({ lat: +c.lat, lng: +c.lng, name: c.name, time: (c.created_at || "").slice(11, 16) }));
      setCustPins(pins);
    }).catch(() => setCustPins([]));
  }, [tab]);
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
    mapObj.current = L.map(mapRef.current, { attributionControl: true }).setView([start.lat, start.lng], 15);
    mapObj.current.attributionControl.setPrefix("Gonti");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© Gonti",
      maxZoom: 19,
    }).addTo(mapObj.current);

    /* live blue dot = device current location (Google Maps style) */
    let blueDot = null, accCircle = null, geoWatch = null;
    const blueIcon = L.divIcon({ className: "", html: '<div class="gmaps-bluedot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
    if (navigator.geolocation) {
      geoWatch = navigator.geolocation.watchPosition(
        (pos) => {
          const ll = [pos.coords.latitude, pos.coords.longitude];
          if (!blueDot) {
            blueDot = L.marker(ll, { icon: blueIcon, zIndexOffset: 1000 }).addTo(mapObj.current);
            accCircle = L.circle(ll, { radius: pos.coords.accuracy || 30, color: "#4285F4", weight: 1, fillColor: "#4285F4", fillOpacity: 0.12 }).addTo(mapObj.current);
            if (tracking.points.length === 0) mapObj.current.setView(ll, 16);
          } else {
            blueDot.setLatLng(ll);
            accCircle.setLatLng(ll).setRadius(pos.coords.accuracy || 30);
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }
    const svgPin = (color) => `<div class="pin"><svg width="30" height="38" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></div>`;
    const pts = tracking.points.filter((p) => p.accuracy == null || p.accuracy <= 60);
    /* draw a straight polyline first (instant), then snap it to roads via OSRM in the background */
    if (pts.length > 1) {
      lineRef.current = L.polyline(pts.map((p) => [p.lat, p.lng]), { color: "#8854d0", weight: 5, opacity: 0.9 }).addTo(mapObj.current);
      (async () => {
        try {
          const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
          const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
          const j = await r.json();
          const line = j.routes && j.routes[0] && j.routes[0].geometry && j.routes[0].geometry.coordinates;
          if (line && line.length && mapObj.current && lineRef.current) {
            lineRef.current.setLatLngs(line.map(([lng, lat]) => [lat, lng]));
          }
        } catch {}
      })();
    }
    /* every 15-min tracking point → purple "In Between" pin (BreezERP style) */
    pts.forEach((p, i) => {
      if (i === 0 || i === pts.length - 1) return;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: svgPin("#7b2d8b"), iconSize: [30, 38], iconAnchor: [15, 38] }) })
        .bindPopup(`Travel Point · ${new Date(p.t || p.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`)
        .addTo(mapObj.current);
    });
    /* purple (vankaya) pins ONLY where a customer was added during this session */
    (custPins || []).forEach((c) => {
      L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: svgPin("#7b2d8b"), iconSize: [32, 40], iconAnchor: [16, 40] }) })
        .bindPopup(`<b>${c.name || "Customer"}</b>${c.time ? "<br>" + c.time : ""}`)
        .addTo(mapObj.current);
    });
    /* green START pin */
    if (pts.length) {
      L.marker([pts[0].lat, pts[0].lng], { icon: L.divIcon({ className: "", html: svgPin("#20bf6b"), iconSize: [34, 42], iconAnchor: [17, 42] }) })
        .bindPopup(`Start<br>${new Date(pts[0].t || pts[0].time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`)
        .addTo(mapObj.current);
    }
    if (pts.length) {
      const last = pts[pts.length - 1];
      if (attendanceOn) {
        const liveIcon = L.divIcon({ className: "", html: '<div class="gmaps-bluedot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
        markerRef.current = L.marker([last.lat, last.lng], { icon: liveIcon, zIndexOffset: 999 }).bindPopup("Live location").addTo(mapObj.current);
      } else {
        /* red END pin */
        markerRef.current = L.marker([last.lat, last.lng], { icon: L.divIcon({ className: "", html: svgPin("#eb3b5a"), iconSize: [34, 42], iconAnchor: [17, 42] }) })
          .bindPopup(`End<br>${new Date(last.t || last.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`)
          .addTo(mapObj.current);
      }
      if (pts.length > 1) mapObj.current.fitBounds(pts.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 17 });
      else mapObj.current.setView([last.lat, last.lng], 16);
    }
    setTimeout(() => mapObj.current?.invalidateSize(), 80);
    return () => {
      if (geoWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(geoWatch);
      mapObj.current?.remove();
      mapObj.current = null; lineRef.current = null; markerRef.current = null;
    };
  }, [tab, custPins]);

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
        if (p.address || names[key]) continue;   // already have it (stored or cached) → no re-fetch
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
  const [serverPts, setServerPts] = useState(null);
  /* Timeline/Map: load the SAME points admin sees (server) so app == admin.
     Poll only while tracking; after stop, load once and keep (no re-flicker). */
  useEffect(() => {
    if ((tab !== "Timeline" && tab !== "Map") || !sessionId) return;
    const load = () => api.attPointsList(sessionId).then((d) => { if (d && d.points) setServerPts(d.points); }).catch(() => {});
    load();
    if (!attendanceOn) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [tab, sessionId, attendanceOn]);

  const timelinePoints = useMemo(() => {
    /* prefer server points (identical to admin); fall back to local while tracking */
    /* always use server points (the true 15-min timeline, same as admin) */
    const src = (serverPts || []).length ? serverPts : (serverPts === null ? tracking.points : []);
    const pts = src.map((p) => ({ ...p, time: p.time || p.t || (p.recorded_at ? Date.parse(p.recorded_at.replace(" ", "T")) : Date.now()) }));
    const out = [];
    let cum = 0, last = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (last) { const d = haversineKm(last, p); if (d * 1000 >= 60 && d < 5) cum += d; }
      out.push({ ...p, cumKm: cum, isStart: i === 0, isEnd: i === pts.length - 1 });
      last = p;
    }
    return out.reverse(); // newest first
  }, [serverPts, tracking.points]);

  const duration = durationMs;

  const [weekOffset, setWeekOffset] = useState(0);   // 0 = current week, +1 = older week
  const week = useMemo(() => {
    const days = [];
    const now = new Date();
    const base = weekOffset * 7;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i - base);
      days.push({ d: d.getDate(), w: d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2), today: (i + base) === 0, iso: d.toLocaleDateString("en-CA") });
    }
    return days;
  }, [weekOffset]);
  const [histDate, setHistDate] = useState(null);   // clicked past date
  const [histSess, setHistSess] = useState(null);
  const [histLoading, setHistLoading] = useState(false);

  const openHistory = (iso, today) => {
    if (today) { setHistDate(null); setHistSess(null); return; }   // today -> live view
    setHistDate(iso); setHistLoading(true); setHistSess(null);
    api.attList(iso, iso).then((d) => {
      const mine = (d.sessions || []).find((s) => s.name === CU().name || s.user_id === CU().id);
      setHistSess(mine || false);
    }).catch(() => setHistSess(false)).finally(() => setHistLoading(false));
  };

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

      <div style={{ display: "flex", gap: 6, padding: "12px 18px 0", alignItems: "center" }}>
        <button onClick={() => setWeekOffset((w) => w + 1)} title="Previous week"
          style={{ flexShrink: 0, width: 30, height: 44, borderRadius: 10, border: "none", background: "#eef1ff", color: "var(--navy)", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>‹</button>
        {week.map((x, i) => (
          <div key={i} onClick={() => openHistory(x.iso, x.today)} style={{
            flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 12, cursor: "pointer",
            background: (histDate === x.iso) ? "var(--navy)" : x.today ? "var(--accent)" : "#fff",
            color: (histDate === x.iso || x.today) ? "#fff" : "var(--ink)",
            boxShadow: "var(--shadow)", fontWeight: 700, fontSize: 12.5,
          }}>
            <div style={{ opacity: 0.75, fontSize: 10.5 }}>{x.w}</div>
            {x.d}
          </div>
        ))}
        <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0} title="Next week"
          style={{ flexShrink: 0, width: 30, height: 44, borderRadius: 10, border: "none", background: weekOffset === 0 ? "#f1f3f8" : "#eef1ff", color: weekOffset === 0 ? "#c5cbd8" : "var(--navy)", fontWeight: 800, fontSize: 16, cursor: weekOffset === 0 ? "default" : "pointer" }}>›</button>
      </div>

      {histDate && (
        <div style={{ padding: "12px 18px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>{new Date(histDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</b>
              <span onClick={() => { setHistDate(null); setHistSess(null); }} style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 700, fontSize: 12.5 }}>← Today</span>
            </div>
            {histLoading ? <div style={{ color: "var(--muted)", fontSize: 13, padding: 10 }}>Loading…</div>
              : histSess === false ? <div style={{ color: "var(--muted)", fontSize: 13, padding: 10, textAlign: "center" }}>No attendance record for this day.</div>
                : histSess ? (
                  <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
                    {[
                      ["Type", `${histSess.visit_type || "Local"}${histSess.transport ? " · " + histSess.transport : ""}`],
                      ["Area", histSess.visit_name || "—"],
                      ["Login", rawTimeApp(histSess.start_time)],
                      ["Logout", rawTimeApp(histSess.end_time) || "—"],
                      ["Distance", fmtKm(Number(histSess.distance_km) || 0)],
                      ["Status", histSess.marked_absent ? "Marked Absent" : histSess.status === "DONE" ? "Completed" : "In Progress"],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--muted)", fontWeight: 700 }}>{k}</span>
                        <span style={{ fontWeight: 700, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                      </div>
                    ))}
                    {histSess.start_selfie && <img src={histSess.start_selfie} alt="Login" style={{ width: "100%", borderRadius: 10, marginTop: 6 }} />}
                  </div>
                ) : null}
          </div>
        </div>
      )}

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

      <div className="f-seg" style={{ margin: "0 18px 12px" }}>
        {["Details", "Plan", "Timeline", "Map"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Details" && (
        <div className="f-list-pad">
          {[
            ["Status", attendanceOn ? "Present · Tracking live" : (tracking.points.length || todaySession?.end_time) ? "Stopped" : "Not started"],
            ["Start time", tracking.startedAt ? new Date(tracking.startedAt).toLocaleTimeString("en-IN") : (todaySession?.start_time ? rawTimeApp(todaySession.start_time) : "--")],
            ["Stop time", tracking.stoppedAt ? new Date(tracking.stoppedAt).toLocaleTimeString("en-IN") : (todaySession?.end_time ? rawTimeApp(todaySession.end_time) : attendanceOn ? "Running…" : "--")],
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

      {tab === "Plan" && (
        <div className="f-list-pad">
          {attendanceOn
            ? <PlanEditor session={todaySession} sessionId={sessionId} />
            : <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 30 }}>Start attendance to set your plan / areas.</div>}
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
                  <b style={{ fontSize: 13 }}>{p.address || names[key] || "Finding location…"}</b>
                  {p.isStart && <span style={{ background: "#e8f7ee", color: "#1f7a44", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 6, marginLeft: 6 }}>START</span>}
                  {p.isEnd && !p.isStart && <span style={{ background: attendanceOn ? "#e8f0ff" : "#fdecec", color: attendanceOn ? "#2f6fed" : "#c03636", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 6, marginLeft: 6 }}>{attendanceOn ? "LIVE" : "END"}</span>}
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
function FieldExpense({ list, add, reload }) {
  const [tab, setTab] = useState("Draft");
  const tabs = ["Draft", "Format", "Submitted", "Rejected"];
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const mine = list.filter((e) => (e.createdById === CU().id) || (e.createdBy === CU().name));
  const drafts = mine.filter((e) => e.status === "Draft");
  const rows = mine.filter((e) => {
    if (tab === "Draft") return e.status === "Draft";
    if (tab === "Format") return e.status === "Format";
    if (tab === "Submitted") return e.status === "Submitted" || e.status === "Approved";
    if (tab === "Rejected") return e.status === "Rejected" || e.status === "Reject";
    return false;
  });

  const delDraft = async (e) => {
    if (!window.confirm("Delete this draft?")) return;
    try { await api.remove("expense", e._id); reload && reload(); } catch (er) { alert(er.message); }
  };

  /* Prepare Format: combine all drafts into ONE format document; drafts move into it */
  const prepareFormat = async () => {
    if (drafts.length === 0) { alert("No drafts to prepare."); return; }
    if (!window.confirm(`Prepare a format document from ${drafts.length} draft(s)? They will be combined into one statement.`)) return;
    setBusy(true);
    try {
      const items = drafts.map((d) => ({ date: d.date, km: d.km || "", station: d.station || "", category: d.category, type: d.type, amount: Number(d.amount) || 0, desc: d.desc || "", photo: d.photo || "" }));
      const total = items.reduce((s, x) => s + x.amount, 0);
      const u = CU();
      const fmt = {
        createdAt: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
        user: u.name, createdBy: u.name, createdById: u.id,
        empCode: u.code || "", designation: u.designation || "", grade: u.grade || "", location: u.city || u.state || "",
        status: "Format", isFormat: true, items, amount: total,
        periodFrom: items.reduce((a, b) => (a && a < b.date ? a : b.date), items[0]?.date), periodTo: items.reduce((a, b) => (a && a > b.date ? a : b.date), items[0]?.date),
      };
      await api.create("expense", fmt);
      /* remove the individual drafts (now part of the format) */
      for (const d of drafts) { try { await api.remove("expense", d._id); } catch {} }
      reload && reload();
      setTab("Format");
      alert("Format prepared. Open it to review, download or submit.");
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <>
      <ScreenHead title="Expenses" right={<button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => { EXP_EDIT.data = null; nav("/app/expense/new"); }}>+ Add</button>} />

      <div className="f-seg" style={{ margin: "12px 18px" }}>
        {tabs.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Draft" && drafts.length > 0 && (
        <div style={{ margin: "0 18px 12px" }}>
          <button className="f-submit" style={{ width: "100%", background: "#0f7a44" }} disabled={busy} onClick={prepareFormat}>
            {busy ? "Preparing…" : `📄 Prepare Format (${drafts.length} draft${drafts.length > 1 ? "s" : ""})`}
          </button>
        </div>
      )}

      <div className="f-list-pad">
        {rows.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 26 }}>No {tab.toLowerCase()} expenses</div>}
        {rows.map((e, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
            {e.isFormat ? (
              /* format document card */
              <div onClick={() => nav(`/app/expense/format/${e._id}`)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14 }}>
                  <span>Expense Statement</span>
                  <span>₹{(e.amount || 0).toLocaleString("en-IN")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  <span>{(e.items || []).length} entries · {e.periodFrom} → {e.periodTo}</span>
                  <span style={{ fontWeight: 700, color: e.status === "Approved" ? "#0f7a44" : e.status === "Rejected" ? "#c03636" : e.status === "Submitted" ? "#2563eb" : "#c07f00" }}>{e.status}</span>
                </div>
                {e.rejectRemark && <div style={{ background: "#fdecec", color: "#c03636", fontSize: 11.5, padding: "6px 8px", borderRadius: 8, marginTop: 6 }}>Rejected: {e.rejectRemark}</div>}
                <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, fontWeight: 700 }}>Tap to open statement →</div>
              </div>
            ) : (
              /* single draft entry */
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
                  <span>{e.category}</span>
                  <span>₹{(e.amount || 0).toLocaleString("en-IN")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  <span>{e.date}{e.km ? ` · ${e.km} km` : ""}{e.desc ? ` · ${e.desc}` : ""}</span>
                </div>
                {e.photo && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4, fontWeight: 700, cursor: "pointer" }} onClick={() => openAppPhoto(e.photo)}>📎 View bill</div>}
                {tab === "Draft" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => { EXP_EDIT.data = e; nav("/app/expense/new"); }} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", background: "#eef1ff", color: "#3949ab", fontWeight: 700, fontSize: 11.5 }}>✎ Edit</button>
                    <button onClick={() => delDraft(e)} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", background: "#fdecec", color: "#c03636", fontWeight: 700, fontSize: 11.5 }}>🗑 Delete</button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* Expense categories (fixed list) */
const EXP_CATEGORIES = ["Flight", "Train", "Bus", "Local Transportation / Taxi", "Car Rental", "Fuel / Petrol / Diesel", "Hotel", "Relative Stay", "Food & Meals", "Parking", "Toll Charges", "Car Maintenance", "Stationery", "Xerox / Photocopy", "Phone Recharge", "Miscellaneous"];
/* map a category to the statement column (expense type) */
const CAT_TYPE = {
  "Flight": "Tickets", "Train": "Tickets", "Bus": "Tickets",
  "Local Transportation / Taxi": "Local Conveyance", "Car Rental": "Local Conveyance", "Parking": "Local Conveyance", "Toll Charges": "Local Conveyance",
  "Fuel / Petrol / Diesel": "Local Conveyance", "Car Maintenance": "Local Conveyance",
  "Hotel": "Hotel", "Relative Stay": "Hotel",
  "Food & Meals": "Fooding",
  "Stationery": "Phone/Xerox/Stationary", "Xerox / Photocopy": "Phone/Xerox/Stationary", "Phone Recharge": "Phone/Xerox/Stationary",
  "Miscellaneous": "Miscellaneous",
};
/* which Excel statement column a category falls under */
const CAT_COL = {
  "Flight": "tickets", "Train": "tickets", "Bus": "tickets",
  "Hotel": "hotel", "Relative Stay": "hotel",
  "Food & Meals": "fooding",
  "Local Transportation / Taxi": "local", "Car Rental": "local", "Fuel / Petrol / Diesel": "local", "Car Maintenance": "local", "Parking": "local", "Toll Charges": "local",
  "Stationery": "phone", "Xerox / Photocopy": "phone", "Phone Recharge": "phone",
  "Miscellaneous": "miscl",
};

function FieldExpenseNew({ add }) {
  const nav = useNavigate();
  const ed = EXP_EDIT.data;
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(ed || { date: today, km: "", station: "Outstation", category: "Food & Meals", amount: "", desc: "" });
  const [doc, setDoc] = useState(ed?.photo || "");
  const [busy, setBusy] = useState(false);
  const expType = CAT_TYPE[f.category] || "Miscellaneous";

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const u = await api.uploadPhoto(file, "expense"); setDoc(u.url); }
    catch (e) { alert("Upload failed: " + e.message); }
    setBusy(false);
  };

  const saveDraft = async () => {
    const rec = {
      ...(ed && ed._id ? { _id: ed._id } : {}),
      createdAt: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      user: CU().name, createdBy: CU().name, createdById: CU().id,
      date: f.date, km: f.km || "", station: f.station || "Outstation", category: f.category, type: expType,
      amount: Number(f.amount), status: "Draft", desc: f.desc || "",
      ...(doc ? { photo: doc } : {}),
    };
    if (ed && ed._id) { try { await api.update("expense", ed._id, rec); } catch (e) { alert(e.message); return; } }
    else { add(rec); }
    EXP_EDIT.data = null;
    nav("/app/expense");
  };

  return (
    <>
      <ScreenHead title={ed ? "Edit Draft" : "Add Expense"} />
      <div className="f-form">
        <label>Date <b>*</b></label>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />

        <label>K.M. (if travel)</label>
        <input inputMode="decimal" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Kilometers" style={{ width: "100%", marginBottom: 12 }} />

        <label>Expense Type <b>*</b></label>
        <select value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} style={{ width: "100%", marginBottom: 12 }}>
          <option>Outstation</option><option>Exstation</option>
        </select>

        <label>Category <b>*</b></label>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: "100%", marginBottom: 6 }}>
          {EXP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 700, marginBottom: 12 }}>Expense Type: {expType} <span style={{ color: "var(--muted)", fontWeight: 500 }}>(auto)</span></div>

        <label>Amount (₹) <b>*</b></label>
        <input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} style={{ width: "100%", marginBottom: 12 }} />

        <label>Description</label>
        <textarea rows={3} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />

        <label>Bill / Document</label>
        <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => upload(e.target.files[0])} style={{ marginBottom: 8 }} />
        {busy && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Uploading…</div>}
        {doc && <div style={{ fontSize: 12, color: "#1f9d55", marginBottom: 8 }}>✓ Bill attached <span onClick={() => openAppPhoto(doc)} style={{ color: "var(--accent)", cursor: "pointer", marginLeft: 6 }}>View</span></div>}

        <button className="f-submit" style={{ width: "100%" }} disabled={!f.amount || busy} onClick={saveDraft}>
          {ed ? "Update Draft" : "Save as Draft"}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------ EXPENSE FORMAT (statement document) ------------------------------------------------ */
function ExpenseFormatView({ list, reload }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const fmt = list.find((e) => String(e._id) === String(id));

  if (!fmt) return (<><ScreenHead title="Expense Statement" /><div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Statement not found. <span onClick={() => nav("/app/expense")} style={{ color: "var(--accent)", cursor: "pointer" }}>Go back</span></div></>);

  const items = fmt.items || [];
  const total = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const editable = fmt.status === "Format" || fmt.status === "Rejected";

  const submit = async () => {
    if (!window.confirm("Submit this expense statement to admin for approval?")) return;
    setBusy(true);
    try {
      await api.update("expense", fmt._id, { ...fmt, status: "Submitted", submittedAt: new Date().toLocaleString("en-IN"), rejectRemark: "", rejectAttachment: "", partialRejected: false });
      try { await api.create("notification", { title: "Expense Submitted", message: `${CU().name} submitted an expense statement of ₹${total.toLocaleString("en-IN")}`, forRole: "Admin", link: "/admin/dashboards/expense", at: new Date().toISOString() }); } catch {}
      reload && reload();
      nav("/app/expense");
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const downloadPdf = async () => {
    setBusy(true);
    try { await buildExpensePdf(fmt); }
    catch (e) { alert("PDF failed: " + e.message); }
    setBusy(false);
  };

  const saveEditedItem = async (upd) => {
    const newItems = items.map((it, i) => (i === upd.idx ? { date: upd.date, km: upd.km, station: upd.station, category: upd.category, type: CAT_TYPE[upd.category] || "Miscellaneous", amount: Number(upd.amount) || 0, desc: upd.desc, photo: upd.photo || "", rejected: false, rejectRemark: "" } : it));
    const newTotal = newItems.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    try {
      await api.update("expense", fmt._id, { ...fmt, items: newItems, amount: newTotal });
      setEditItem(null);
      reload && reload();
    } catch (e) { alert(e.message); }
  };

  const delEditedItem = async (idx) => {
    if (!window.confirm("Remove this entry from the statement?")) return;
    const newItems = items.filter((_, i) => i !== idx);
    const newTotal = newItems.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    try {
      await api.update("expense", fmt._id, { ...fmt, items: newItems, amount: newTotal });
      setEditItem(null);
      reload && reload();
    } catch (e) { alert(e.message); }
  };

  const statusColor = fmt.status === "Approved" ? "#0f7a44" : fmt.status === "Rejected" ? "#c03636" : fmt.status === "Submitted" ? "#2563eb" : "#c07f00";

  return (
    <>
      <ScreenHead title="Expense Statement" />
      <div style={{ padding: "0 16px 30px" }}>
        {/* status banner */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 10, boxShadow: "var(--shadow)" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>₹{total.toLocaleString("en-IN")}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{items.length} entries · {fmt.periodFrom} → {fmt.periodTo}</div>
          </div>
          <span style={{ fontWeight: 800, color: statusColor, fontSize: 13 }}>{fmt.status}</span>
        </div>

        {fmt.status === "Rejected" && fmt.rejectRemark && (
          <div style={{ background: "#fdecec", color: "#c03636", borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 12.5 }}>
            <b>Rejected:</b> {fmt.rejectRemark}
            {fmt.rejectAttachment && <div style={{ marginTop: 6 }}><span onClick={() => openAppPhoto(fmt.rejectAttachment)} style={{ color: "#c03636", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>📎 View admin attachment</span></div>}
            <div style={{ marginTop: 6, color: "#7a2323" }}>Fix the entries and submit again.</div>
          </div>
        )}

        {/* statement table */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Statement Entries</div>
          {items.map((it, i) => (
            <div key={i} style={{ borderBottom: "1px solid #eef1f8", padding: "8px 0", display: "flex", justifyContent: "space-between", gap: 8, background: it.rejected ? "#fdecec" : undefined, borderRadius: it.rejected ? 8 : 0, paddingLeft: it.rejected ? 8 : 0, paddingRight: it.rejected ? 8 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{i + 1}. {it.category} {it.rejected && <span style={{ color: "#c03636", fontSize: 10.5, fontWeight: 800 }}>● REJECTED</span>}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{it.date}{it.km ? ` · ${it.km} km` : ""} · {it.station || ""} · {it.type}{it.desc ? ` · ${it.desc}` : ""}</div>
                {it.rejected && it.rejectRemark && <div style={{ fontSize: 11, color: "#c03636", marginTop: 2 }}>↳ {it.rejectRemark}</div>}
                {it.photo && <span onClick={() => openAppPhoto(it.photo)} style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>📎 Bill</span>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>₹{(Number(it.amount) || 0).toLocaleString("en-IN")}</div>
                {(editable || it.rejected) && <button onClick={() => setEditItem({ idx: i, ...it })} style={{ marginTop: 4, background: "#eef1ff", color: "#3949ab", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>✎ Edit</button>}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontWeight: 800 }}>
            <span>TOTAL</span><span>₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="f-submit" style={{ flex: 1, background: "#3949ab" }} disabled={busy} onClick={downloadPdf}>{busy ? "…" : "⬇ Download PDF + Bills"}</button>
          {editable && <button className="f-submit" style={{ flex: 1, background: "#0f7a44" }} disabled={busy} onClick={submit}>Submit to Admin</button>}
        </div>
        {fmt.status === "Submitted" && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, marginTop: 10 }}>Submitted — waiting for admin approval.</div>}
        {fmt.status === "Approved" && <div style={{ textAlign: "center", color: "#0f7a44", fontSize: 12.5, marginTop: 10, fontWeight: 700 }}>✓ Approved{fmt.approvedAmount ? ` · ₹${Number(fmt.approvedAmount).toLocaleString("en-IN")}` : ""}</div>}
      </div>

      {editItem && <ExpenseItemEdit item={editItem} onClose={() => setEditItem(null)} onSave={saveEditedItem} onDelete={() => delEditedItem(editItem.idx)} />}
    </>
  );
}

/* edit one entry inside a prepared format */
function ExpenseItemEdit({ item, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...item });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const u = await api.uploadPhoto(file, "expense"); set("photo", u.url); } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 320, display: "grid", placeItems: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 20, maxHeight: "88vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Edit Entry</h3>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Date</label>
        <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} style={{ width: "100%", marginBottom: 10, padding: 9, borderRadius: 9, border: "1px solid var(--line)" }} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>K.M.</label>
        <input inputMode="decimal" value={f.km} onChange={(e) => set("km", e.target.value.replace(/[^\d.]/g, ""))} style={{ width: "100%", marginBottom: 10, padding: 9, borderRadius: 9, border: "1px solid var(--line)" }} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Expense Type</label>
        <select value={f.station} onChange={(e) => set("station", e.target.value)} style={{ width: "100%", marginBottom: 10, padding: 9, borderRadius: 9, border: "1px solid var(--line)" }}>
          <option>Outstation</option><option>Exstation</option>
        </select>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Category</label>
        <select value={f.category} onChange={(e) => set("category", e.target.value)} style={{ width: "100%", marginBottom: 10, padding: 9, borderRadius: 9, border: "1px solid var(--line)" }}>
          {EXP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Amount (₹)</label>
        <input inputMode="numeric" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/\D/g, ""))} style={{ width: "100%", marginBottom: 10, padding: 9, borderRadius: 9, border: "1px solid var(--line)" }} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Description</label>
        <textarea rows={2} value={f.desc} onChange={(e) => set("desc", e.target.value)} style={{ width: "100%", marginBottom: 10, padding: 9, borderRadius: 9, border: "1px solid var(--line)" }} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Bill / Document</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => upload(e.target.files[0])} style={{ marginBottom: 8, fontSize: 12 }} />
        {f.photo && <div style={{ fontSize: 11.5, color: "#0f7a44", marginBottom: 8 }}>✓ bill <span onClick={() => openAppPhoto(f.photo)} style={{ color: "var(--accent)", cursor: "pointer" }}>View</span></div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={onDelete} style={{ padding: 10, borderRadius: 9, border: "none", background: "#fdecec", color: "#c03636", fontWeight: 700 }}>Delete</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: "10px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "#fff", fontWeight: 700 }}>Cancel</button>
          <button disabled={busy} onClick={() => onSave(f)} style={{ padding: "10px 16px", borderRadius: 9, border: "none", background: "#0f7a44", color: "#fff", fontWeight: 700 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* fetch an image URL and convert to dataURL for jsPDF */
async function urlToDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

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

  const tiles = [
    { v: presents === null ? "…" : presents, k: "Presents", note: "this month" },
    { v: monthLeaves, k: "Leaves", note: "this month" },
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

/* Quotation number: EP/08/160/26-27  (EP=company, 08=month, 160=running, 26-27=FY) */
function financialYear(d = new Date()) {
  const y = d.getFullYear() % 100, m = d.getMonth(); // Apr(3)..Mar
  return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
async function nextQuoteNo() {
  const mm = String(new Date().getMonth() + 1).padStart(2, "0");
  const fy = financialYear();
  let running = 160;
  try {
    const d = await api.list("quotation", false);
    const nums = (d.records || []).map((r) => {
      const s = String(r.data?.baseNo || r.data?.quoteNo || "");
      const m = s.match(/EP\/\d+\/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const max = nums.length ? Math.max(...nums) : 159;
    running = Math.max(max + 1, 160);
  } catch {}
  return `EP/${mm}/${running}/${fy}`;
}

async function sendVisitWhatsApp(number, party) {
  try {
    if (!number) return;
    const d = await api.list("appSettings", false);
    const cfg = ((d.records || [])[0] || {}).data || {};
    if (!cfg.waEnabled || !cfg.waApiUrl) return;   // PingMate integration tarvat pani chestundi
    const msg = `Dear ${party}, thank you for your time today. It was a pleasure visiting you. — Eurobond`;
    await fetch(cfg.waApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.waApiKey ? { Authorization: "Bearer " + cfg.waApiKey } : {}) },
      body: JSON.stringify({ to: "91" + String(number).slice(-10), message: msg }),
    });
  } catch { /* silent */ }
}

/* Quick Follow-up — existing customer ki only date + remark add (full form kaadu) */
function FieldFollowUpQuick({ add }) {
  const nav = useNavigate();
  const qRef = useRef(undefined);
  if (qRef.current === undefined) { qRef.current = FOLLOWUP_QUICK.data || null; FOLLOWUP_QUICK.data = null; }
  const cust = qRef.current;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  if (!cust) { nav("/app/customers"); return null; }
  const primary = (cust.contacts || [])[0] || {};

  return (
    <>
      <ScreenHead title="Follow Up" />
      <div className="f-form">
        <div style={{ background: "#eef1ff", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{cust.name}</div>
          {cust.mobile && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{cust.mobile}</div>}
        </div>

        <label>Follow-up Date <b>*</b></label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", marginBottom: 14 }} />

        <label>Remark <b>*</b></label>
        <textarea rows={4} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What happened in this follow-up…" style={{ width: "100%", marginBottom: 16 }} />

        <button className="f-submit" style={{ width: "100%" }} disabled={!remark || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await add({
                customer: cust.name, partyName: cust.name, category: cust.category,
                mobile: cust.mobile || primary.mobile, contactName: cust.contactName || primary.name,
                address: cust.address, projects: cust.projects, contacts: cust.contacts,
                type: "Follow Up", date, notes: remark,
                status: "Follow Up", createdBy: CU().name,
                updates: [{ date, type: "Follow Up", remark, at: new Date().toLocaleString("en-IN") }],
              });
              nav("/app/customers");
            } catch (e) { alert(e.message); setBusy(false); }
          }}>Save</button>
      </div>
    </>
  );
}

function FieldFollowUpNew({ add, editData }) {
  const nav = useNavigate();
  const ed = editData || null;
  const pf = FOLLOWUP_PREFILL.data; FOLLOWUP_PREFILL.data = null;   // one-time prefill from scan/quote
  const [f, setF] = useState({
    category: ed?.category || pf?.type || "Distributor", partyName: ed?.partyName || ed?.name || pf?.name || "", address: ed?.address || "", type: "Visit", notes: ed?.notes || "", lat: ed?.lat || null, lng: ed?.lng || null,
  });
  const [projects, setProjects] = useState(ed?.projects?.length ? ed.projects : (ed?.projectName ? String(ed.projectName).split(",").map((x) => x.trim()) : [""]));   // multiple project names
  const [contacts, setContacts] = useState(ed?.contacts?.length ? ed.contacts : [{ name: ed?.contactName || pf?.name || "", mobile: ed?.mobile || pf?.mobile || "", whatsapp: ed?.whatsapp || pf?.mobile || "", email: ed?.email || "" }]);
  const [locBusy, setLocBusy] = useState(!ed);
  const [scanBusy, setScanBusy] = useState(false);

  /* address AUTO — form open avvagane immediate GPS capture (edit lo existing address unchi) */
  useEffect(() => {
    if (ed) { setLocBusy(false); return; }   // edit: existing address unchu
    if (!navigator.geolocation) { setLocBusy(false); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const la = pos.coords.latitude, ln = pos.coords.longitude;
      setF((x) => ({ ...x, lat: la, lng: ln }));
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${ln}&zoom=18&addressdetails=1`, { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        const a = j.address || {};
        /* full address — Borivali West/East vantivi suburb/city_district lo untay.
           display_name lo anni untay kani country/redundant teesesi build cheddam. */
        const ordered = [
          a.road, a.neighbourhood, a.suburb, a.quarter, a.residential,
          a.city_district, a.borough, a.municipality,
          a.city || a.town || a.village,
          a.county, a.state_district, a.state, a.postcode,
        ].filter(Boolean);
        /* dedup + keep order */
        const seen = new Set();
        const parts = ordered.filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
        let addr = parts.join(", ");
        /* display_name lo "West"/"East" unte kani mana parts lo lekpote, display_name vadu */
        if (!/\b(west|east|north|south)\b/i.test(addr) && /\b(west|east|north|south)\b/i.test(j.display_name || "")) {
          addr = (j.display_name || "").replace(/, India$/i, "").replace(/, \d{6}$/, (m) => m);
        }
        setF((x) => ({ ...x, address: addr || j.display_name || `${la.toFixed(5)}, ${ln.toFixed(5)}` }));
      } catch {
        setF((x) => ({ ...x, address: `${la.toFixed(5)}, ${ln.toFixed(5)}` }));
      }
      setLocBusy(false);
    }, () => setLocBusy(false), { enableHighAccuracy: true, timeout: 15000 });
  }, []);

  const setContact = (i, key, val) => setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  const addContact = () => setContacts((cs) => [...cs, { name: "", mobile: "", whatsapp: "", email: "" }]);
  const removeContact = (i) => setContacts((cs) => cs.filter((_, idx) => idx !== i));

  const inp = { width: "100%", marginBottom: 12 };
  const CATS = ["Distributor", "End User", "Architect", "Fabricator", "Consultant", "Dealer", "Builder", "Corporate", "Customer"];

  /* Visiting card scan — OCR integration tarvat (ippudu placeholder: photo tho manual assist) */
  const scanCard = async (file) => {
    if (!file) return;
    setScanBusy(true);
    try {
      /* TODO: OCR API — ippudu image save chesi manual fill (integration tarvat auto-fill vastundi) */
      alert("Visiting card scan — OCR integration pending. Meanwhile details manual ga fill cheyandi.");
    } catch (e) { alert(e.message); }
    setScanBusy(false);
  };

  return (
    <>
      <ScreenHead title={ed ? "Edit Customer" : "Add New Customer"} />
      <div className="f-form">
        {/* Visiting card scan — top lo, entry pani taggutundi */}
        <div style={{ background: "linear-gradient(135deg,#eef1ff,#f4ecff)", borderRadius: 14, padding: "14px", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: "var(--navy)", marginBottom: 4 }}>📇 Scan Visiting Card</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>Scan front & back — details auto-fill (add both sides)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, border: "1.5px solid var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
              📷 Front <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => scanCard(e.target.files[0])} />
            </label>
            <label style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, border: "1.5px solid var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
              📷 Back <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => scanCard(e.target.files[0])} />
            </label>
          </div>
          {scanBusy && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>Scanning…</div>}
        </div>

        <label>Category <b>*</b></label>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp}>
          {CATS.map((c) => <option key={c}>{c}</option>)}
        </select>

        <label>Firm Name <b>*</b></label>
        <input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} style={inp} />

        <label>Project Name</label>
        {projects.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input value={p} onChange={(e) => setProjects((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Project ${i + 1}`} style={{ flex: 1 }} />
            {projects.length > 1 && <button type="button" onClick={() => setProjects((ps) => ps.filter((_, j) => j !== i))} style={{ border: "none", background: "#fdecec", color: "#c03636", borderRadius: 8, padding: "0 12px", fontWeight: 800 }}>✕</button>}
          </div>
        ))}
        <button type="button" onClick={() => setProjects((ps) => [...ps, ""])} style={{ width: "100%", marginBottom: 12, padding: "8px", borderRadius: 10, border: "1.5px dashed var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 12.5 }}>
          ➕ Add Project
        </button>

        <label>Address (auto — current location)</label>
        <div style={{ ...inp, background: "#f1f4fb", border: "1.5px solid #d7dcef", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: locBusy ? "var(--muted)" : "#33406b", minHeight: 42 }}>
          {locBusy ? "📍 Getting your location…" : (f.address ? `📍 ${f.address}` : "⚠️ Location unavailable — turn on GPS")}
        </div>

        <div style={{ fontWeight: 800, fontSize: 13.5, margin: "6px 0 10px", color: "var(--navy)" }}>Contact Info</div>
        {contacts.map((c, i) => (
          <div key={i} style={{ background: "#f7f9ff", borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Contact {i + 1}</span>
              {contacts.length > 1 && <button type="button" onClick={() => removeContact(i)} style={{ background: "none", border: "none", color: "#c03636", fontSize: 12, fontWeight: 700 }}>Remove</button>}
            </div>
            <input value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} placeholder="Contact Name" style={{ width: "100%", marginBottom: 8 }} />
            <input inputMode="numeric" value={c.mobile} onChange={(e) => setContact(i, "mobile", e.target.value.replace(/\D/g, ""))} placeholder="Contact Number" style={{ width: "100%", marginBottom: 8 }} />
            <input inputMode="numeric" value={c.whatsapp} onChange={(e) => setContact(i, "whatsapp", e.target.value.replace(/\D/g, ""))} placeholder="WhatsApp Number" style={{ width: "100%", marginBottom: 8 }} />
            <input type="email" value={c.email || ""} onChange={(e) => setContact(i, "email", e.target.value)} placeholder="Mail ID" style={{ width: "100%" }} />
          </div>
        ))}
        <button type="button" onClick={addContact} style={{ width: "100%", marginBottom: 14, padding: "9px", borderRadius: 10, border: "1.5px dashed var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 13 }}>
          ➕ Add Another Contact
        </button>

        <label>Remark</label>
        <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={inp} />

        <button
          className="f-submit" style={{ width: "100%" }}
          disabled={!f.partyName}
          onClick={() => {
            const primary = contacts[0] || {};
            const projList = projects.map((p) => p.trim()).filter(Boolean);
            add({
              ...f, customer: f.partyName,
              projectName: projList.join(", "), projects: projList,
              contacts,
              contactName: primary.name, contactNumber: primary.mobile, whatsapp: primary.whatsapp, email: primary.email, clientEmail: primary.email,
              mobile: primary.mobile, place: f.address.split(",").slice(0, 2).join(",").trim(),
              status: "To-Do", createdBy: CU().name,
              updates: [{ date: new Date().toISOString().slice(0, 10), type: f.type, remark: f.notes, at: new Date().toLocaleString("en-IN") }],
            });
            /* WhatsApp: visit ayyaru ani chinna message (PingMate integration tarvat) */
            sendVisitWhatsApp(primary.whatsapp || primary.mobile, f.partyName);
            nav("/app/customers");
          }}
        >
          Save
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
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{e.date} {e.invoice && <span onClick={() => openAppPhoto(e.invoice)} style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 700 }}>· Invoice</span>}</div>
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

/* ---- HOD: Team Tracking (live location of team, today only, map + points) ---- */
function FieldTeamTracking() {
  const [sessions, setSessions] = useState(null);
  const [sel, setSel] = useState(null);        // selected session for map
  const [pts, setPts] = useState([]);
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const today = new Date().toISOString().slice(0, 10);

  const isHodFull = /^hod /i.test(CU().role || "");

  const load = () => {
    api.attList(today, today).then((d) => {
      const me = CU().name;
      let team = (d.sessions || []);
      if (isHodFull) {
        /* HOD → direct reports + sub-hod reports */
        api.listUsers().then((uu) => {
          const all = (uu.users || []);
          const subHods = all.filter((x) => x.manager === me && /^sub hod/i.test(x.role || "")).map((x) => x.name);
          setSessions(team.filter((s) => s.manager === me || subHods.includes(s.manager)));
        }).catch(() => setSessions(team.filter((s) => s.manager === me)));
      } else {
        /* Sub HOD → only direct team */
        setSessions(team.filter((s) => s.manager === me));
      }
    }).catch(() => setSessions([]));
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  /* open a member's timeline points (LIST, no map) */
  const openTrack = async (s) => {
    setSel(s);
    setPts([]);
    try {
      const d = await api.attTrack(s.id);
      setPts((d.points || []).map((p) => ({ lat: +p.lat, lng: +p.lng, accuracy: +p.accuracy || null, recorded_at: p.recorded_at, battery: p.battery, online: p.online, address: p.address })));
    } catch { setPts([]); }
  };

  /* auto-refresh the open member's points every 30s */
  useEffect(() => {
    if (!sel) return;
    const t = setInterval(async () => {
      try { const d = await api.attTrack(sel.id); setPts((d.points || []).map((p) => ({ lat: +p.lat, lng: +p.lng, accuracy: +p.accuracy || null, recorded_at: p.recorded_at, battery: p.battery, online: p.online, address: p.address }))); } catch {}
    }, 30000);
    return () => clearInterval(t);
  }, [sel]);

  const statusColor = (s) => s === "Live" ? "#12a150" : (s === "GPS Off" || s === "App Closed") ? "#e08600" : "#8894a8";
  const gpsLabel = (s) => s === "Live" ? "GPS On" : s === "Completed" ? "Completed" : "GPS Off";

  if (sel) {
    return (
      <>
        <div className="f-screen-head">
          <button onClick={() => { setSel(null); setPts([]); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><ChevronLeft size={22} /></button>
          <h2>{sel.name}</h2>
        </div>
        <div style={{ padding: "0 0 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
            <div>
              <div style={{ fontWeight: 800 }}>{sel.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{sel.visit_name || sel.visit_type || "Field"} · {sel.city || ""}</div>
            </div>
            <span style={{ fontWeight: 800, fontSize: 12.5, color: statusColor(sel.app_status) }}>● {gpsLabel(sel.app_status)}</span>
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: "var(--muted)", margin: "6px 0 8px" }}>Timeline ({pts.length} points)</div>
            {pts.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 20, fontSize: 13 }}>No location points yet today.</div>
            ) : pts.slice().reverse().slice(0, 40).map((p, ri) => {
              const i = pts.length - 1 - ri;   // original index
              const isStart = i === 0, isEnd = i === pts.length - 1;
              const label = isStart ? "Start" : isEnd ? (sel.app_status === "Live" ? "Live" : "End") : "Point " + (i + 1);
              return (
                <div key={ri} style={{ borderLeft: `3px solid ${isStart ? "#20bf6b" : isEnd ? (sel.app_status === "Live" ? "#2f6fed" : "#e8422e") : "#c5cae0"}`, background: "#fff", borderRadius: 8, padding: "8px 11px", marginBottom: 6, boxShadow: "var(--shadow)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)" }}>{label}</span>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>🔋 {p.battery != null ? p.battery + "%" : "NA"} {p.online === 1 || p.online === true ? "🟢" : ""}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink)", marginTop: 2, fontWeight: 500 }}>{p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{p.recorded_at ? String(p.recorded_at).slice(11, 16) : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHead title="Team Tracking" right={<button onClick={load} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>Refresh</button>} />
      <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--muted)" }}>Live location of your team — today only.</div>
      <div className="f-list-pad">
        {sessions === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No team members have started tracking today.</div>
        ) : sessions.map((s) => (
          <div key={s.id} onClick={() => openTrack(s)} style={{ background: "#fff", borderRadius: 12, padding: "13px 15px", marginBottom: 9, boxShadow: "var(--shadow)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.city || s.zone || "Field"} · {s.visit_name || s.visit_type || "—"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: statusColor(s.app_status) }}>● {gpsLabel(s.app_status)}</div>
              <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginTop: 4 }}>View timeline →</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---- HOD: Team Customers Tracking (which customers each team member added) ---- */
function FieldTeamCustomers() {
  const [data, setData] = useState(null);      // [{name, customers:[...]}]
  const [openMember, setOpenMember] = useState(null);
  const isHodFull = /^hod /i.test(CU().role || "");

  useEffect(() => {
    (async () => {
      try {
        const me = CU().name;
        const uu = await api.listUsers();
        const all = (uu.users || []);
        let teamNames;
        if (isHodFull) {
          const subHods = all.filter((x) => x.manager === me && /^sub hod/i.test(x.role || "")).map((x) => x.name);
          teamNames = all.filter((x) => x.manager === me || subHods.includes(x.manager)).map((x) => x.name);
        } else {
          teamNames = all.filter((x) => x.manager === me).map((x) => x.name);
        }
        const custs = await api.customers("");
        const list = custs.customers || [];
        const grouped = teamNames.map((n) => ({
          name: n,
          customers: list.filter((c) => (c.by || c.createdBy || "") === n),
        })).sort((a, b) => b.customers.length - a.customers.length);
        setData(grouped);
      } catch { setData([]); }
    })();
  }, []);

  if (openMember) {
    return (
      <>
        <div className="f-screen-head">
          <button onClick={() => setOpenMember(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><ChevronLeft size={22} /></button>
          <h2>{openMember.name}</h2>
        </div>
        <div className="f-list-pad">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>{openMember.customers.length} customer{openMember.customers.length !== 1 ? "s" : ""} added</div>
          {openMember.customers.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No customers added yet.</div>
          ) : openMember.customers.map((c, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 11, padding: "11px 13px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.category && <span style={{ background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, padding: "1px 7px", borderRadius: 6, fontSize: 10.5 }}>{c.category}</span>}
                {c.mobile && <span>📞 {c.mobile}</span>}
                {(c.place || c.address) && <span>📍 {c.place || c.address}</span>}
              </div>
              {(c.projectName || (c.projects && c.projects.length)) && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>Projects: {c.projectName || (c.projects || []).join(", ")}</div>}
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{c.followups || 0} follow-up{(c.followups || 0) !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHead title="Team Customers Tracking" />
      <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--muted)" }}>Customers added by each team member.</div>
      <div className="f-list-pad">
        {data === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>Loading…</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30 }}>No team members found.</div>
        ) : data.map((m, i) => (
          <div key={i} onClick={() => setOpenMember(m)} style={{ background: "#fff", borderRadius: 12, padding: "13px 15px", marginBottom: 9, boxShadow: "var(--shadow)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{m.customers.length} customer{m.customers.length !== 1 ? "s" : ""} added</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 20, color: "var(--accent)" }}>{m.customers.length}</span>
              <ChevronRight size={18} style={{ color: "var(--muted)" }} />
            </div>
          </div>
        ))}
      </div>
    </>
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
        const myRole = (CU().role || "").toLowerCase();
        const allUsers = (u.users || []).filter((x) => x.status == 1);
        let team;
        if (/^hod /.test(myRole)) {
          /* HOD → direct reports + everyone under this HOD's Sub HODs (full team) */
          const subHods = allUsers.filter((x) => x.manager === me && /^sub hod/.test((x.role || "").toLowerCase())).map((x) => x.name);
          team = allUsers.filter((x) => x.manager === me || subHods.includes(x.manager));
        } else {
          /* Sub HOD (or others) → only their directly assigned team */
          team = allUsers.filter((x) => x.manager === me);
        }
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
  const [photoView, setPhotoView] = useState(null);

  const load = () => {
    Promise.all([api.listUsers(), api.list("leave", false)])
      .then(([u, l]) => {
        const me = CU().name;
        const myRole = (CU().role || "").toLowerCase();
        const allUsers = (u.users || []).filter((x) => x.status == 1 || x.status === undefined);
        let teamList;
        if (/^hod /.test(myRole)) {
          const subHods = allUsers.filter((x) => x.manager === me && /^sub hod/.test((x.role || "").toLowerCase())).map((x) => x.name);
          teamList = allUsers.filter((x) => x.manager === me || subHods.includes(x.manager));
        } else {
          teamList = allUsers.filter((x) => x.manager === me);
        }
        const myTeam = teamList.map((x) => x.name);
        setTeam(myTeam);
        setRows((l.records || []).map((r) => ({ _id: r.id, ...r.data }))
          .filter((x) => myTeam.includes(x.createdBy || x.appliedBy || x.user)));
      })
      .catch(() => setRows([]));
  };
  useEffect(load, []);

  /* HOD ee page open chesinapudu pending leaves ki 30-min reminders trigger (backend 30-min gap check chestundi) */
  useEffect(() => {
    api.leaveReminders && api.leaveReminders().catch(() => {});
    const id = setInterval(() => { api.leaveReminders && api.leaveReminders().catch(() => {}); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

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
        <div onClick={() => setPhotoView(r.photo)} style={{ display: "inline-block", marginTop: 6, cursor: "pointer" }}>
          {String(r.photo).match(/\.pdf$/i)
            ? <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>📄 View Attachment</span>
            : <img src={r.photo} alt="attachment" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #dfe4f0" }} />}
        </div>
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

      {photoView && (
        <div onClick={() => setPhotoView(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 300, display: "grid", placeItems: "center", padding: 16 }}>
          <button onClick={() => setPhotoView(null)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", fontSize: 22, cursor: "pointer" }}>×</button>
          {String(photoView).match(/\.pdf$/i)
            ? <iframe src={photoView} title="Attachment" style={{ width: "100%", height: "85vh", border: "none", borderRadius: 8, background: "#fff" }} />
            : <img src={photoView} alt="attachment" style={{ maxWidth: "100%", maxHeight: "90vh", borderRadius: 8 }} onClick={(e) => e.stopPropagation()} />}
        </div>
      )}
    </>
  );
}
function FieldProfile({ onLogout }) {
  const [u, setU] = useState(() => CU() || {});
  /* refresh from server; keep showing cached data meanwhile so it never goes blank */
  useEffect(() => {
    let alive = true;
    api.me().then((usr) => {
      if (alive && usr && (usr.name || usr.mobile)) {
        const merged = { ...(CU() || {}), ...usr };
        auth.user = merged;
        setU(merged);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const initials = String(u.name || "").trim().split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2) || "?";
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
          {initials}
        </div>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 18 }}>{u.name || "—"}</div>
        <div style={{ color: "var(--muted)", fontSize: 12.5, fontWeight: 700 }}>{u.code} · {u.role}</div>
        <div style={{ margin: "12px auto 0", maxWidth: 260 }}>
          {(() => {
            const fields = [u.name, u.mobile || u.phone, u.email, u.code, u.role, u.city, u.state, u.manager, u.designation, u.grade];
            const filled = fields.filter((x) => x && String(x).trim() && String(x).trim() !== "—").length;
            const pct = Math.round((filled / fields.length) * 100);
            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
                  <span>Profile completion</span><span>{pct}%</span>
                </div>
                <div style={{ height: 7, background: "#e8ebf6", borderRadius: 99, marginTop: 4 }}>
                  <div style={{ width: pct + "%", height: "100%", background: pct === 100 ? "#22a45d" : "var(--accent)", borderRadius: 99 }} />
                </div>
              </>
            );
          })()}
        </div>
      </div>
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {row(<Phone size={15} />, "Mobile", u.mobile || u.phone || "—")}
        {row(<Mail size={15} />, "Email", u.email || "—")}
        {row(<MapPin size={15} />, "City", u.city)}
        {row(<User size={15} />, "Reporting Manager", u.manager || "—")}
        {row(<CalendarDays size={15} />, "Weekly Off", u.weekly_off || u.weeklyOff || "—")}
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
    if (/admin/i.test(CU().role || "")) return true;  // Admin → everything
    if (!access || !access[myRole]) return true;    // admin never saved a map → show all
    return access[myRole][key] !== false;           // saved map decides (admin's tick)
  };
  const rawGroups = [
    { h: "MAIN", items: [
      ["Home", <Home size={16} />, "/app", null],
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
      ["Team Tracking", <MapPin size={16} />, "/app/team-tracking", "teamTracking"],
      ["Team Customers Tracking", <Users size={16} />, "/app/team-customers", "teamCustomers"],
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
            if (mod === "task" || mod === "projectProjection" || cfg.isSpecThread) nav(`/app/thread/${mod}/${r._id}`);
          }} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", cursor: (cfg.isSpecThread || mod === "task" || mod === "projectProjection") ? "pointer" : "default" }}>
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
                {r.attachment && <button onClick={(e) => { e.stopPropagation(); openAppPhoto(r.attachment); }} style={actBtn("#3949ab")}>📎 File</button>}
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
                    ...(photoUrl ? { photo: photoUrl } : {}),
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
                    ...(photoUrl ? { photo: photoUrl } : {}),
                    createdBy: CU().name,
                    createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                  });
                  await api.create("salesToSpec", {
                    id: "STS-" + String(Date.now()).slice(-4),
                    project: f.project, help: f.help || "", specPerson: CU().name, salesPerson: f.salesPerson,
                    ...(photoUrl ? { photo: photoUrl } : {}),
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
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("eb_notif_dismissed") || "[]")); } catch { return new Set(); }
  });

  useEffect(() => {
    api.myNotifications().then((d) => {
      const me = CU();
      const mine = (d.records || [])
        .map((r) => ({ _id: String(r.id), ...r.data }))
        .filter((n) => isMine(n, me));
      setRows(mine);
      if (mine.length) markRead(mine.map((n) => n._id));
    }).catch(() => setRows([]));
  }, []);

  const open = (n) => {
    markRead(n._id);
    setRead(getReadIds());
    /* once viewed, remove it so it never shows again (even after re-login) */
    dismiss(n._id);
    if (n.link) nav(n.link);
  };

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(String(id));
      localStorage.setItem("eb_notif_dismissed", JSON.stringify([...next]));
      return next;
    });
    /* also mark read + seen so it never re-shows after re-login or re-fires as a phone notification */
    markRead(id);
    try {
      const seen = new Set(JSON.parse(localStorage.getItem("eb_seen_notif") || "[]"));
      seen.add(String(id));
      localStorage.setItem("eb_seen_notif", JSON.stringify([...seen].slice(-200)));
    } catch {}
  };

  const visible = (rows || []).filter((n) => !dismissed.has(String(n._id)));

  const clearAll = () => {
    if (!visible.length) return;
    if (!window.confirm("Clear all notifications?")) return;
    const ids = visible.map((n) => String(n._id));
    setDismissed((prev) => {
      const next = new Set(prev); ids.forEach((id) => next.add(id));
      localStorage.setItem("eb_notif_dismissed", JSON.stringify([...next]));
      return next;
    });
    markRead(ids);
    try {
      const seen = new Set(JSON.parse(localStorage.getItem("eb_seen_notif") || "[]"));
      ids.forEach((id) => seen.add(id));
      localStorage.setItem("eb_seen_notif", JSON.stringify([...seen].slice(-200)));
    } catch {}
  };

  return (
    <>
      <ScreenHead title="Notifications" />
      {visible.length > 0 && (
        <div style={{ padding: "8px 16px 0", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={clearAll} style={{ background: "#fdecec", color: "#c0392b", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12 }}>Clear All</button>
        </div>
      )}
      <div className="f-list-pad" style={{ paddingTop: 14 }}>
        {rows === null ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>
            <Bell size={34} style={{ opacity: 0.4, marginBottom: 10 }} />
            <div style={{ fontWeight: 700 }}>No notifications yet</div>
          </div>
        ) : visible.map((n, i) => {
          const unread = !read.has(String(n._id));
          return <SwipeNotif key={n._id || i} n={n} unread={unread} onOpen={() => open(n)} onDismiss={() => dismiss(n._id)} />;
        })}
      </div>
    </>
  );
}

/* Swipe-left to dismiss (phone-style), tap to open */
function SwipeNotif({ n, unread, onOpen, onDismiss }) {
  const [dx, setDx] = useState(0);
  const startX = useRef(null);
  const moved = useRef(false);

  const onStart = (e) => { startX.current = (e.touches ? e.touches[0].clientX : e.clientX); moved.current = false; };
  const onMove = (e) => {
    if (startX.current == null) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const d = x - startX.current;
    if (Math.abs(d) > 6) moved.current = true;
    if (d < 0) setDx(Math.max(d, -140));
  };
  const onEnd = () => {
    if (dx < -80) { setDx(-400); setTimeout(onDismiss, 150); }
    else setDx(0);
    startX.current = null;
  };

  return (
    <div style={{ position: "relative", marginBottom: 8, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "#e5484d", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 20, color: "#fff", fontWeight: 800, fontSize: 13 }}>Delete ✕</div>
      <div
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
        onMouseDown={onStart} onMouseMove={(e) => startX.current != null && onMove(e)} onMouseUp={onEnd} onMouseLeave={() => startX.current != null && onEnd()}
        onClick={() => { if (!moved.current) onOpen(); }}
        style={{
          background: "#fff", borderRadius: 12, padding: "12px 14px",
          boxShadow: "var(--shadow)", borderLeft: `4px solid ${unread ? "var(--accent)" : "#d7dce5"}`,
          cursor: "pointer", opacity: unread ? 1 : 0.72,
          transform: `translateX(${dx}px)`, transition: startX.current == null ? "transform .18s" : "none",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {unread && <span style={{ width: 7, height: 7, borderRadius: 4, background: "#e5484d", flexShrink: 0 }} />}
          <div style={{ fontWeight: unread ? 700 : 600, fontSize: 13.5, flex: 1 }}>{n.title || "Notification"}</div>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 3 }}>{n.message}</div>
        {n.createdAt && <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 5 }}>{n.createdAt}</div>}
      </div>
    </div>
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
                  ? <span onClick={() => openAppPhoto(m.doc)} style={{ display: "block", marginTop: 5, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📄 View PDF</span>
                  : <img src={m.doc} alt="" onClick={() => openAppPhoto(m.doc)} style={{ maxWidth: 160, borderRadius: 8, display: "block", marginTop: 5, cursor: "pointer" }} />)}
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

const ENQ_SOURCES = ["IndiaMart", "Website", "Direct Call", "Exhibition", "DCCHAT", "IndiaMart (ARCHER)", "Other", "Website Archer", "Website Eurobond"];

function FieldEnquiry() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [view, setView] = useState(null);
  const [winFor, setWinFor] = useState(null);
  const [reassignFor, setReassignFor] = useState(null);

  const load = () => {
    api.list("enquiry", false).then((d) => {
      const me = CU();
      const list = (d.records || []).map((r) => ({ _id: r.id, ...r.data }))
        .filter((r) => (r.assignedTo === me.name || r.assignedToId === me.id) && (r.status || "").toLowerCase() !== "spam");
      setRows(list);
    }).catch(() => setRows([]));
  };
  useEffect(load, []);

  const filtered = (rows || []).filter((r) =>
    (!src || (r.leadFrom || r.leadSource) === src) &&
    (!q || (r.company || r.customer || "").toLowerCase().includes(q.toLowerCase()) || (r.contact || r.phone || "").includes(q))
  );

  const markSpam = async (r) => {
    if (!window.confirm("Mark this enquiry as Spam? It will be removed from your list and sent to admin.")) return;
    try {
      await api.update("enquiry", r._id, { ...r, status: "Spam", spamBy: CU().name, spamAt: new Date().toLocaleString("en-IN") });
      try { await api.create("notification", { title: "Enquiry marked Spam", message: `${CU().name} marked ${r.company || r.customer} enquiry as spam.`, forRole: "Admin", link: "/admin/sfa/enquiry", at: new Date().toISOString() }); } catch {}
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <ScreenHead title="My Enquiries" />
      <div style={{ padding: "12px 16px 0" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company / number…" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d7dcef", fontSize: 13.5, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
          <button onClick={() => setSrc("")} style={chip(!src)}>All</button>
          {ENQ_SOURCES.map((t) => <button key={t} onClick={() => setSrc(t)} style={chip(src === t)}>{t}</button>)}
        </div>
      </div>
      <div className="f-list-pad" style={{ paddingTop: 8 }}>
        {rows === null ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>Loading…</div>
        : filtered.length === 0 ? <div style={{ textAlign: "center", color: "var(--muted)", padding: 30, fontSize: 13 }}>No enquiries assigned yet.</div>
        : filtered.map((r, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 7, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
              <span>{r.company || r.customer || "Enquiry"}</span>
              <span style={{ color: r.status === "Win" ? "#059669" : "#c99400", fontSize: 10.5 }}>{r.status || "Assigned"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {(r.leadFrom || r.leadSource || "")}{r.product ? " · " + r.product : ""}{(r.area || r.state) ? " · " + [r.area, r.state].filter(Boolean).join(", ") : ""}
            </div>
            {r.contact || r.phone ? <div style={{ fontSize: 11.5, color: "var(--navy)", marginTop: 2, fontWeight: 600 }}>{r.contact || r.phone}</div> : null}

            {/* action buttons */}
            <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => setView(r)} style={enqBtn("#3949ab", "#eef1ff")}>👁 View</button>
              {(r.contact || r.phone) && <a href={`tel:${r.contact || r.phone}`} style={{ ...enqBtn("#059669", "#e5f9f1"), textDecoration: "none", textAlign: "center" }}>📞 Call</a>}
              {r.status !== "Win" && <button onClick={() => markSpam(r)} style={enqBtn("#c0392b", "#fdecec")}>🚫 Spam</button>}
              {r.status !== "Win" && <button onClick={() => setReassignFor(r)} style={enqBtn("#6c5ce7", "#efeaff")}>↗ Reassign</button>}
              {r.status !== "Win" && <button onClick={() => setWinFor(r)} style={enqBtn("#0f7a44", "#e5f9f1")}>🏆 Win</button>}
            </div>
          </div>
        ))}
      </div>

      {view && <EnquiryDetailView r={view} onClose={() => setView(null)} />}
      {winFor && <EnquiryWin r={winFor} onClose={() => setWinFor(null)} onDone={load} />}
      {reassignFor && <EnquiryReassign r={reassignFor} onClose={() => setReassignFor(null)} onDone={load} />}
    </>
  );
}

function enqBtn(color, bg) {
  return { flex: "1 1 auto", minWidth: 58, padding: "6px 4px", borderRadius: 8, border: "none", background: bg, color, fontWeight: 700, fontSize: 11, cursor: "pointer" };
}

/* Enquiry full details */
function EnquiryDetailView({ r, onClose }) {
  const row = (label, val) => val ? <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f2f8", fontSize: 13 }}><span style={{ color: "var(--muted)" }}>{label}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span></div> : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px 18px 0 0", width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{r.company || r.customer}</h3>
          <button onClick={onClose} style={{ background: "#f1f3fa", border: "none", width: 32, height: 32, borderRadius: "50%", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {row("Lead From", r.leadFrom || r.leadSource)}
        {row("Date", r.date)}
        {row("Contact Person", r.contactPerson)}
        {row("Contact Number", r.contact || r.phone)}
        {row("Email", r.email)}
        {row("State", r.state)}
        {row("Area", r.area || r.city)}
        {row("Product Request", r.product)}
        {row("Quantity", r.quantity ? `${r.quantity} ${r.uom || ""}` : "")}
        {row("Order Value", r.orderValue)}
        {row("Enquiry Details", r.enquiryDetails)}
        {row("HOD", r.hod)}
        {row("Status", r.status)}
        {row("Assign Date", r.assignDate)}
        {r.status === "Win" && (
          <div style={{ marginTop: 14, background: "#e5f9f1", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 800, color: "#0f7a44", marginBottom: 8 }}>🏆 Win Details</div>
            {row("Order (Sq. Meter)", r.winSqm)}
            {row("Amount", r.winAmount ? `₹${r.winAmount}` : "")}
            {row("Won At", r.winAt)}
            {r.winInvoice && (
              <div style={{ marginTop: 8 }}>
                {String(r.winInvoice).match(/\.pdf$/i)
                  ? <button onClick={() => openAppPhoto(r.winInvoice)} style={{ background: "#fff", border: "1px solid #cfe8d8", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12.5, color: "#0f7a44" }}>📄 View Invoice PDF</button>
                  : <img src={r.winInvoice} alt="invoice" onClick={() => openAppPhoto(r.winInvoice)} style={{ width: "100%", borderRadius: 8, cursor: "pointer" }} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Enquiry Win — Sq.Meter + invoice (photo/PDF), like quotation win */
function EnquiryWin({ r, onClose, onDone }) {
  const [sqm, setSqm] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300, display: "grid", placeItems: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Mark as Win 🏆</h3>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Order (Sq. Meter)</label>
        <input inputMode="decimal" value={sqm} onChange={(e) => setSqm(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 250" style={{ width: "100%", marginBottom: 12, padding: "9px 11px", borderRadius: 9, border: "1px solid #d7dcef" }} />
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Amount (₹)</label>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 875000" style={{ width: "100%", marginBottom: 12, padding: "9px 11px", borderRadius: 9, border: "1px solid #d7dcef" }} />
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Invoice / PO (photo or PDF)</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} style={{ width: "100%", marginBottom: 14, fontSize: 12.5 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 9, border: "1px solid #d7dcef", background: "#fff", fontWeight: 700 }}>Cancel</button>
          <button disabled={busy || !sqm} onClick={async () => {
            setBusy(true);
            try {
              let invoiceUrl = r.winInvoice || "";
              if (file) invoiceUrl = (await api.uploadPhoto(file, "enquiry")).url;
              await api.update("enquiry", r._id, { ...r, status: "Win", winSqm: sqm, winAmount: amount, winInvoice: invoiceUrl, winAt: new Date().toLocaleString("en-IN") });
              try { await api.create("notification", { title: "Enquiry Won 🎉", message: `${CU().name} won ${r.company || r.customer} (${sqm} Sq.Mtr${amount ? ", ₹" + amount : ""})`, forRole: "Admin", link: "/admin/sfa/enquiry", at: new Date().toISOString() }); } catch {}
              onDone(); onClose();
            } catch (e) { alert(e.message); setBusy(false); }
          }} style={{ flex: 1, padding: 10, borderRadius: 9, border: "none", background: "#0f7a44", color: "#fff", fontWeight: 700 }}>{busy ? "Saving…" : "Save Win"}</button>
        </div>
      </div>
    </div>
  );
}

/* Enquiry Reassign — team members (same location) */
function EnquiryReassign({ r, onClose, onDone }) {
  const [team, setTeam] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.listUsers().then((d) => {
      const me = CU();
      const all = (d.users || d.records || []).map((u) => u.data ? { id: u.id, ...u.data } : u);
      /* same location/area team members */
      const mine = all.filter((u) => u.name !== me.name && (u.role || "") !== "Admin");
      setTeam(mine);
    }).catch(() => {});
  }, []);
  const ql = q.trim().toLowerCase();
  const list = ql ? team.filter((u) => (u.name || "").toLowerCase().includes(ql) || String(u.empCode || u.id).toLowerCase().includes(ql)) : team;

  const reassign = async (u) => {
    if (!window.confirm(`Reassign this enquiry to ${u.name}?`)) return;
    try {
      await api.update("enquiry", r._id, { ...r, assignedTo: u.name, assignedToId: u.id, passto: u.name, reassigned: true, reassignedBy: CU().name, reassignAt: new Date().toLocaleString("en-IN"), assignDate: new Date().toLocaleDateString("en-GB") });
      try { await api.create("notification", { title: "Enquiry Assigned", message: `${r.company || r.customer} enquiry assigned to you by ${CU().name}.`, forUser: u.id, link: "/app/m/enquiry", at: new Date().toISOString() }); } catch {}
      try { await api.create("notification", { title: "Enquiry Reassigned", message: `${CU().name} reassigned ${r.company || r.customer} to ${u.name}.`, forRole: "Admin", link: "/admin/sfa/enquiry", at: new Date().toISOString() }); } catch {}
      onDone(); onClose();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300, display: "grid", placeItems: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 20, maxHeight: "80vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Reassign to team member</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / ID…" style={{ width: "100%", marginBottom: 12, padding: "9px 11px", borderRadius: 9, border: "1px solid #d7dcef" }} />
        <div style={{ display: "grid", gap: 6 }}>
          {list.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 12 }}>No team members found</div>
            : list.map((u) => (
              <div key={u.id} onClick={() => reassign(u)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, border: "1px solid #eef1f8", cursor: "pointer" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{u.empCode || u.id}{u.grade ? ` · ${u.grade}` : ""}</div>
                </div>
                <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>Assign →</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function chip(active) {
  return { padding: "6px 14px", borderRadius: 20, border: active ? "none" : "1px solid #d7dcef", background: active ? "var(--navy)" : "#fff", color: active ? "#fff" : "var(--muted)", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 };
}

/* Quotation list — cards with View / Edit / Win (per requirement) */
function FieldQuotationList() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [view, setView] = useState(null);
  const [winFor, setWinFor] = useState(null);

  const load = () => api.list("quotation", true).then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <>
      <ScreenHead title="Quotation" right={<button onClick={() => { QUOTE_PREFILL.data = null; nav("/app/m/quotation/new"); }} style={{ background: "var(--navy)", color: "#fff", border: "none", borderRadius: 20, padding: "7px 14px", fontWeight: 800, fontSize: 13 }}>+ Add</button>} />
      <div className="f-list-pad" style={{ paddingTop: 12 }}>
        {rows === null ? <div style={{ color: "var(--muted)", padding: 20 }}>Loading…</div>
          : rows.length === 0 ? <div style={{ color: "var(--muted)", padding: 30, textAlign: "center" }}>No quotations yet.</div>
            : rows.map((q) => (
              <div key={q._id} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 7, boxShadow: "var(--shadow)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{q.partyName || q.customer}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{q.quoteNo || q.id} · {q.createdAt || ""}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: q.status === "Win" ? "#059669" : q.status === "Approved" ? "#2563eb" : "#c07f00" }}>{q.status || "Pending"}</span>
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                  <button onClick={() => setView(q)} style={{ ...actBtn("#3949ab"), flex: 1, background: "#eef1ff", color: "#3949ab", padding: "6px 4px", fontSize: 11 }}>👁 View</button>
                  <button onClick={() => { QUOTE_EDIT.data = q; nav("/app/m/quotation/new"); }} style={{ ...actBtn("#f59e0b"), flex: 1, background: "#fef3e2", color: "#c07f00", padding: "6px 4px", fontSize: 11 }}>✎ Edit</button>
                  {q.status !== "Win" && <button onClick={() => setWinFor(q)} style={{ ...actBtn("#059669"), flex: 1, background: "#e5f9f1", color: "#059669", padding: "6px 4px", fontSize: 11 }}>🏆 Win</button>}
                </div>
              </div>
            ))}
      </div>

      {view && <QuotationView q={view} onClose={() => setView(null)} />}
      {winFor && <QuotationWin q={winFor} onClose={() => setWinFor(null)} onDone={() => { setWinFor(null); load(); }} />}
    </>
  );
}

/* Quotation full-detail view (in-app, all details) */
function QuotationView({ q, onClose }) {
  const items = q.items || [{ grade: q.grade, colour: q.colour, rate: q.rate }];
  return (
    <div className="f-sheet-mask" onClick={onClose}>
      <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{q.quoteNo || q.id}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>{q.status || "Pending"} · {q.createdAt}</div>
        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <div><b>From:</b> {q.partyName || q.customer}</div>
          {q.category && <div><b>Category:</b> {q.category}</div>}
          {q.projectName && <div><b>Project:</b> {q.projectName}</div>}
          {q.contactName && <div><b>Attn:</b> {q.contactName} {q.contactNumber ? `(${q.contactNumber})` : ""}</div>}
          {q.address && <div><b>Address:</b> {q.address}</div>}
        </div>
        <div style={{ fontWeight: 800, fontSize: 13, margin: "14px 0 8px", color: "var(--navy)" }}>Items</div>
        {items.map((it, i) => (
          <div key={i} style={{ background: "#f6f8fd", borderRadius: 10, padding: "8px 12px", marginBottom: 6, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700 }}>{it.grade || "—"} {i > 0 ? <span style={{ color: "#c07f00", fontSize: 11 }}>(Fins)</span> : ""}</div>
            <div style={{ color: "var(--muted)" }}>Colour: {it.colour || "—"} · ₹{it.rate}/sq.ft {i === 0 && it.ratePerSqm ? `· ₹${it.ratePerSqm}/sq.mtr` : ""}</div>
          </div>
        ))}
        {q.tc && (
          <>
            <div style={{ fontWeight: 800, fontSize: 13, margin: "14px 0 8px", color: "var(--navy)" }}>Terms & Conditions</div>
            <div style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
              <div><b>Taxes:</b> {q.tc.taxes}</div>
              <div><b>Freight:</b> {q.tc.freight}</div>
              <div><b>Delivery Time:</b> {q.tc.delivery}</div>
              <div><b>Payment:</b> {q.tc.payment}</div>
              <div><b>Validity:</b> {q.tc.validity}</div>
              <div><b>Billing:</b> {q.tc.billing}</div>
              {q.tc.remarks && <div><b>Remarks:</b> {q.tc.remarks}</div>}
            </div>
          </>
        )}
        {q.status === "Win" && (
          <>
            <div style={{ fontWeight: 800, fontSize: 13, margin: "14px 0 8px", color: "#059669" }}>🏆 Won</div>
            <div style={{ fontSize: 12.5 }}>{q.winSqm ? `Sq. Meter: ${q.winSqm}` : ""}</div>
            {q.winInvoice && (String(q.winInvoice).match(/\.pdf$/i) ? <button onClick={() => openAppPhoto(q.winInvoice)} style={{ marginTop: 8, background: "#eef1ff", color: "var(--navy)", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12.5 }}>📄 View Invoice PDF</button> : <img src={q.winInvoice} alt="Invoice" onClick={() => openAppPhoto(q.winInvoice)} style={{ width: "100%", borderRadius: 10, marginTop: 8, cursor: "pointer" }} />)}
          </>
        )}
      </div>
    </div>
  );
}

/* Win modal — attach Sq meter + invoice (photo/pdf), in-app open */
function QuotationWin({ q, onClose, onDone }) {
  const [sqm, setSqm] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="f-sheet-mask" onClick={onClose}>
      <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>🏆 Mark as Win — {q.quoteNo || q.id}</div>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Sq. Meter</label>
        <input inputMode="decimal" value={sqm} onChange={(e) => setSqm(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 500" style={{ width: "100%", marginBottom: 12 }} />
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Invoice (photo / PDF)</label>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0])} style={{ width: "100%", marginBottom: 14 }} />
        <button className="f-submit" style={{ width: "100%" }} disabled={busy || !sqm}
          onClick={async () => {
            setBusy(true);
            try {
              let invoiceUrl = q.winInvoice || "";
              if (file) invoiceUrl = (await api.uploadPhoto(file, "quotation")).url;
              await api.update("quotation", q._id, { ...q, status: "Win", winSqm: sqm, winInvoice: invoiceUrl });
              try { await api.create("notification", { title: "Quotation Won", message: `${q.quoteNo || q.id} marked as Win`, forRole: "Admin", link: "/admin/sfa/quotation", at: new Date().toISOString() }); } catch {}
              onDone();
            } catch (e) { alert(e.message); setBusy(false); }
          }}>Save Win</button>
      </div>
    </div>
  );
}

/* Searchable dropdown — type to filter + select */
function SearchSelect({ value, onChange, options, placeholder, disabled, getLabel }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const label = getLabel ? getLabel(value) : value;
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter((o) => (getLabel ? getLabel(o) : o).toLowerCase().includes(ql)) : options;
  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <div onClick={() => !disabled && setOpen((v) => !v)} style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #d7dcef", fontSize: 13.5, background: disabled ? "#f0f0f4" : "#fff", cursor: disabled ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: label ? "#1c2340" : "#9aa2bd" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label || placeholder}</span>
        <span>▾</span>
      </div>
      {open && !disabled && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", borderRadius: 10, boxShadow: "0 12px 30px rgba(20,25,60,.25)", zIndex: 60, maxHeight: 260, overflowY: "auto" }}>
          <div style={{ padding: 8, position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #eef1f8" }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d7dcef", fontSize: 13 }} onClick={(e) => e.stopPropagation()} />
          </div>
          {filtered.length === 0 ? <div style={{ padding: 12, color: "#9aa2bd", fontSize: 12.5 }}>No match</div>
            : filtered.map((o, i) => (
              <div key={i} onClick={() => { onChange(o); setOpen(false); setQ(""); }} style={{ padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f4f6fc" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f6fc")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                {getLabel ? getLabel(o) : o}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function FieldQuotationNew({ prefill }) {
  const nav = useNavigate();
  const edRef = useRef(undefined);
  if (edRef.current === undefined) { edRef.current = QUOTE_EDIT.data || null; QUOTE_EDIT.data = null; }   // capture once
  const ed = edRef.current;
  const pf = ed || prefill || {};
  const [f, setF] = useState({
    category: pf.category || "", partyName: pf.customer || pf.partyName || "", projectName: (pf.projects && pf.projects.length > 1) ? "" : (pf.projectName || (pf.projects || [])[0] || ""),
    address: pf.address || "", contactName: pf.contactName || "", contactNumber: pf.contactNumber || pf.mobile || "", clientEmail: pf.clientEmail || pf.email || "",
  });
  // single project -> prefill; multiple -> user selects from dropdown
  useEffect(() => {
    if (pf.projects && pf.projects.length === 1 && !f.projectName) setF((x) => ({ ...x, projectName: pf.projects[0] }));
    // eslint-disable-next-line
  }, []);
  /* item rows: grade(=product name) + thickness + colour code + rate */
  const [rows, setRows] = useState(ed?.items?.length
    ? ed.items.map((it) => ({ grade: it.grade || "", thickness: it.thickness || "", colour: it.colour || "", colourCode: it.colourCode || "", rate: String(it.rate || ""), fins: !!it.fins }))
    : [{ grade: "", thickness: "", colour: "", colourCode: "", rate: "" }]);
  const [gradeNames, setGradeNames] = useState([]);   // product names (Grade Name dropdown)
  const [colourMap, setColourMap] = useState({});      // productName -> [colour rows]
  const [tc, setTc] = useState(ed?.tc || {
    taxes: "Exclusive 18% GST", freight: "Exclusive", delivery: "15-20 days",
    payment: "100% advance", validity: "3 days", billing: "Billing will be in Sq. Mt.", remarks: "",
  });
  const [busy, setBusy] = useState(false);

  /* product master: grade names (product names) */
  useEffect(() => {
    api.productNames && api.productNames().then((d) => setGradeNames(d.names || [])).catch(() => {});
  }, []);
  /* grade select -> load its colour codes (cascade like state->areas) */
  const loadColours = async (name) => {
    if (!name || colourMap[name]) return;
    try { const d = await api.productsByName(name); setColourMap((m) => ({ ...m, [name]: d.rows || [] })); } catch {}
  };
  useEffect(() => { rows.forEach((r) => r.grade && loadColours(r.grade)); /* eslint-disable-next-line */ }, [gradeNames.length]);

  const inp = { width: "100%", marginBottom: 12 };
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <>
      <ScreenHead title={ed ? "Edit Quotation" : "New Quotation"} />
      <div className="f-form">
        {pf.customer && <div style={{ background: "#e8f7ee", color: "#1f7a44", fontSize: 12, padding: "8px 10px", borderRadius: 8, marginBottom: 12 }}>✓ Details carried from customer</div>}

        <label>Firm Name <b>*</b></label>
        <input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} style={inp} />
        <label>Project Name</label>
        {(pf.projects && pf.projects.length > 1)
          ? <select value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} style={inp}>
              <option value="">— Select project —</option>
              {pf.projects.map((p, i) => <option key={i} value={p}>{p}</option>)}
            </select>
          : <input value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} style={inp} />}
        <label>Address</label>
        <textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} style={inp} />
        <label>Contact Name</label>
        <input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} style={inp} />
        <label>Contact Number</label>
        <input inputMode="numeric" value={f.contactNumber} onChange={(e) => setF({ ...f, contactNumber: e.target.value.replace(/\D/g, "") })} style={inp} />
        <label>Mail ID</label>
        <input type="email" value={f.clientEmail || ""} onChange={(e) => setF({ ...f, clientEmail: e.target.value })} style={inp} />

        {/* ---- Items: multiple grade+colour items (searchable) + Running Feet rates ---- */}
        <div style={{ fontWeight: 800, fontSize: 13.5, margin: "8px 0 10px", color: "var(--navy)" }}>Items</div>
        {rows.map((r, i) => {
          const colours = colourMap[r.grade] || [];
          const isFins = r.fins;
          return (
          <div key={i} style={{ background: "#f7f9ff", borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{isFins ? "Running Feet Rate" : `Item ${rows.slice(0, i + 1).filter((x) => !x.fins).length}`}</span>
              {rows.length > 1 && <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#c03636", fontWeight: 700, fontSize: 12 }}>Remove</button>}
            </div>
            {/* grade item -> searchable grade + colour cascade + rate (formula). Running Feet -> only rate */}
            {!isFins && (
              <>
                <label style={{ fontSize: 12 }}>Grade Name (Product)</label>
                <SearchSelect
                  value={r.grade}
                  placeholder="— Search & select grade —"
                  options={gradeNames}
                  onChange={(g) => { setRow(i, "grade", g); setRow(i, "colour", ""); setRow(i, "colourCode", ""); setRow(i, "thickness", ""); loadColours(g); }}
                />
                <label style={{ fontSize: 12 }}>Colour Code</label>
                <SearchSelect
                  value={r.colourCode ? { code: r.colourCode, colour: r.colour } : null}
                  placeholder={r.grade ? "— Search & select colour —" : "Select grade first"}
                  disabled={!r.grade}
                  options={colours}
                  getLabel={(c) => c ? `${c.code} · ${c.colour}` : ""}
                  onChange={(c) => { setRow(i, "colourCode", c.code); setRow(i, "colour", c.colour); setRow(i, "thickness", c.thickness || ""); }}
                />
                {r.thickness && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Thickness: {r.thickness}</div>}
              </>
            )}
            <label style={{ fontSize: 12 }}>Rate (per sq ft ₹)</label>
            <input inputMode="decimal" value={r.rate} onChange={(e) => setRow(i, "rate", e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 350" style={{ width: "100%" }} />
            {!isFins && r.rate && (
              <div style={{ fontSize: 11.5, color: "#1f7a44", marginTop: 6, fontWeight: 700 }}>
                = ₹{(Number(r.rate) * 10.764).toFixed(2)} / sq.mtr <span style={{ color: "var(--muted)", fontWeight: 500 }}>(auto — Rate × 10.764)</span>
              </div>
            )}
            {isFins && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Running Feet Rate — flat, no formula</div>}
          </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={() => setRows((rs) => [...rs, { grade: "", thickness: "", colour: "", colourCode: "", rate: "" }])} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px dashed var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 12.5 }}>
            ➕ Add Grade Item
          </button>
          <button type="button" onClick={() => setRows((rs) => [...rs, { grade: "", thickness: "", colour: "", colourCode: "", rate: "", fins: true }])} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px dashed #8b7cc8", background: "#fff", color: "#6c5ce7", fontWeight: 700, fontSize: 12.5 }}>
            ➕ Running Feet Rate
          </button>
        </div>

        {/* ---- Terms & Conditions ---- */}
        <div style={{ fontWeight: 800, fontSize: 13.5, margin: "6px 0 10px", color: "var(--navy)" }}>Terms & Conditions</div>
        <label>Taxes</label>
        <select value={tc.taxes} onChange={(e) => setTc({ ...tc, taxes: e.target.value })} style={inp}>
          <option>Exclusive 18% GST</option><option>Inclusive 18% GST</option>
        </select>
        <label>Freight</label>
        <select value={tc.freight} onChange={(e) => setTc({ ...tc, freight: e.target.value })} style={inp}>
          <option>Exclusive</option><option>Inclusive</option>
        </select>
        <label>Delivery Time</label>
        <input value={tc.delivery} onChange={(e) => setTc({ ...tc, delivery: e.target.value })} style={inp} />
        <label>Payment</label>
        <input value={tc.payment} onChange={(e) => setTc({ ...tc, payment: e.target.value })} style={inp} />
        <label>Validity</label>
        <input value={tc.validity} onChange={(e) => setTc({ ...tc, validity: e.target.value })} style={inp} />
        <label>Billing</label>
        <input value={tc.billing} disabled style={{ ...inp, background: "#f1f3f8", color: "var(--muted)" }} />
        <label>Remarks</label>
        <textarea rows={2} value={tc.remarks} onChange={(e) => setTc({ ...tc, remarks: e.target.value })} style={inp} />

        <button className="f-submit" style={{ width: "100%" }}
          disabled={!f.partyName || !rows.some((r) => r.rate) || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const items = rows.filter((r) => r.rate).map((r) => (
                !r.fins
                  ? { grade: r.grade, colour: r.colour, colourCode: r.colourCode, thickness: r.thickness, rate: Number(r.rate), ratePerSqm: +(Number(r.rate) * 10.764).toFixed(2) }
                  : { grade: r.grade, colour: r.colour, colourCode: r.colourCode, thickness: r.thickness, rate: Number(r.rate), fins: true }   // Running Feet — no formula
              ));
              if (ed) {
                /* EDIT — number increment: EP/08/160/26-27 -> .1 -> .2 */
                const base = ed.baseNo || ed.quoteNo || ed.id;
                const editCount = (ed.editCount || 0) + 1;
                const m = String(base).match(/^(EP\/\d+\/\d+)(\/.*)$/);
                const newNo = m ? `${m[1]}.${editCount}${m[2]}` : `${base}.${editCount}`;
                await api.update("quotation", ed._id, {
                  ...ed, ...f, customer: f.partyName, mobile: f.contactNumber,
                  items, grade: items[0]?.grade, colour: items[0]?.colour, rate: items[0]?.rate,
                  tc, quoteNo: newNo, baseNo: base, editCount,
                });
                try { await api.create("notification", { title: "Quotation Updated", message: `${CU().name} updated quotation ${newNo}`, forRole: "Admin", link: "/admin/sfa/quotation", at: new Date().toISOString() }); } catch {}
              } else {
                const quoteNo = await nextQuoteNo();
                await api.create("quotation", {
                  id: quoteNo, quoteNo, baseNo: quoteNo, editCount: 0,
                  ...f, customer: f.partyName, mobile: f.contactNumber,
                  items, grade: items[0]?.grade, colour: items[0]?.colour, rate: items[0]?.rate,
                  tc, status: "Pending",
                  createdBy: CU().name, createdById: CU().id, createdByPhone: CU().mobile || CU().phone || "",
                  createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                });
                try { await api.create("notification", { title: "New Quotation", message: `${CU().name} created quotation ${quoteNo} for ${f.partyName}`, forRole: "Admin", link: "/admin/sfa/quotation", at: new Date().toISOString() }); } catch {}
                /* mail notification to sales1@eurobondacp.com */
                try { await api.sendMail({ to: "sales1@eurobondacp.com", from: "sales1@eurobondacp.com", subject: `New Quotation ${quoteNo} created`, body: `${CU().name} created quotation ${quoteNo} for ${f.partyName}.\n\nProject: ${f.projectName || "-"}\nContact: ${f.contactName || "-"} ${f.contactNumber || ""}\n\nPlease review in the CRM admin panel.` }); } catch {}
              }
              nav("/app/m/quotation");
            } catch (e) { alert(e.message); setBusy(false); }
          }}>
          {ed ? "Update Quotation" : "Save Quotation"}
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
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [myLoc, setMyLoc] = useState(null);
  const [viewCust, setViewCust] = useState(null);
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
      /* each field user sees only the customers THEY added */
      api.customers(q.trim(), true).then((d) => setRows(d.customers || [])).catch(() => setRows([]));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const list = useMemo(() => {
    if (!rows) return null;
    let base = rows;
    if (!nearbyOnly) return base;
    if (!myLoc || myLoc === "denied") return base;
    return base
      .map((r) => ({ ...r, dist: r.lat && r.lng ? haversineKm(myLoc, { lat: Number(r.lat), lng: Number(r.lng) }) : null }))
      .filter((r) => r.dist != null && r.dist * 1000 <= rangeM)
      .sort((a, b) => a.dist - b.dist);
  }, [rows, myLoc, nearbyOnly, rangeM]);

  return (
    <>
      <ScreenHead title={nearbyOnly ? "Near By Customers" : "Customers"} />
      <div className="f-list-pad" style={{ paddingTop: 12 }}>
        {!nearbyOnly && (
          <button onClick={() => nav("/app/followup/new")}
            style={{ width: "100%", marginBottom: 12, padding: "13px", borderRadius: 12, border: "none", background: "var(--navy)", color: "#fff", fontWeight: 800, fontSize: 14.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 8px 20px rgba(11,60,140,.3)" }}>
            <Plus size={18} /> Add New
          </button>
        )}
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
          <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 7, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
              <span>{r.name}</span>
              {r.dist != null && <span style={{ color: "var(--accent)", fontSize: 11.5 }}>{fmtKm(r.dist)}</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2, alignItems: "center" }}>
              {r.type && <span style={{ fontSize: 10.5, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, padding: "1px 7px", borderRadius: 6 }}>{r.type}</span>}
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{r.followups} follow-up{r.followups > 1 ? "s" : ""}</span>
              {(r.place || r.address) && <span style={{ fontSize: 11, color: "var(--muted)" }}>📍 {r.place || r.address}</span>}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
              {r.mobile && <button onClick={() => (window.location.href = `tel:${r.mobile}`)} style={{ ...actBtn("#1f9d55"), padding: "6px 8px", fontSize: 11 }}>📞</button>}
              {r.mobile && <button onClick={() => window.open(`https://wa.me/91${r.mobile}`, "_blank")} style={{ ...actBtn("#25d366"), padding: "6px 8px", fontSize: 11 }}>💬</button>}
              <button onClick={() => setViewCust(r)} style={{ ...actBtn("#3949ab"), background: "#eef1ff", color: "#3949ab", padding: "6px 8px", fontSize: 11 }}>👁 View</button>
              <button onClick={() => { CUST_EDIT.data = r; nav("/app/customer/edit"); }} style={{ ...actBtn("#f59e0b"), background: "#fef3e2", color: "#c07f00", padding: "6px 8px", fontSize: 11 }}>✎ Edit</button>
              <button onClick={() => { QUOTE_PREFILL.data = { customer: r.name, partyName: r.name, contactName: r.contactName || r.name, contactNumber: r.mobile, mobile: r.mobile, email: r.email, clientEmail: r.email, address: r.address || r.place, category: r.category, projects: r.projects || (r.projectName ? String(r.projectName).split(",").map((x) => x.trim()).filter(Boolean) : []), type: r.type }; nav("/app/m/quotation/new"); }} style={{ ...actBtn("#0b3c8c"), background: "#e8f0ff", color: "#0b3c8c", padding: "6px 8px", fontSize: 11 }}>📄 Quote</button>
            </div>
          </div>
        ))}
      </div>
      {viewCust && (
        <div className="f-sheet-mask" onClick={() => setViewCust(null)}>
          <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>{viewCust.name}</div>
            <div style={{ display: "grid", gap: 7, fontSize: 13 }}>
              {viewCust.category && <div><b>Category:</b> {viewCust.category}</div>}
              {viewCust.mobile && <div><b>Mobile:</b> {viewCust.mobile}</div>}
              {(viewCust.projectName || (viewCust.projects && viewCust.projects.length)) && <div><b>Projects:</b> {viewCust.projectName || (viewCust.projects || []).join(", ")}</div>}
              {viewCust.address && <div><b>Address:</b> {viewCust.address}</div>}
              {Array.isArray(viewCust.contacts) && viewCust.contacts.length > 0 && (
                <div><b>Contacts:</b> {viewCust.contacts.map((c) => `${c.name || ""} (${c.mobile || ""})`).join(", ")}</div>
              )}
              {viewCust.by && <div><b>Created By:</b> {viewCust.by}</div>}
            </div>

            {/* Quotations for this customer */}
            <CustomerQuotations customer={viewCust} />

            {Array.isArray(viewCust.updates) && viewCust.updates.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>📋 Follow-up History</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {viewCust.updates.slice().reverse().map((u, i) => (
                    <div key={i} style={{ borderLeft: "3px solid var(--accent)", background: "#f6f8fd", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <b>{u.type || "Visit"}</b>
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>{u.date || (u.at ? String(u.at).slice(0, 10) : "")}</span>
                      </div>
                      {u.remark && <div style={{ fontSize: 11.5, color: "var(--ink)", marginTop: 2 }}>{u.remark}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => { FOLLOWUP_QUICK.data = { name: viewCust.name, mobile: viewCust.mobile, category: viewCust.category, address: viewCust.address, contactName: viewCust.contactName, projects: viewCust.projects, contacts: viewCust.contacts, existing: viewCust }; setViewCust(null); nav("/app/followup/quick"); }} style={{ flex: 1, ...actBtn("#1f9d55") }}>➕ Follow Up</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Customer quotations list (with quotation numbers) in View modal */
function CustomerQuotations({ customer }) {
  const [quotes, setQuotes] = useState(null);
  useEffect(() => {
    api.list("quotation", false).then((d) => {
      const all = (d.records || []).map((r) => ({ _id: r.id, ...r.data }));
      const mine = all.filter((q) => (q.customer === customer.name) || (q.partyName === customer.name) || (customer.mobile && q.mobile === customer.mobile));
      setQuotes(mine);
    }).catch(() => setQuotes([]));
  }, [customer]);

  if (!quotes || quotes.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>📄 Quotations ({quotes.length})</div>
      <div style={{ display: "grid", gap: 8 }}>
        {quotes.map((q, i) => (
          <div key={i} style={{ borderLeft: "3px solid #10b981", background: "#e5f9f1", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <b>{q.quoteNo || q.number || q.id || "Quotation"}</b>
              <span style={{ color: q.status === "Win" ? "#059669" : "#c07f00", fontSize: 11, fontWeight: 800 }}>{q.status || "Pending"}</span>
            </div>
            {(q.grade || q.value || q.rate) && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{q.grade || ""} {q.rate ? "· ₹" + q.rate + "/sqft" : ""}</div>}
          </div>
        ))}
      </div>
    </div>
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
  const [showFollowup, setShowFollowup] = useState(false);

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
                ? <span key={i} onClick={() => openAppPhoto(u)} style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>📄 Attachment</span>
                : <img key={i} src={u} alt="" onClick={() => openAppPhoto(u)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #dfe4f0", cursor: "pointer" }} />
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
              <button onClick={() => setShowFollowup(true)} style={{ width: "100%", marginTop: 8, padding: "9px", borderRadius: 9, border: "1px solid var(--accent)", background: "#eef1ff", color: "var(--accent)", fontWeight: 700, fontSize: 12.5 }}>
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
                  ? <span onClick={() => openAppPhoto(m.doc)} style={{ display: "block", marginTop: 5, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📄 View PDF</span>
                  : <img src={m.doc} alt="" onClick={() => openAppPhoto(m.doc)} style={{ maxWidth: 160, borderRadius: 8, display: "block", marginTop: 5, cursor: "pointer" }} />)}
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
      {showFollowup && (
        <MonthlyFollowupModal
          onClose={() => setShowFollowup(false)}
          onSave={async ({ date, remark, photoUrl }) => {
            const month = new Date(date).toLocaleString("en-IN", { month: "short", year: "numeric" });
            const data = { ...rec }; delete data._id;
            data.lastUpdate = `${month}: follow-up`;
            data.monthlyUpdates = [...(rec.monthlyUpdates || []), { month, date, remark, photo: photoUrl || "", by: CU().name, at: new Date().toLocaleString("en-IN") }];
            /* project photos: first photo + prati follow-up photo accumulate (backend lo kuda) */
            if (photoUrl) data.photos = [...(Array.isArray(rec.photos) ? rec.photos : (rec.photo ? [rec.photo] : [])), photoUrl];
            data.thread = [...(rec.thread || []), { by: CU().name, text: `📅 Follow-up (${month}): ${remark}`, doc: photoUrl || "", at: new Date().toLocaleString("en-IN") }];
            try { await api.update(mod, id, data); setRec({ ...rec, ...data, _id: rec._id }); setShowFollowup(false); } catch (e) { alert(e.message); }
          }}
        />
      )}
    </>
  );
}

function MonthlyFollowupModal({ onClose, onSave }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [upBusy, setUpBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const doUpload = async (file) => {
    if (!file) return;
    setUpBusy(true);
    try { const r = await api.uploadPhoto(file, "projectProjection"); setPhotoUrl(r.url); }
    catch (e) { alert("Upload failed: " + e.message); }
    setUpBusy(false);
  };
  return (
    <div className="f-sheet-mask" onClick={onClose}>
      <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Monthly Follow-up</div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #d7dcef", marginBottom: 10 }} />
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Remark (min 50 chars)</label>
        <textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What happened this month…" style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #d7dcef", marginBottom: 4 }} />
        <div style={{ fontSize: 11, color: remark.length >= 50 ? "#1f9d55" : "var(--muted)", marginBottom: 10 }}>{remark.length}/50</div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Attachment (photo)</label>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => doUpload(e.target.files[0])} style={{ marginBottom: 6, width: "100%" }} />
        {upBusy && <div style={{ fontSize: 12, color: "var(--muted)" }}>Uploading…</div>}
        {photoUrl && <img src={photoUrl} alt="" style={{ width: "100%", borderRadius: 10, marginBottom: 8 }} />}
        <button className="f-submit" style={{ width: "100%", marginTop: 8 }} disabled={remark.length < 50 || busy || upBusy}
          onClick={async () => { setBusy(true); await onSave({ date, remark, photoUrl }); setBusy(false); }}>
          {busy ? "Saving…" : "Save Follow-up"}
        </button>
      </div>
    </div>
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
/* Plan editor — login tarvat areas add/remove + Local<->Tour switch. Admin lo reflect avutundi. */
function PlanEditor({ session, sessionId }) {
  /* type can be: Local | ExStation | Outstation (Tour = ExStation/Outstation) */
  const initType = session?.visit_type || "Local";
  const [type, setType] = useState(initType);
  const [areas, setAreas] = useState(() => {
    const vn = session?.visit_name;
    return vn && typeof vn === "string" ? vn.split(",").map((x) => x.trim()).filter(Boolean) : [];
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);   // read-only until user taps Edit

  /* prefill from login plan when session data arrives (only if not edited yet) */
  useEffect(() => {
    if (dirty) return;
    if (session?.visit_type) setType(session.visit_type);
    const vn = session?.visit_name;
    if (vn && typeof vn === "string") setAreas(vn.split(",").map((x) => x.trim()).filter(Boolean));
    // eslint-disable-next-line
  }, [session?.visit_type, session?.visit_name]);

  const isTour = type === "ExStation" || type === "Outstation";

  const save = async () => {
    if (!sessionId) { alert("Attendance not started yet."); return; }
    setSaving(true); setSaved(false);
    try {
      await api.attUpdateVisit(sessionId, type, areas.join(", "));
      setSaved(true); setDirty(false); setEditing(false); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert("Could not update: " + e.message); }
    setSaving(false);
  };
  const addArea = (v) => { if (v && v.name && !areas.includes(v.name)) { setAreas([...areas, v.name]); setDirty(true); } };
  const removeArea = (i) => { setAreas(areas.filter((_, j) => j !== i)); setDirty(true); };
  const pickType = (t) => { setType(t); setDirty(true); };

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "14px 15px", marginTop: 10, boxShadow: "var(--shadow)", border: "1.5px solid #eef1ff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 13.5, color: "var(--navy)" }}>📋 Plan / Areas</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saved && <span style={{ fontSize: 11, color: "#1f9d55", fontWeight: 700 }}>✓ Saved</span>}
          {!editing && (
            <button onClick={() => setEditing(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#eef1ff", border: "none", color: "var(--navy)", fontWeight: 700, fontSize: 12, padding: "6px 11px", borderRadius: 8, cursor: "pointer" }}>
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
      </div>

      {!editing ? (
        /* read-only summary */
        <div>
          <div style={{ fontSize: 12.5, marginBottom: 8 }}><b style={{ color: "var(--muted)" }}>Type:</b> {isTour ? (type === "Outstation" ? "Outstation (Tour)" : "ExStation (Tour)") : "Local"}</div>
          <div style={{ fontSize: 12.5 }}><b style={{ color: "var(--muted)" }}>Areas:</b></div>
          {areas.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {areas.map((a, i) => <span key={i} style={{ background: "#eef1ff", color: "var(--navy)", borderRadius: 20, padding: "5px 10px", fontSize: 12.5, fontWeight: 700 }}>📍 {a}</span>)}
            </div>
          ) : <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>No areas set. Tap Edit to add.</div>}
        </div>
      ) : (
      <>
      {/* Local / Tour switch */}
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>Type</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {["Local", "Tour"].map((t) => {
          const active = t === "Local" ? type === "Local" : isTour;
          return (
            <button key={t} onClick={() => pickType(t === "Local" ? "Local" : "ExStation")}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: active ? "2px solid var(--navy)" : "1.5px solid #d7dcef", background: active ? "#eef1ff" : "#fff", fontWeight: 700, fontSize: 12.5, color: active ? "var(--navy)" : "var(--muted)" }}>
              {t}
            </button>
          );
        })}
      </div>

      {/* Tour sub-type: ExStation / Outstation */}
      {isTour && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["ExStation", "Outstation"].map((t) => (
            <button key={t} onClick={() => pickType(t)}
              style={{ flex: 1, padding: "8px", borderRadius: 10, border: type === t ? "2px solid #8b5cf6" : "1.5px solid #d7dcef", background: type === t ? "#f1ebff" : "#fff", fontWeight: 700, fontSize: 12, color: type === t ? "#7c3aed" : "var(--muted)" }}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* area chips */}
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 6 }}>Areas</label>
      {areas.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {areas.map((a, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef1ff", color: "var(--navy)", borderRadius: 20, padding: "5px 10px", fontSize: 12.5, fontWeight: 700 }}>
              📍 {a}
              <span onClick={() => removeArea(i)} style={{ cursor: "pointer", color: "#d64545", fontWeight: 800 }}>✕</span>
            </span>
          ))}
        </div>
      )}
      <LocationPicker value="" onPick={addArea} addMode />

      <button onClick={save} disabled={saving || !dirty}
        style={{ width: "100%", marginTop: 12, padding: "12px", borderRadius: 11, border: "none", background: dirty ? "var(--navy)" : "#c5cbd8", color: "#fff", fontWeight: 800, fontSize: 14, cursor: dirty ? "pointer" : "default" }}>
        {saving ? "Saving…" : dirty ? "Save Plan" : "Saved"}
      </button>
      <button onClick={() => setEditing(false)} style={{ width: "100%", marginTop: 8, padding: "10px", borderRadius: 11, border: "1.5px solid #d7dcef", background: "#fff", color: "var(--muted)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
        Cancel
      </button>
      </>
      )}
    </div>
  );
}

function LocationPicker({ value, onPick, addMode }) {
  const userState = CU().state || "";
  const [q, setQ] = useState(value || "");
  const [areas, setAreas] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const toTitle = (t) => t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  /* user state areas load (once) */
  useEffect(() => {
    if (!userState) return;
    setLoading(true);
    api.areasByState(userState).then((d) => setAreas(d.areas || [])).catch(() => setAreas([])).finally(() => setLoading(false));
  }, [userState]);

  const filtered = q.trim()
    ? areas.filter((a) => String(a || "").toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)
    : areas.slice(0, 30);
  const exactMatch = areas.some((a) => String(a || "").toLowerCase() === q.trim().toLowerCase());

  const pick = (name) => {
    onPick({ name });
    if (addMode) { setQ(""); setOpen(false); } else { setQ(name); setOpen(false); }
  };
  const addNew = async () => {
    const name = toTitle(q.trim());
    if (!name || !userState) return;
    try { await api.areaAdd(userState, name); setAreas((a) => [...a, name]); } catch {}
    pick(name);
  };

  return (
    <div style={{ marginBottom: 14, position: "relative" }}>
      {userState && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>
          State: <b style={{ color: "var(--navy)" }}>{userState}</b> · {loading ? "loading areas…" : `${areas.length} areas`}
        </div>
      )}
      <input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => { const v = e.target.value; setQ(v); setOpen(true); if (!addMode) onPick(v.trim() ? { name: toTitle(v.trim()) } : null); }}
        placeholder={userState ? `Search area in ${userState}…` : "Enter area / city name"}
        style={{ width: "100%", padding: "12px", borderRadius: 11, border: value ? "2px solid #1f9d55" : "1.5px solid #d7dcef", fontSize: 15 }}
      />
      {open && userState && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d7dcef", borderRadius: 11, marginTop: 4, maxHeight: 220, overflowY: "auto", zIndex: 20, boxShadow: "0 8px 24px rgba(40,50,100,.18)" }}>
          {filtered.map((a) => (
            <div key={a} onClick={() => pick(a)}
              style={{ padding: "10px 13px", fontSize: 14, cursor: "pointer", borderBottom: "1px solid #f0f2f9" }}
              onMouseDown={(e) => e.preventDefault()}>
              📍 {a}
            </div>
          ))}
          {q.trim() && !exactMatch && (
            <div onClick={addNew} onMouseDown={(e) => e.preventDefault()}
              style={{ padding: "10px 13px", fontSize: 13.5, cursor: "pointer", color: "var(--accent)", fontWeight: 700, background: "#f6f8fd" }}>
              ➕ Add "{toTitle(q.trim())}" to {userState}
            </div>
          )}
          {filtered.length === 0 && !q.trim() && <div style={{ padding: 12, fontSize: 12.5, color: "var(--muted)" }}>Type to search…</div>}
        </div>
      )}
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
  const [locs, setLocs] = useState([]);   // multiple areas (login lo + tho)
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

  const ready = (!needLocation || locs.length > 0) && (!needSelfie || selfie) && (!needReading || reading);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr("");
    try {
      const up = async (p) => (await api.uploadPhoto(p.file, "attendance")).url;
      const selfieUrl = selfie ? await up(selfie) : "";
      const readingUrl = reading ? await up(reading) : "";
      onDone({
        type: isStop ? undefined : (type === "Tour" ? subType : type),
        name: isStop ? undefined : (effType === "WFH" ? "Work From Home" : (locs.length ? locs.map((l) => l.name).join(", ") : (loc ? loc.name : ""))),
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
              {type === "Local" ? "Local Areas / Cities" : "Tour Places"} <b style={{ color: "#d64545" }}>*</b>
              <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 11.5 }}> (add multiple)</span>
            </label>
            {/* selected area chips */}
            {locs.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {locs.map((l, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#eef1ff", color: "var(--navy)", borderRadius: 20, padding: "5px 10px", fontSize: 12.5, fontWeight: 700 }}>
                    📍 {l.name}
                    <span onClick={() => setLocs(locs.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "#d64545", fontWeight: 800 }}>✕</span>
                  </span>
                ))}
              </div>
            )}
            <LocationPicker value="" onPick={(v) => { if (v && v.name && !locs.some((l) => l.name === v.name)) { setLocs([...locs, v]); setLoc(v); } }} addMode />
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
/* In-app photo/PDF viewer — zoom, pan, right-side info. Verey link kaadu, CRM lo open. */
function AppPhotoViewer() {
  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [info, setInfo] = useState(false);
  useEffect(() => {
    const h = (e) => { setUrl(e.detail); setZoom(1); setInfo(false); };
    window.addEventListener("app-photo", h);
    return () => window.removeEventListener("app-photo", h);
  }, []);
  if (!url) return null;
  const isPdf = String(url).match(/\.pdf$/i);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 4000, display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", gap: 10 }}>
        <button onClick={() => setUrl(null)} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 38, height: 38, borderRadius: "50%", fontSize: 20, cursor: "pointer" }}>×</button>
        {!isPdf && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 38, height: 38, borderRadius: "50%", fontSize: 20, cursor: "pointer" }}>−</button>
            <span style={{ color: "#fff", fontSize: 12, minWidth: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(5, z + 0.5))} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 38, height: 38, borderRadius: "50%", fontSize: 20, cursor: "pointer" }}>+</button>
          </div>
        )}
        <button onClick={() => setInfo((v) => !v)} title="Info" style={{ background: info ? "#4285F4" : "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 38, height: 38, borderRadius: "50%", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>ⓘ</button>
      </div>
      {/* content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto", display: "grid", placeItems: "center", padding: 12 }}>
          {isPdf
            ? <iframe src={url} title="Attachment" style={{ width: "100%", height: "100%", minHeight: "70vh", border: "none", borderRadius: 8, background: "#fff" }} />
            : <img src={url} alt="attachment" style={{ maxWidth: "100%", transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform .15s", borderRadius: 8 }} />}
        </div>
        {/* right-side info panel */}
        {info && (
          <div style={{ width: 240, background: "rgba(255,255,255,.08)", color: "#fff", padding: 16, fontSize: 12.5, overflowY: "auto" }}>
            <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}>Attachment Info</div>
            <div style={{ color: "#bbb", marginBottom: 6 }}>Type</div>
            <div style={{ marginBottom: 12 }}>{isPdf ? "PDF Document" : "Image"}</div>
            <div style={{ color: "#bbb", marginBottom: 6 }}>File</div>
            <div style={{ marginBottom: 12, wordBreak: "break-all" }}>{String(url).split("/").pop()}</div>
            <a href={url} download style={{ display: "inline-block", background: "#4285F4", color: "#fff", padding: "8px 14px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>⬇ Download</a>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const todayKey = () => new Date().toLocaleDateString("en-CA");   // YYYY-MM-DD local (IST)
  useEffect(() => { localStorage.removeItem("eb_att_done"); }, []);   // clear stale lock from old versions
  const [doneToday, setDoneToday] = useState(false);

  /* On app open: proactively ask for Notification + Location permissions (like on first install).
     Runs every launch until granted, so the notification + background GPS can work. */
  useEffect(() => {
    (async () => {
      try {
        const Cap = window.Capacitor;
        if (!Cap || !Cap.Plugins) return;
        const LN = Cap.Plugins.LocalNotifications;
        if (LN) {
          try {
            const st = await LN.checkPermissions();
            if (!st || st.display !== "granted") await LN.requestPermissions();
          } catch { try { await LN.requestPermissions(); } catch {} }
          /* make sure the channel the tracking notification uses exists */
          try { if (LN.createChannel) await LN.createChannel({ id: "eurobond_crm", name: "Eurobond CRM", description: "CRM alerts", importance: 5, visibility: 1 }); } catch {}
        }
        const BG = Cap.Plugins.BackgroundGeolocation;
        /* background geolocation asks for "always" location itself when the watcher starts;
           also nudge the Geolocation permission so the OS prompt appears early */
        const Geo = Cap.Plugins.Geolocation;
        if (Geo && Geo.requestPermissions) { try { await Geo.requestPermissions(); } catch {} }
      } catch {}
    })();
  }, []);

  /* SERVER is the source of truth for attendance state (localStorage lock removed —
     adi stale ga undi false "completed" chupinchedi).
     - today's session RUNNING -> ON state (only Logout)
     - today's session DONE    -> completed for today (malli login raadu AA ROJU ki)
     - no session today         -> fresh, login option available (kotha roju) */
  useEffect(() => {
    if (!authed) return;
    api.attToday().then((d) => {
      const s = d.session;
      if (s && s.status === "RUNNING") {
        sessionRef.current = Number(s.id);
        todaySessionRef.current = s;
        if (s.start_time) {
          const st = new Date(s.start_time.replace(" ", "T")).getTime();
          setTracking((t) => ({ ...t, startedAt: t.startedAt || st, stoppedAt: null }));
        }
        if (!attendanceOn) { resumeRef.current = true; setAttendanceOn(true); }
        setDoneToday(false);
      } else if (s && s.status === "DONE") {
        todaySessionRef.current = s;   // end_time etc. for Details display
        setDoneToday(true);       // aa roju logout ayindi
      } else {
        setDoneToday(false);      // no session today -> fresh login available
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
  const restartHandlerRef = useRef(null);
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
  const reloadExpenses = () => api.list("expense", true).then((d) => setExpenses((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});
  useEffect(() => {
    if (!authed) return;
    const loadLists = () => {
      reloadExpenses();
      api.list("leave", true).then((d) => setLeaves((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});
      api.list("followup", true).then((d) => setFollowups((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});
    };
    loadLists();
    const onVis = () => { if (document.visibilityState === "visible") loadLists(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", loadLists);
    /* Capacitor native: fires when app returns to foreground */
    let capListener = null;
    let backListener = null;
    try {
      const Cap = window.Capacitor;
      if (Cap && Cap.Plugins && Cap.Plugins.App) {
        const r1 = Cap.Plugins.App.addListener("appStateChange", (state) => {
          if (state && state.isActive) {
            loadLists();
            api.me().then((usr) => { if (usr && (usr.name || usr.mobile)) auth.user = { ...auth.user, ...usr }; }).catch(() => {});
            /* WATCHDOG: attendance should be running but the tracker died (e.g. user swiped
               the notification / OS killed the service) → restart it so GPS resumes. */
            if (localStorage.getItem("eb_att_on") === "1" && !isTrackerActive()) {
              try { window.dispatchEvent(new Event("eb-restart-tracking")); } catch {}
            }
          }
        });
        if (r1 && typeof r1.then === "function") r1.then((h) => { capListener = h; }).catch(() => {}); else capListener = r1;
        /* Hardware BACK button: ALWAYS minimize the app (send to background / home screen)
           instead of navigating back or exiting. This keeps the foreground service +
           GPS tracking alive. The app is never destroyed by Back. */
        const r2 = Cap.Plugins.App.addListener("backButton", () => {
          try { Cap.Plugins.App.minimizeApp(); } catch { try { Cap.Plugins.App.exitApp(); } catch {} }
        });
        if (r2 && typeof r2.then === "function") r2.then((h) => { backListener = h; }).catch(() => {}); else backListener = r2;
      }
    } catch {}

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

    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", loadLists); if (capListener && capListener.remove) capListener.remove(); if (backListener && backListener.remove) backListener.remove(); clearInterval(notifTimer); };
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
        setTrackerSession(sessionRef.current, (loadGpsCfg().intervalSec ?? 900) * 1000, api.attPoints);
        api.attPointsList && api.attPointsList(sessionRef.current)
          .then((d) => { if (!cancelled && d && d.points) setTracking((t) => ({ ...t, points: d.points, km: d.km || t.km })); })
          .catch(() => {});
        resumeRef.current = false;
      } else {
        // fresh start -> get current location, then create server session with it
        const startWith = (coords) => {
          api.attStart({ ...visitInfoRef.current, ...coords })
            .then((d) => { if (!cancelled) { sessionRef.current = d.session_id; localStorage.setItem("eb_att_on", "1"); setTrackerSession(d.session_id, (loadGpsCfg().intervalSec ?? 900) * 1000, api.attPoints); } })
            .catch((e) => setTracking((t) => ({ ...t, error: e.message })));
        };
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => startWith({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => startWith({}),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
          );
        } else startWith({});
      }

      /* UI-only handler: updates the on-screen map/km. The persistent tracker
         itself saves points to the server (works even when this screen is closed). */
      const handlePoint = (p) => {
          lastPointAt.current = Date.now();
          trackingErrorRef.current = "";
          setGpsAlarm(false);
          if (p.accuracy != null && p.accuracy > 60) return;
          setTracking((t) => {
            const points = [...t.points, p];
            return { ...t, points, km: totalDistanceKm(points) };
          });
      };
      const handleErr = (err) => {
          trackingErrorRef.current = err.message || "Location error";
          setTracking((t) => ({ ...t, error: err.message || "Location error" }));
      };
      if (isTrackerActive()) {
        setTrackerHandler(handlePoint);          // already running (screen re-opened) → just re-point
      } else {
        startTracker(handlePoint, handleErr);    // first start → launch native background watcher
        /* the background-geolocation watcher shows its own "Tracking on" foreground
           notification — no separate LocalNotification needed (avoids a duplicate). */
      }
      /* watchdog: if the OS killed the tracker (notification swiped), restart it on resume */
      restartHandlerRef.current = () => { if (!isTrackerActive()) { startTracker(handlePoint, handleErr); if (sessionRef.current) setTrackerSession(sessionRef.current, (loadGpsCfg().intervalSec ?? 900) * 1000, api.attPoints); } };
      window.addEventListener("eb-restart-tracking", restartHandlerRef.current);
      stopRef.current = null;                     // stopping handled via stopTracker() on OFF

      /* Reliable capture+upload: fire ONCE immediately (so the server always has a
         point right after Start), then every 15 minutes. Foreground backup to the
         native background watcher. */
      const captureAndSave = () => {
        if (!sessionRef.current || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, time: Date.now(), t: Date.now(), online: navigator.onLine, battery: batteryRef.current };
            /* attach a full address so admin/app show it without re-geocoding */
            placeName(pos.coords.latitude, pos.coords.longitude).then((addr) => { p.address = addr; api.attPoints(sessionRef.current, [p]).catch(() => {}); }).catch(() => { api.attPoints(sessionRef.current, [p]).catch(() => {}); });
            setTracking((t) => { const points = [...t.points, p]; return { ...t, points, km: totalDistanceKm(points) }; });
          },
          (err) => { setTracking((t) => ({ ...t, error: "Location: " + (err.message || "unavailable") })); },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      };
      /* Capture ONE point right after Start (so the timeline has a start point immediately).
         After that, the native background watcher handles the 15-min points itself
         (it throttles to one per 15 min). We do NOT run a second JS interval here —
         two uploaders caused extra points while travelling. */
      setTimeout(captureAndSave, 4000);

    } else if (isTrackerActive()) {
      stopTracker();
      setTrackerSession(null);
      hideTrackingNotification();
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
    /* On unmount (screen change / background): do NOT stop the tracker. The native
       background watcher must keep running. We only clear the local upload interval.
       Tracking stops solely when the user turns attendance OFF (stopTracker above). */
    return () => { cancelled = true; clearInterval(uploadTimer.current); if (restartHandlerRef.current) window.removeEventListener("eb-restart-tracking", restartHandlerRef.current); };
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
      <AppPhotoViewer />
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
            <Route index element={<FieldHome attendanceOn={attendanceOn} doneToday={doneToday} setAttendanceOn={setAttendanceOn} tracking={tracking} expenses={expenses} followups={followups} leaves={leaves} onStartAttendance={() => setVisitPopup(true)} onStopAttendance={() => setStopPopup(true)} />} />
            <Route path="attendance" element={<FieldAttendance attendanceOn={attendanceOn} setAttendanceOn={setAttendanceOn} tracking={tracking} setTracking={setTracking} gpsAlarm={gpsAlarm} todaySession={todaySessionRef.current} sessionId={sessionRef.current} />} />
            <Route path="expense" element={<FieldExpense list={expenses} add={(e) => setExpenses((x) => [e, ...x])} reload={reloadExpenses} />} />
            <Route path="expense/new" element={<FieldExpenseNew add={async (e) => { try { const r = await api.create("expense", e); setExpenses((x) => [{ _id: r.id, ...e }, ...x]); } catch (err) { alert(err.message); } }} />} />
            <Route path="expense/format/:id" element={<ExpenseFormatView list={expenses} reload={reloadExpenses} />} />
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
            <Route path="followup/quick" element={<FieldFollowUpQuick add={async (f) => { const r = await api.create("followup", f); setFollowups((x) => [{ _id: r.id, ...f }, ...x]); }} />} />
            <Route path="customer/edit" element={<FieldFollowUpNew editData={CUST_EDIT.data} add={async (f) => { try { const id = CUST_EDIT.data?._id; if (id) { await api.update("followup", id, f); setFollowups((x) => x.map((c) => (c._id === id ? { _id: id, ...f } : c))); } CUST_EDIT.data = null; } catch (err) { alert(err.message); } }} />} />
            <Route path="project/new" element={<FieldModuleNew mod="projectProjection" />} />
            {Object.keys(APP_MODS).map((m) => (
              <Route key={m} path={`m/${m}`} element={m === "enquiry" ? <FieldEnquiry /> : m === "quotation" ? <FieldQuotationList /> : <FieldModule mod={m} />} />
            ))}
            {Object.keys(APP_MODS).map((m) => (
              <Route key={m + "n"} path={`m/${m}/new`} element={
                m === "quotation" ? <FieldQuotationNew prefill={QUOTE_PREFILL.data} />
                : <FieldModuleNew mod={m} />
              } />
            ))}
            <Route path="target" element={<FieldTarget />} />
            <Route path="team" element={<FieldTeamPerformance />} />
            <Route path="team-tracking" element={<FieldTeamTracking />} />
            <Route path="team-customers" element={<FieldTeamCustomers />} />
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
              todaySessionRef.current = { visit_type: info.type, visit_name: info.name, transport: info.transport };
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
              setStopPopup(false);
              /* logout: attStop ni reliably poyela chesi (3 retry), server DONE ayyaka done chupinchu.
                 Server = source of truth; localStorage lock avasaram ledu. */
              const sid = sessionRef.current;
              setAttendanceOn(false);
              setDoneToday(true);   // immediate UI feedback
              (async () => {
                if (sid) {
                  if (pendingRef.current.length) { try { await api.attPoints(sid, pendingRef.current.splice(0)); } catch {} }
                  for (let i = 0; i < 3; i++) {
                    try { await api.attStop(sid, stopExtraRef.current || {}); break; }
                    catch { await new Promise((r) => setTimeout(r, 1500)); }
                  }
                  stopExtraRef.current = null;
                  localStorage.removeItem("eb_att_on");
                  sessionRef.current = null;
                }
              })();
            }}
          />
        )}
      </div>
    </div>
  );
}
