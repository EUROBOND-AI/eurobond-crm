import { useEffect, useState } from "react";
import { api, auth } from "../lib/api.js";
import { CalendarCheck, Check, X } from "lucide-react";
import { SkeletonList } from "../components/Loaders.jsx";
import ScreenHead from "../components/ScreenHead.jsx";
import { useNavigate } from "react-router-dom";

const CU = () => auth.user || {};
const now = () => new Date().toLocaleString("en-IN");
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* The rules the person must read EVERY time they open this module. */
export const OFFDAY_RULES = [
  "Working on a Sunday or a declared Holiday requires prior approval from your HOD, obtained on the preceding working day.",
  "On any approved working day, you must record a minimum of five (5) New or Revisit customer entries.",
  "If fewer than five customers are visited, a written justification must be submitted to your HOD and to Head Office.",
  "Participation in exhibitions or events on a non-working day requires the same approval, secured at least one day in advance.",
  "If you are already on an outstation tour, separate approval must be obtained for any extension, return or stay.",
  "Head Office remains closed on Sundays and Holidays. Kindly obtain all approvals and clarify any queries at least one day in advance.",
];

function statusOf(r) {
  const s = String(r.status || "Pending");
  if (/appr/i.test(s)) return "Approved";
  if (/reject|declin/i.test(s)) return "Rejected";
  return "Pending";
}
function Chip({ s }) {
  const map = { Pending: ["#b26a00", "#fff3df"], Approved: ["#0f7a44", "#e3f5ec"], Rejected: ["#c03636", "#fdecec"] };
  const [c, b] = map[s] || map.Pending;
  return <span style={{ background: b, color: c, fontWeight: 800, fontSize: 11, padding: "3px 10px", borderRadius: 20 }}>{s}</span>;
}

/* The instruction gate — a POP UP shown every single time the module opens. */
function RulesPopup({ onAgree }) {
  return (
    <div className="f-sheet-mask" style={{ zIndex: 80 }}>
      <div className="f-sheet sheet-3d" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: "#eef3ff", display: "grid", placeItems: "center", margin: "0 auto 10px" }}><CalendarCheck size={26} color="#1b3a8f" /></div>
          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--navy)" }}>Special Working — Please Read</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>Working on a Sunday / Holiday needs HOD approval</div>
        </div>
        <div style={{ marginTop: 14 }}>
          {OFFDAY_RULES.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 9, marginBottom: 11 }}>
              <div style={{ minWidth: 22, height: 22, borderRadius: "50%", background: "#1b3a8f", color: "#fff", fontSize: 11.5, fontWeight: 800, display: "grid", placeItems: "center", marginTop: 1 }}>{i + 1}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: "#2b3350" }}>{r}</div>
            </div>
          ))}
        </div>
        <button className="f-submit" style={{ width: "100%", marginTop: 8 }} onClick={onAgree}>
          <Check size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Agree &amp; Continue
        </button>
      </div>
    </div>
  );
}

/* ---- main screen: rules popup (always) → list + Apply ---- */
export function FieldOffDayWork() {
  const nav = useNavigate();
  const [agreed, setAgreed] = useState(false);   // false on every fresh open → popup shows every time
  const [rows, setRows] = useState(null);
  const load = () => api.list("offDayWork", true)
    .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })).sort((a, b) => (Number(b._id) || 0) - (Number(a._id) || 0))))
    .catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <>
      <ScreenHead title="Special Working" right={agreed ? <button className="f-submit" style={{ padding: "8px 14px", fontSize: 12.5 }} onClick={() => nav("/app/off-day-work/new")}>+ Apply</button> : null} />
      <div className="f-list-pad" style={{ paddingTop: 12 }}>
        {rows === null ? <SkeletonList rows={4} /> : rows.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: 30, textAlign: "center" }}>No special working requests yet.<br />Tap <b>+ Apply</b> to request one.</div>
        ) : rows.map((r) => (
          <div key={r._id} onClick={() => r._id && nav(`/app/thread/offDayWork/${r._id}`)}
            style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.date || "—"} <span style={{ fontWeight: 600, color: "var(--muted)", fontSize: 12 }}>· {r.dayType || "Off day"}</span></div>
                <div style={{ fontSize: 12.5, color: "#44506d", marginTop: 3 }}>{r.reason || "—"}</div>
                {r.hod && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>HOD: {r.hod}</div>}
                {statusOf(r) === "Rejected" && r.rejectRemark && <div style={{ fontSize: 12, color: "#c03636", marginTop: 4 }}>Remark: {r.rejectRemark}</div>}
              </div>
              <Chip s={statusOf(r)} />
            </div>
            <div style={{ color: "var(--accent)", fontSize: 11, marginTop: 6, fontWeight: 700 }}>💬 Tap to view / chat</div>
          </div>
        ))}
      </div>
      {!agreed && <RulesPopup onAgree={() => setAgreed(true)} />}
    </>
  );
}

/* ---- the request form ---- */
export function FieldOffDayWorkNew() {
  const nav = useNavigate();
  const [f, setF] = useState({ date: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const hod = CU().manager || "";

  const dayTypeOf = (dstr) => {
    if (!dstr) return "";
    try { const d = new Date(dstr + "T00:00:00"); if (d.getDay() === 0) return "Sunday"; } catch {}
    return "Holiday";   // any non-Sunday off-day the person requests is treated as a Holiday
  };

  const submit = async () => {
    if (!f.date) { alert("Pick the date you want to work"); return; }
    if (!f.reason.trim()) { alert("Add the reason / work plan (which customers)"); return; }
    setBusy(true);
    const rec = { date: f.date, dayType: dayTypeOf(f.date), reason: f.reason.trim(), hod, status: "Pending", createdBy: CU().name, createdById: CU().id, createdAt: now() };
    try {
      await api.create("offDayWork", rec);
      if (hod) { try { await api.notify({ to: hod, title: "Special Working request", message: `${CU().name} requests to work on ${f.date} (${rec.dayType}). Reason: ${rec.reason}`, link: "/app/off-day-approval", createdAt: now() }); } catch {} }
      nav("/app/off-day-work");
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <>
      <ScreenHead title="Request Special Working" />
      <div className="f-form">
        <div style={{ background: "#fff8ea", border: "1px solid #f3dca6", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#8a6400", marginBottom: 14 }}>
          Take this approval <b>one day before</b>. You must enter at least <b>5 new / revisit customers</b> on the day you work.
        </div>
        <label>Date to work <b>*</b></label>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: "100%", marginBottom: 6 }} />
        {f.date && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>This is a <b>{dayTypeOf(f.date)}</b>.</div>}
        <label>Reason / Work plan (which customers) <b>*</b></label>
        <textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={4} placeholder="e.g. Site follow-ups at ABC, XYZ… (min 5 customers)" style={{ width: "100%", marginBottom: 12, padding: "10px 12px", borderRadius: 9, border: "1px solid #d7dcef", fontSize: 13.5, fontFamily: "inherit", boxSizing: "border-box" }} />
        <label>Your HOD</label>
        <input value={hod || "—"} readOnly style={{ width: "100%", marginBottom: 14, background: "#f0f0f4" }} />
        <button className="f-submit" style={{ width: "100%" }} disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit for Approval"}</button>
      </div>
    </>
  );
}

/* ---- HOD / admin approval list (approve or reject with remark) ---- */
export function FieldOffDayApproval() {
  const [rows, setRows] = useState(null);
  const me = (CU().name || "").trim().toLowerCase();
  const admin = /admin|owner/i.test(CU().role || "") || CU().owner;
  const load = () => api.list("offDayWork", false)
    .then((d) => {
      let rs = (d.records || []).map((r) => ({ _id: r.id, ...r.data }));
      if (!admin) rs = rs.filter((r) => String(r.hod || "").trim().toLowerCase() === me);   // HOD sees their team's
      setRows(rs.sort((a, b) => (Number(b._id) || 0) - (Number(a._id) || 0)));
    })
    .catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const decide = async (r, status) => {
    let remark = "";
    if (status === "Rejected") { remark = window.prompt("Reject remark:") || ""; if (remark === "") return; }
    try {
      await api.update("offDayWork", r._id, { ...r, status, rejectRemark: remark, decidedBy: CU().name, decidedAt: now() });
      try { await api.notify({ to: r.createdBy, title: `Special Working ${status}`, message: `Your request to work on ${r.date} was ${status}${remark ? " — " + remark : ""}.`, link: "/app/off-day-work", createdAt: now() }); } catch {}
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <ScreenHead title="Special Working Approval" />
      <div className="f-list-pad" style={{ paddingTop: 12 }}>
        {rows === null ? <SkeletonList rows={4} /> : rows.length === 0 ? (
          <div style={{ color: "var(--muted)", padding: 30, textAlign: "center" }}>No requests.</div>
        ) : rows.map((r) => (
          <div key={r._id} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{r.createdBy}</div>
                <div style={{ fontSize: 12.5, color: "#44506d", marginTop: 2 }}>{r.date} · {r.dayType}</div>
                <div style={{ fontSize: 12.5, color: "#44506d", marginTop: 3 }}>{r.reason}</div>
              </div>
              <Chip s={statusOf(r)} />
            </div>
            {statusOf(r) === "Pending" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => decide(r, "Approved")} style={{ flex: 1, padding: 9, borderRadius: 9, border: "none", background: "#0f7a44", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✓ Approve</button>
                <button onClick={() => decide(r, "Rejected")} style={{ flex: 1, padding: 9, borderRadius: 9, border: "none", background: "#c03636", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✕ Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
