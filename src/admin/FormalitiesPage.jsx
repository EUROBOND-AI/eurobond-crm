/* #8 — Joining & Exit Formalities.
   A simple HR checklist per employee. Admin adds an employee (joining or exit),
   then ticks each step as it is completed; every tick stamps who did it and when,
   and each step can carry a remark. One page serves both lists via the `kind`
   prop ("joining" | "exit"). Data is stored as ordinary records:
     module joinFormality / exitFormality
     data { empName, empCode, date, done:{idx:{by,at}}, remarks:{idx:text} }        */
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api, auth } from "../lib/api.js";
import { visibleUsers } from "../lib/scope.js";

/* Each item is { label, type } — type "tick" (a checkbox) or "yesno" (a Yes/No
   choice). For a Yes/No item, picking "No" settles it with no tick needed;
   picking "Yes" then shows the tick to mark it actually done. */
const CHECKLISTS = {
  joining: {
    module: "joinFormality", title: "Joining Formalities", crumb: "Joining Formalities", dateLabel: "Date of Joining",
    items: [
      { label: "Welcome email shared with the employee" },
      { label: "QR code generated" },
      { label: "Visiting card delivered" },
      { label: "Employee induction completed" },
      { label: "Incentive policy explained" },
      { label: "Travel policy explained" },
      { label: "Area allocation shared" },
      { label: "Data transfer from resigned employee, if applicable", type: "yesno" },
      { label: "Name of the employee whose data is being transferred", type: "yesno" },
      { label: "Newly allocated area — previous employee data transfer not required", type: "yesno" },
      { label: "Product training completed" },
      { label: "Welcome kit provided" },
      { label: "SIM card provided" },
      { label: "Old SIM replaced for any existing employee", type: "yesno" },
      { label: "CRM login credentials provided" },
      { label: "Sales target communicated" },
      { label: "CRM training completed" },
      { label: "After confirmation" },
      { label: "Uniform issued" },
    ],
  },
  exit: {
    module: "exitFormality", title: "Exit Formalities", crumb: "Exit Formalities", dateLabel: "Date of Exit",
    items: [
      { label: "Confirm the employee's last working date with the respective HOD" },
      { label: "CRM access declined — all except Attendance Login" },
      { label: "Deactivate CRM login access — all" },
      { label: "Remove the employee from relevant official groups" },
      { label: "Confirm with the HOD whether a replacement is required" },
      { label: "Obtain replacement approval from Rahul Sir" },
      { label: "After Rahul Sir's approval, email the HR Department regarding the replacement requirement" },
    ],
  },
};

/* an item counts as settled: a tick item when ticked; a Yes/No item when answered
   No, or answered Yes and then ticked. */
function itemDone(cfg, rec, i) {
  const it = cfg.items[i];
  if (it.type === "yesno") {
    const a = (rec.answer || {})[i];
    if (a === "No") return true;
    if (a === "Yes") return !!(rec.done || {})[i];
    return false;
  }
  return !!(rec.done || {})[i];
}

const fmtWhen = (iso) => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); };

const low = (x) => String(x || "").trim().toLowerCase();
const sel = { padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 9, fontSize: 13, background: "#fff" };

export default function FormalitiesPage({ kind = "joining" }) {
  const cfg = CHECKLISTS[kind] || CHECKLISTS.joining;
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(null);   // record being viewed
  const [adding, setAdding] = useState(false);
  const me = auth.user?.name || "Admin";

  /* Zone → State → HOD → User cascade */
  const [fZone, setFZone] = useState(""), [fState, setFState] = useState(""), [fHod, setFHod] = useState(""), [fUser, setFUser] = useState("");

  useEffect(() => {
    setFZone(""); setFState(""); setFHod(""); setFUser(""); setShown(false); setRows(null);
    api.listUsers().then((uu) => setUsers(visibleUsers(uu.users || []).filter((u) => u.status == 1))).catch(() => {});
  }, [kind]);

  const load = () => {
    setShown(true); setBusy(true);
    api.list(cfg.module, false).catch(() => ({ records: [] }))
      .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...(r.data || {}) }))
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))))
      .finally(() => setBusy(false));
  };

  const inZone = fZone ? users.filter((u) => low(u.zone) === low(fZone)) : users;
  const inState = fState ? inZone.filter((u) => [u.state, ...String(u.states || "").split(",")].map(low).includes(low(fState))) : inZone;
  const inHod = fHod ? inState.filter((u) => low(u.manager) === low(fHod)) : inState;
  const zones = [...new Set(users.map((u) => u.zone).filter(Boolean))].sort();
  const states = [...new Set(inZone.flatMap((u) => [u.state, ...String(u.states || "").split(",")]).map((x) => String(x || "").trim()).filter(Boolean))].sort();
  const hods = [...new Set(inState.filter((u) => `${u.role || ""} ${u.designation || ""}`.toLowerCase().includes("hod")).map((u) => u.name))].sort();
  const userNames = [...new Set(inHod.map((u) => u.name).filter(Boolean))].sort();
  const allowNames = useMemo(() => new Set(inHod.map((u) => low(u.name))), [inHod]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (fUser) return low(r.empName) === low(fUser);
      return allowNames.has(low(r.empName));   // zone/state/hod narrow the employees
    });
  }, [rows, fUser, allowNames]);

  const progOf = (r) => cfg.items.filter((_, i) => itemDone(cfg, r, i)).length;
  const total = cfg.items.length;
  const openRec = async (r) => { try { const full = await api.get(cfg.module, r._id); setOpen({ _id: r._id, ...(full.record?.data || full.data || r) }); } catch { setOpen(r); } };
  const delRow = async (e, r) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${cfg.title.toLowerCase()} record for ${r.empName}? This cannot be undone.`)) return;
    try { await api.remove(cfg.module, r._id); setRows((rs) => (rs || []).filter((x) => x._id !== r._id)); }
    catch (err) { alert("Delete failed: " + err.message); }
  };

  return (
    <div>
      <PageHead title={cfg.title} crumb={cfg.crumb}
        actions={<button className="btn btn-primary" style={{ padding: "8px 18px", fontWeight: 700 }} onClick={() => setAdding(true)}>+ Add Employee</button>} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {zones.length > 0 && <select value={fZone} onChange={(e) => { setFZone(e.target.value); setFState(""); setFHod(""); setFUser(""); }} style={sel}><option value="">All Zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>}
        <select value={fState} onChange={(e) => { setFState(e.target.value); setFHod(""); setFUser(""); }} style={sel}><option value="">All States</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fHod} onChange={(e) => { setFHod(e.target.value); setFUser(""); }} style={sel}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={sel}><option value="">All Users</option>{userNames.map((u) => <option key={u}>{u}</option>)}</select>
        <button className="btn btn-primary" style={{ padding: "8px 20px", fontWeight: 700 }} onClick={load}>Show</button>
      </div>

      {!shown ? <div style={{ padding: 30, color: "var(--muted)" }}>Press <b>Show</b> to load.</div>
        : busy && !rows ? <div style={{ padding: 30, color: "var(--muted)" }}>Loading…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Employees" value={filtered.length} color="#0b3c8c" />
            <StatCard label="Fully done" value={filtered.filter((r) => progOf(r) === total).length} color="#10b981" />
            <StatCard label="In progress" value={filtered.filter((r) => { const p = progOf(r); return p > 0 && p < total; }).length} color="#f59e0b" />
            <StatCard label="Not started" value={filtered.filter((r) => progOf(r) === 0).length} color="#ef4444" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {filtered.length === 0 && <div style={{ color: "var(--muted)", padding: 20 }}>No records — press <b>+ Add Employee</b>.</div>}
            {filtered.map((r) => {
              const p = progOf(r); const pct = Math.round((p / total) * 100);
              const col = p === total ? "#10b981" : p === 0 ? "#ef4444" : "#f59e0b";
              return (
                <div key={r._id} onClick={() => openRec(r)} style={{ position: "relative", textAlign: "left", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 14, cursor: "pointer" }}>
                  <button onClick={(e) => delRow(e, r)} title="Delete" style={{ position: "absolute", top: 8, right: 8, border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", padding: 4 }}><Trash2 size={16} /></button>
                  <div style={{ fontWeight: 800, color: "var(--navy)", paddingRight: 22 }}>{r.empName || "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{r.empCode ? r.empCode + " · " : ""}{cfg.dateLabel}: {r.date || "—"}</div>
                  <div style={{ height: 8, borderRadius: 99, background: "#eef1f6", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct + "%", background: col }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: col }}>{p}/{total} done</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {adding && <AddModal cfg={cfg} users={users} existing={rows || []} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {open && <DetailModal cfg={cfg} rec={open} me={me} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function AddModal({ cfg, users, existing, onClose, onSaved }) {
  const [emp, setEmp] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!emp) { alert("Select an employee"); return; }
    const u = users.find((x) => x.name === emp);
    setBusy(true);
    try {
      /* check against the live list so the same employee is never added twice,
         even if the page was opened without pressing Show */
      const cur = await api.list(cfg.module, false).catch(() => ({ records: [] }));
      const dup = (cur.records || []).some((r) => String(r.data?.empName || "").trim().toLowerCase() === emp.trim().toLowerCase());
      if (dup) { alert(emp + " is already added in " + cfg.title + "."); setBusy(false); return; }
      await api.create(cfg.module, { empName: emp, empCode: u?.code || "", date, done: {}, answer: {}, remarks: {} });
      onSaved();
    } catch (e) { alert("Save failed: " + e.message); setBusy(false); }
  };
  return (
    <Overlay onClose={onClose} title={"Add — " + cfg.title}>
      <label style={lbl}>Employee *</label>
      <select value={emp} onChange={(e) => setEmp(e.target.value)} style={inp}>
        <option value="">— Select employee —</option>
        {users.map((u) => <option key={u.name} value={u.name}>{u.name}{u.code ? ` (${u.code})` : ""}</option>)}
      </select>
      <label style={lbl}>{cfg.dateLabel}</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
      <div style={{ textAlign: "right", marginTop: 14 }}>
        <button className="btn" onClick={onClose} style={{ marginRight: 8 }}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Add"}</button>
      </div>
    </Overlay>
  );
}

function DetailModal({ cfg, rec, me, onClose, onSaved }) {
  const [done, setDone] = useState(rec.done || {});
  const [answer, setAnswer] = useState(rec.answer || {});
  const [remarks, setRemarks] = useState(rec.remarks || {});
  const [busy, setBusy] = useState(false);
  const p = useMemo(() => cfg.items.filter((_, i) => itemDone(cfg, { done, answer }, i)).length, [done, answer, cfg]);

  const stamp = () => ({ by: me, at: new Date().toISOString() });
  const toggle = (i) => setDone((d) => { const n = { ...d }; if (n[i]) delete n[i]; else n[i] = stamp(); return n; });
  const setYN = (i, val) => {
    setAnswer((a) => ({ ...a, [i]: a[i] === val ? "" : val }));
    /* choosing No clears any tick — No needs no tick */
    if (val === "No") setDone((d) => { const n = { ...d }; delete n[i]; return n; });
  };
  const save = async () => {
    setBusy(true);
    try { await api.update(cfg.module, rec._id, { empName: rec.empName, empCode: rec.empCode, date: rec.date, done, answer, remarks }); onSaved(); }
    catch (e) { alert("Save failed: " + e.message); setBusy(false); }
  };

  const ynBtn = (active, color) => ({ padding: "4px 14px", borderRadius: 7, border: "1px solid " + (active ? color : "var(--line)"), background: active ? color : "#fff", color: active ? "#fff" : "var(--ink)", fontWeight: 700, fontSize: 12.5, cursor: "pointer" });

  return (
    <Overlay onClose={onClose} title={rec.empName + " — " + cfg.title} wide
      sub={(rec.empCode ? rec.empCode + " · " : "") + cfg.dateLabel + ": " + (rec.date || "—") + "  ·  " + p + "/" + cfg.items.length + " done"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cfg.items.map((it, i) => {
          const isYN = it.type === "yesno";
          const ans = answer[i] || "";
          const on = !!done[i];
          const settled = itemDone(cfg, { done, answer }, i);
          return (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: settled ? "#f1fbf5" : "#fff" }}>
              {isYN ? (
                <div>
                  <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>{i + 1}. {it.label}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" style={ynBtn(ans === "Yes", "#0b3c8c")} onClick={() => setYN(i, "Yes")}>Yes</button>
                    <button type="button" style={ynBtn(ans === "No", "#ef4444")} onClick={() => setYN(i, "No")}>No</button>
                    {/* tick only when Yes — No needs no tick */}
                    {ans === "Yes" && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginLeft: 4 }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(i)} style={{ width: 17, height: 17 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Done</span>
                      </label>
                    )}
                    {ans === "Yes" && on && done[i].by && <span style={{ fontSize: 11.5, color: "#10b981", fontWeight: 600 }}>✓ {done[i].by} · {fmtWhen(done[i].at)}</span>}
                  </div>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(i)} style={{ marginTop: 3, width: 17, height: 17 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "var(--navy)" }}>{i + 1}. {it.label}</div>
                    {on && done[i].by && <div style={{ fontSize: 11.5, color: "#10b981", fontWeight: 600 }}>✓ by {done[i].by} · {fmtWhen(done[i].at)}</div>}
                  </div>
                </label>
              )}
              <input value={remarks[i] || ""} onChange={(e) => setRemarks((r) => ({ ...r, [i]: e.target.value }))}
                placeholder="Remark (optional)" style={{ ...inp, marginTop: 8, marginBottom: 0 }} />
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "right", marginTop: 14, position: "sticky", bottom: 0, background: "#fff", paddingTop: 10 }}>
        <button className="btn" onClick={onClose} style={{ marginRight: 8 }}>Close</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Overlay>
  );
}

function Overlay({ title, sub, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,20,45,.5)", zIndex: 99999, display: "grid", placeItems: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: wide ? "min(640px,96vw)" : "min(420px,94vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--navy)" }}>{title}</div>
          {sub && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{sub}</div>}
        </div>
        <div style={{ overflow: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--navy)", marginBottom: 4, marginTop: 10 };
const inp = { width: "100%", padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 9, fontSize: 13, marginBottom: 6 };
