import { useEffect, useState } from "react";
import { Save, Clock, Navigation, Database, MessageCircle, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api.js";

/* ---------------------------------------------------------------------------
   App Settings — server load & data growth control for 300-500 daily users.
   GPS points are recorded only after real movement, and only inside office
   hours. Old points are purged by crm-api/cleanup.php (daily cron).
--------------------------------------------------------------------------- */

const DEFAULTS = {
  intervalSec: 90,
  minDistanceKm: 0,
  idleMaxMs: 90000,
  officeStart: "09:00",
  officeEnd: "20:00",
  officeHoursOnly: true,
  gpsRetentionDays: 90,
  waApiUrl: "",
  waApiKey: "",
  waEnabled: false,
  indiamartKey: "",
};

export default function AppSettings() {
  const [rid, setRid] = useState(null);
  const [f, setF] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.list("appSettings", false)
      .then((d) => {
        const r = (d.records || [])[0];
        if (r) { setRid(r.id); setF({ ...DEFAULTS, ...(r.data || {}) }); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setSaved(false); };

  const save = async () => {
    setBusy(true);
    try {
      const data = {
        ...f,
        intervalSec: Math.max(30, Number(f.intervalSec) || 90),
        minDistanceKm: Number(f.minDistanceKm) || 0,
        idleMaxMs: (Math.max(30, Number(f.intervalSec) || 90)) * 1000,
        gpsRetentionDays: Math.max(30, Number(f.gpsRetentionDays) || 90),
      };
      if (rid) await api.update("appSettings", rid, data);
      else { const r = await api.create("appSettings", data); setRid(r.id); }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>;

  const idleMin = Math.round((Number(f.idleMaxMs) || 300000) / 60000);

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Masters</div>
          <h2 style={{ fontFamily: "Bricolage Grotesque", fontSize: 22, fontWeight: 800, margin: "2px 0 0" }}>App Settings</h2>
        </div>
        <button className="btn-primary" onClick={save} disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {busy ? "Saving…" : saved ? "Saved" : "Save Settings"}
        </button>
      </div>

      <Card icon={<Clock size={16} />} title="Office Hours"
        note="Outside these hours the app stops GPS tracking and background polling — server load and phone battery both drop.">
        <Row>
          <Field label="Start Time">
            <input type="time" value={f.officeStart} onChange={(e) => set("officeStart", e.target.value)} style={inp} />
          </Field>
          <Field label="End Time">
            <input type="time" value={f.officeEnd} onChange={(e) => set("officeEnd", e.target.value)} style={inp} />
          </Field>
          <Field label="Enforce Office Hours">
            <Toggle on={f.officeHoursOnly} onChange={(v) => set("officeHoursOnly", v)} />
          </Field>
        </Row>
      </Card>

      <Card icon={<Navigation size={16} />} title="GPS Tracking Rules"
        note="Time-based tracking (like commercial trackers): one location point every N seconds, whether moving or stationary — giving a smooth full-day trail on the timeline.">
        <Row>
          <Field label="Record point every (seconds)">
            <input type="number" min="30" step="10" value={f.intervalSec}
              onChange={(e) => set("intervalSec", e.target.value)} style={inp} />
          </Field>
          <Field label="Min distance (km) — 0 = pure time-based">
            <input type="number" step="0.5" min="0" value={f.minDistanceKm}
              onChange={(e) => set("minDistanceKm", e.target.value)} style={inp} />
          </Field>
        </Row>
        <div style={hint}>
          Current: one point every <b>{f.intervalSec || 90} seconds</b>{Number(f.minDistanceKm) > 0 ? <> (or after <b>{f.minDistanceKm} km</b> of movement)</> : ""}. Lower seconds = more points, more detailed trail, slightly more server load.
        </div>
      </Card>

      <Card icon={<Database size={16} />} title="Data Retention"
        note="Old GPS points are deleted by the daily cleanup cron. Attendance summary (distance, duration, photos) is kept forever — only the raw points are purged.">
        <Row>
          <Field label="Keep GPS points for (days)">
            <input type="number" min="30" value={f.gpsRetentionDays}
              onChange={(e) => set("gpsRetentionDays", e.target.value)} style={inp} />
          </Field>
        </Row>
        <div style={hint}>
          Cron command (Hostinger → Advanced → Cron Jobs, daily at 2:00 AM):<br />
          <code style={code}>/usr/bin/php /home/uXXXX/domains/eurobondsealant.com/public_html/crm-api/cleanup.php</code>
        </div>
      </Card>

      <Card icon={<Database size={16} />} title="IndiaMART Integration"
        note="Paste your IndiaMART CRM key here (IndiaMART seller account → Lead Manager → API). Leads will automatically appear in Enquiry as Review Pending — assign them to sales persons from there.">
        <Row>
          <Field label="IndiaMART CRM Key">
            <input value={f.indiamartKey || ""} onChange={(e) => set("indiamartKey", e.target.value)} placeholder="glusr_crm_key…" style={inp} />
          </Field>
        </Row>
        <div style={hint}>
          After saving, use the <b>"Sync IndiaMART"</b> button on the Enquiry page (or set a cron:{" "}
          <code style={code}>…/crm-api/indiamart.php?action=sync&key=INSTALL_KEY</code> — hourly).
        </div>
      </Card>

      <Card icon={<MessageCircle size={16} />} title="WhatsApp API"
        note="Used to send messages to customers on follow-up save. Fill this when the API details are ready — templates will be configured here.">
        <Row>
          <Field label="API URL">
            <input value={f.waApiUrl} onChange={(e) => set("waApiUrl", e.target.value)} placeholder="https://..." style={inp} />
          </Field>
          <Field label="API Key / Token">
            <input value={f.waApiKey} onChange={(e) => set("waApiKey", e.target.value)} placeholder="••••••••" style={inp} />
          </Field>
          <Field label="Enable WhatsApp Messages">
            <Toggle on={f.waEnabled} onChange={(v) => set("waEnabled", v)} />
          </Field>
        </Row>
      </Card>
    </div>
  );
}

/* ---------------- small UI bits ---------------- */
const inp = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 9,
  fontSize: 13.5, outline: "none", background: "#fff", fontFamily: "inherit",
};
const hint = { marginTop: 12, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 };
const code = { background: "#f1f4fa", padding: "3px 6px", borderRadius: 5, fontSize: 11.5, display: "inline-block", marginTop: 4 };

function Card({ icon, title, note, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>{icon}</span>
        <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 15 }}>{title}</div>
      </div>
      {note && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>{note}</div>}
      {children}
    </div>
  );
}
const Row = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>{children}</div>
);
const Field = ({ label, children }) => (
  <div>
    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 52, height: 28, borderRadius: 16, border: "none", cursor: "pointer",
      background: on ? "var(--accent)" : "#d7dce5", position: "relative", transition: "background .15s",
    }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 27 : 3, width: 22, height: 22, borderRadius: 11,
        background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }} />
    </button>
  );
}
