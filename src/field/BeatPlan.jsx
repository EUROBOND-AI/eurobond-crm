/* Weekly Beat Plan — sales & specs people fill Monday..Saturday once a week.
   Each day: visit type (Local / Ex-station / Out-station) + areas + remark. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../lib/api.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TYPES = ["Local", "Ex-station", "Out-station", "Off"];
const CU = () => auth.user || {};

/* Monday of the week that contains `d` */
export function weekStart(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;          // Mon = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d) => d.toISOString().slice(0, 10);
const dateOfDay = (ws, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; };

export default function BeatPlan() {
  const nav = useNavigate();
  const [offset, setOffset] = useState(0);          // 0 = this week, 1 = next week
  const ws = useMemo(() => { const d = weekStart(); d.setDate(d.getDate() + offset * 7); return d; }, [offset]);
  const weekKey = iso(ws);

  const [rows, setRows] = useState(DAYS.map(() => ({ type: "Local", areas: [], remark: "" })));
  const state = CU().state || "";          // always the person's own state
  const [areaOpts, setAreaOpts] = useState([]);
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!state) { setAreaOpts([]); return; }
    api.areasByState(state).then((d) => setAreaOpts(d.areas || [])).catch(() => setAreaOpts([]));
  }, [state]);

  /* load my plan for this week if it already exists */
  useEffect(() => {
    setMsg("");
    api.list("beatPlan", true).then((d) => {
      const mine = (d.records || []).map((r) => ({ _id: r.id, ...r.data }))
        .find((r) => r.weekStart === weekKey && r.createdBy === CU().name);
      if (mine) { setExisting(mine); setRows(mine.days || rows); }
      else { setExisting(null); setRows(DAYS.map(() => ({ type: "Local", areas: [], remark: "" }))); }
    }).catch(() => {});
  }, [weekKey]);

  const setDay = (i, patch) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const toggleArea = (i, a) => setDay(i, {
    areas: rows[i].areas.includes(a) ? rows[i].areas.filter((x) => x !== a) : [...rows[i].areas, a],
  });

  const save = async () => {
    const bad = rows.findIndex((r) => r.type !== "Off" && r.areas.length === 0);
    if (bad >= 0) { alert(`Add at least one area for ${DAYS[bad]}`); return; }
    setBusy(true);
    const payload = {
      weekStart: weekKey,
      weekEnd: iso(dateOfDay(ws, 5)),
      state, createdBy: CU().name, createdById: CU().id,
      role: CU().role || "", hod: CU().manager || "",
      days: rows.map((r, i) => ({ day: DAYS[i], date: iso(dateOfDay(ws, i)), ...r })),
      savedAt: new Date().toISOString(),
    };
    try {
      if (existing?._id) await api.update("beatPlan", existing._id, payload);
      else { const r = await api.create("beatPlan", payload); setExisting({ _id: r.id, ...payload }); }
      /* let the HOD know, with any day-wise remarks */
      try {
        const remarks = payload.days.filter((d) => d.remark && d.remark.trim())
          .map((d) => `${d.day.slice(0, 3)} (${d.remark.trim()})`).join(" · ");
        if (CU().manager) {
          await api.create("notification", {
            title: existing ? "Beat Plan Updated" : "Beat Plan Submitted",
            message: `${CU().name} — week ${payload.weekStart} to ${payload.weekEnd}.${remarks ? " Remarks: " + remarks : ""}`,
            to: CU().manager, link: "/admin/sfa/beat-plan", at: new Date().toISOString(),
          });
        }
      } catch {}
      setMsg("Beat plan saved ✓");
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <>
      <div className="f-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => nav(-1)} aria-label="Back"
          style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, lineHeight: 1, cursor: "pointer", fontWeight: 800, color: "var(--navy)" }}>‹</button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Beat Plan</h2>
      </div>
      <div className="f-form" style={{ paddingBottom: 120 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setOffset((o) => o - 1)} style={navBtn}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 13.5 }}>
            {ws.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — {dateOfDay(ws, 5).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{offset === 0 ? "This week" : offset === 1 ? "Next week" : ""}</div>
          </div>
          <button onClick={() => setOffset((o) => o + 1)} style={navBtn}>›</button>
        </div>

        <div style={{ background: "#f4f7ff", borderRadius: 10, padding: "9px 12px", marginBottom: 10, fontSize: 12.5 }}>
          <b>State:</b> {state || "— not set on your profile —"}
        </div>

        {DAYS.map((d, i) => (
          <div key={d} style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 10, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{d}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{dateOfDay(ws, i).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {TYPES.map((t) => (
                <button key={t} onClick={() => setDay(i, { type: t, areas: t === "Off" ? [] : rows[i].areas })}
                  style={{ padding: "6px 12px", borderRadius: 999, border: rows[i].type === t ? "none" : "1px solid #d7dcef", background: rows[i].type === t ? "var(--navy)" : "#fff", color: rows[i].type === t ? "#fff" : "var(--muted)", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
            {rows[i].type !== "Off" && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>Areas {rows[i].areas.length ? `(${rows[i].areas.length})` : ""}</div>
                {!state ? <div style={{ fontSize: 12, color: "var(--muted)" }}>No state on your profile — ask admin to set it</div> : (
                  <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {areaOpts.map((a) => (
                      <span key={a} onClick={() => toggleArea(i, a)}
                        style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer", fontWeight: 700,
                          background: rows[i].areas.includes(a) ? "#e8f0ff" : "#f5f7fc",
                          color: rows[i].areas.includes(a) ? "#0b3c8c" : "var(--muted)",
                          border: rows[i].areas.includes(a) ? "1px solid #b9d0ff" : "1px solid transparent" }}>{a}</span>
                    ))}
                  </div>
                )}
                <input value={rows[i].remark} onChange={(e) => setDay(i, { remark: e.target.value })}
                  placeholder="Remark (optional)" style={{ width: "100%", marginTop: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #e6e9f2", fontSize: 12.5 }} />
              </>
            )}
          </div>
        ))}

        {msg && <div style={{ background: "#e5f9f1", color: "#0f7a44", padding: 10, borderRadius: 10, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{msg}</div>}
        <button className="f-submit" style={{ width: "100%" }} disabled={busy} onClick={save}>
          {busy ? "Saving…" : existing ? "Update Beat Plan" : "Save Beat Plan"}
        </button>
      </div>
    </>
  );
}

const navBtn = { width: 34, height: 34, borderRadius: 10, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 800 };

/* Shown when attendance is started: today's beat plan, with Continue or Reject
   (a reason is required so admin can see why the plan was not followed). */
export function BeatPlanConfirm({ onClose, onContinue }) {
  const [today, setToday] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const wk = iso(weekStart());
    const todayIso = new Date().toISOString().slice(0, 10);
    api.list("beatPlan", true).then((d) => {
      const mine = (d.records || []).map((r) => ({ _id: r.id, ...r.data }))
        .find((r) => r.weekStart === wk && r.createdBy === CU().name);
      setPlan(mine || null);
      setToday(mine ? (mine.days || []).find((x) => x.date === todayIso) : null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const sendReject = async () => {
    if (!reason.trim()) { alert("Please enter a reason"); return; }
    setBusy(true);
    try {
      await api.create("beatPlanReject", {
        weekStart: plan?.weekStart || "", date: new Date().toISOString().slice(0, 10),
        day: today?.day || "", plannedType: today?.type || "", plannedAreas: today?.areas || [],
        reason: reason.trim(), createdBy: CU().name, hod: CU().manager || "",
        at: new Date().toISOString(),
      });
      try {
        await api.create("notification", {
          title: "Beat Plan Not Followed",
          message: `${CU().name} rejected today's beat plan. Reason: ${reason.trim()}`,
          to: CU().manager || "", forRole: "Admin",
          link: "/admin/sfa/beat-plan", at: new Date().toISOString(),
        });
      } catch {}
      onContinue(null);                 // rejected -> no prefill, plan not followed
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.55)", zIndex: 9999, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, maxWidth: 380, width: "100%", padding: 20 }}>
        {loading ? <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>Loading your beat plan…</div>
        : reject ? (
          <>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Why are you not following the plan?</h3>
            <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (goes to your HOD and admin)"
              style={{ width: "100%", padding: "10px 11px", borderRadius: 9, border: "1px solid #d7dcef", fontSize: 13, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setReject(false)} style={btnGhost}>Back</button>
              <button className="f-submit" style={{ flex: 1 }} disabled={busy} onClick={sendReject}>{busy ? "Sending…" : "Submit & Continue"}</button>
            </div>
          </>
        ) : !today || today.type === "Off" ? (
          <>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>No beat plan for today</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 0 }}>
              {plan ? "Today is marked Off in your plan." : "You haven't saved a beat plan for this week."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={btnGhost}>Cancel</button>
              <button className="f-submit" style={{ flex: 1 }} onClick={() => onContinue(null)}>Continue</button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Today's Beat Plan</h3>
            <div style={{ background: "#f4f7ff", borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--navy)" }}>{today.day} · {today.type}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 5 }}>
                {today.areas && today.areas.length ? today.areas.join(", ") : "No areas listed"}
              </div>
              {today.remark ? <div style={{ fontSize: 12, marginTop: 6 }}>📝 {today.remark}</div> : null}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setReject(true)} style={{ ...btnGhost, color: "#c0392b", borderColor: "#f3c9c4" }}>Reject</button>
              <button className="f-submit" style={{ flex: 1 }} onClick={() => onContinue(today)}>Continue</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnGhost = { flex: 1, padding: 11, borderRadius: 10, border: "1.5px solid #d7dcef", background: "#fff", fontWeight: 700, cursor: "pointer" };
