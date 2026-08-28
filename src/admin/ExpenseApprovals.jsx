import { useEffect, useMemo, useState } from "react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { buildExpensePdf } from "../lib/expensePdf.js";
import { scopeRows } from "../lib/scope.js";

/* Admin Expense — submitted statements with full format + bills, approve / reject.
   Photos/PDF open in the shared CRM lightbox (crm-lightbox event), not external links. */
const openLightbox = (url) => window.dispatchEvent(new CustomEvent("crm-lightbox", { detail: url }));

export default function ExpenseApprovals() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Submitted");
  const [view, setView] = useState(null);
  const [users, setUsers] = useState([]);
  const [fPerson, setFPerson] = useState("");
  const [fHod, setFHod] = useState("");
  const [fState, setFState] = useState("");
  const [applied, setApplied] = useState(null);
  const EXP_COLS = ["Employee", "Emp Code", "Period", "Entries", "Amount", "Submitted", "Status"];
  const [hiddenCols, setHiddenCols] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("exp_hidden_cols") || "[]")); } catch { return new Set(); } });
  const [cfgOpen, setCfgOpen] = useState(false);
  const toggleCol = (c) => setHiddenCols((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); localStorage.setItem("exp_hidden_cols", JSON.stringify([...n])); return n; });
  const colVisible = (c) => !hiddenCols.has(c);
  const applyShow = () => setApplied({ person: fPerson, hod: fHod, state: fState });

  const load = () => {
    setLoading(true);
    api.list("expense")
      .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data, _by: r.created_by_name, _at: r.created_at }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const statements = scopeRows(rows.filter((r) => r.isFormat), users, ["user", "createdBy", "createdByName"]);
  const tabs = ["Submitted", "Approved", "Rejected"];
  const list = statements.filter((r) => {
    let ok = false;
    if (tab === "Submitted") ok = r.status === "Submitted";
    else if (tab === "Approved") ok = r.status === "Approved";
    else if (tab === "Rejected") ok = r.status === "Rejected" || r.status === "Reject";
    if (!ok) return false;
    if (applied) {
      if (applied.person && !((r.user || r._by || "").toLowerCase().includes(applied.person.toLowerCase()))) return false;
      if (applied.state && !((r.location || "").toLowerCase().includes(applied.state.toLowerCase()))) return false;
      if (applied.hod) {
        const u = users.find((x) => x.name === (r.user || r._by));
        if (!u || !((u.manager || "").toLowerCase().includes(applied.hod.toLowerCase()))) return false;
      }
    }
    return true;
  });

  const stats = useMemo(() => {
    const sum = (l) => l.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const sub = statements.filter((r) => r.status === "Submitted");
    const app = statements.filter((r) => r.status === "Approved");
    return { subN: sub.length, subAmt: sum(sub), appN: app.length, appAmt: sum(app) };
  }, [statements]);

  return (
    <>
      <PageHead crumb="Dashboards / Expense" title="Expense Approvals" actions={
        <ToolButtons
          onRefresh={load}
          refreshing={loading}
          onExport={() => exportExpenseCsv(list)}
          onImport={() => alert("Expense statements are created by staff in the app.")}
          onHeaderConfig={() => setCfgOpen(true)}
          onLogs={() => alert("Logs — expense statements submitted from the field app.")}
          onReport={() => exportExpenseCsv(list)}
        />
      } />

      {/* filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 14, boxShadow: "var(--shadow)" }}>
        <div>
          <label style={fLbl}>Sales Person</label>
          <select value={fPerson} onChange={(e) => setFPerson(e.target.value)} style={fSel}>
            <option value="">All</option>
            {[...new Set(users.map((u) => u.name))].filter(Boolean).map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label style={fLbl}>HOD</label>
          <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={fSel}>
            <option value="">All</option>
            {[...new Set(users.filter((u) => /hod/i.test(u.role || "")).map((u) => u.name))].filter(Boolean).map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label style={fLbl}>State</label>
          <select value={fState} onChange={(e) => setFState(e.target.value)} style={fSel}>
            <option value="">All</option>
            {[...new Set(users.map((u) => u.state))].filter(Boolean).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={applyShow} style={{ height: 38 }}>Show</button>
        {applied && <button className="btn btn-ghost" onClick={() => { setApplied(null); setFPerson(""); setFHod(""); setFState(""); }} style={{ height: 38 }}>Clear</button>}
      </div>

      <div className="stat-row">
        <StatCard label="Pending" value={stats.subN} sub={`₹${stats.subAmt.toLocaleString("en-IN")} to review`} color="#2563eb" />
        <StatCard label="Approved" value={stats.appN} sub={`₹${stats.appAmt.toLocaleString("en-IN")}`} color="#0f7a44" />
        <StatCard label="Statements" value={statements.length} sub="All" />
      </div>

      <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="btn" style={{ background: tab === t ? "#2b6fb8" : undefined, color: tab === t ? "#fff" : undefined, borderColor: tab === t ? "transparent" : undefined }}>{t}</button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
        : list.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No {tab.toLowerCase()} statements.</div>
        : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                {["Employee", "Emp Code", "Period", "Entries", "Amount", "Submitted", "Status"].filter(colVisible).concat(["Action"]).map((h) => <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r._id} style={{ borderTop: "1px solid #eef1f8" }}>
                    {colVisible("Employee") && <td style={{ padding: "10px 14px", fontWeight: 700 }}><span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer" }}>{r.user || r._by}</span></td>}
                    {colVisible("Emp Code") && <td style={{ padding: "10px 14px" }}>{r.empCode || "—"}</td>}
                    {colVisible("Period") && <td style={{ padding: "10px 14px" }}>{r.periodFrom} → {r.periodTo}</td>}
                    {colVisible("Entries") && <td style={{ padding: "10px 14px" }}>{(r.items || []).length}</td>}
                    {colVisible("Amount") && <td style={{ padding: "10px 14px", fontWeight: 700 }}>₹{(r.amount || 0).toLocaleString("en-IN")}</td>}
                    {colVisible("Submitted") && <td style={{ padding: "10px 14px" }}>{r.submittedAt || "—"}</td>}
                    {colVisible("Status") && <td style={{ padding: "10px 14px" }}><span style={{ fontWeight: 700, color: r.status === "Approved" ? "#0f7a44" : r.status === "Rejected" ? "#c03636" : "#2563eb" }}>{r.status}</span></td>}
                    <td style={{ padding: "10px 14px" }}><button className="btn btn-primary" style={{ padding: "5px 12px" }} onClick={() => setView(r)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cfgOpen && (
        <div className="modal-mask" onClick={() => setCfgOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Show / Hide Columns</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setCfgOpen(false)}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {EXP_COLS.map((c) => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={colVisible(c)} onChange={() => toggleCol(c)} style={{ width: 16, height: 16 }} />
                  {c}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)" }}>Your choice is saved on this device.</div>
          </div>
        </div>
      )}

      {view && <ExpenseReview r={view} onClose={() => setView(null)} onDone={() => { setView(null); load(); }} />}
    </>
  );
}

function ExpenseReview({ r, onClose, onDone }) {
  const items = r.items || [];
  const total = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const [busy, setBusy] = useState(false);
  const [remark, setRemark] = useState("");
  const [attach, setAttach] = useState("");
  const [approvedAmt, setApprovedAmt] = useState(total);
  const [rejectedIdx, setRejectedIdx] = useState(new Set());   // per-entry reject

  const toggleReject = (i) => setRejectedIdx((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const approvedTotal = items.filter((_, i) => !rejectedIdx.has(i)).reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const downloadPdf = async () => {
    setBusy(true);
    try { await buildExpensePdf(r); } catch (e) { alert("PDF failed: " + e.message); }
    setBusy(false);
  };

  const approve = async () => {
    if (!window.confirm(`Approve this statement for ₹${Number(approvedAmt).toLocaleString("en-IN")}?`)) return;
    setBusy(true);
    try {
      await api.update("expense", r._id, { ...r, status: "Approved", approvedAmount: Number(approvedAmt), approvedAt: new Date().toLocaleString("en-IN"), rejectRemark: "", rejectAttachment: "" });
      try { await api.create("notification", { title: "Expense Approved ✓", message: `Your expense statement (₹${Number(approvedAmt).toLocaleString("en-IN")}) has been approved.`, forUser: r.createdById, link: "/app/expense", at: new Date().toISOString() }); } catch {}
      onDone();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const doReject = async () => {
    if (!remark.trim()) { alert("Please enter a reject reason."); return; }
    setBusy(true);
    try {
      const allRejected = rejectedIdx.size === items.length;
      /* flag only the selected entries as rejected; keep the rest as-is */
      const newItems = items.map((it, i) => rejectedIdx.has(i)
        ? { ...it, rejected: true, rejectRemark: remark.trim() }
        : { ...it, rejected: false });
      const rejItems = items.filter((_, i) => rejectedIdx.has(i)).map((it) => it.category + " (₹" + (Number(it.amount) || 0).toLocaleString("en-IN") + ")");
      await api.update("expense", r._id, {
        ...r,
        items: newItems,
        /* any rejected entry → statement goes to Rejected tab so user can fix & resubmit */
        status: "Rejected",
        partialRejected: !allRejected,
        rejectRemark: remark.trim(),
        rejectAttachment: attach || "",
        rejectedList: rejItems,
        approvedTotal,
        rejectedAt: new Date().toLocaleString("en-IN"),
      });
      const msg = allRejected
        ? `Your expense statement was rejected: ${remark.trim()}`
        : `Some entries were rejected (${rejItems.join(", ")}): ${remark.trim()}. Please correct and re-submit those.`;
      try { await api.create("notification", { title: "Expense Rejected", message: msg, forUser: r.createdById, link: "/app/expense", at: new Date().toISOString() }); } catch {}
      onDone();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const uploadAttach = async (file) => {
    if (!file) return;
    try { const u = await api.uploadPhoto(file, "expense"); setAttach(u.url); } catch (e) { alert(e.message); }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Expense Statement — {r.user}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-soft" disabled={busy} onClick={downloadPdf}>⬇ PDF</button>
            <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5, marginBottom: 12, background: "#f7f9ff", padding: 12, borderRadius: 10 }}>
          <div><b>Name:</b> {r.user}</div>
          <div><b>Emp Code:</b> {r.empCode || "—"}</div>
          <div><b>Designation:</b> {r.designation || "—"}</div>
          <div><b>Grade:</b> {r.grade || "—"}</div>
          <div><b>Location:</b> {r.location || "—"}</div>
          <div><b>Period:</b> {r.periodFrom} → {r.periodTo}</div>
        </div>

        <div style={{ maxHeight: "42vh", overflowY: "auto", border: "1px solid #eef1f8", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: "#f4f6fc", position: "sticky", top: 0 }}>
              {["#", "Date", "Category", "Type", "Amount", "Bill"].map((h) => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 800, fontSize: 11.5 }}>{h}</th>)}
              {r.status === "Submitted" && <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, fontSize: 11.5, color: "#c03636" }}>Action</th>}
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8", background: rejectedIdx.has(i) ? "#fdecec" : undefined }}>
                  <td style={{ padding: "8px 10px" }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px" }}>{it.date}</td>
                  <td style={{ padding: "8px 10px" }}>{it.category}</td>
                  <td style={{ padding: "8px 10px" }}>{it.type}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, textDecoration: rejectedIdx.has(i) ? "line-through" : undefined }}>₹{(Number(it.amount) || 0).toLocaleString("en-IN")}</td>
                  <td style={{ padding: "8px 10px" }}>{it.photo ? <span onClick={() => openLightbox(it.photo)} style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 700 }}>View</span> : "—"}</td>
                  {r.status === "Submitted" && (
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <button onClick={() => toggleReject(i)} style={{ padding: "4px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: rejectedIdx.has(i) ? "#c03636" : "#fdecec", color: rejectedIdx.has(i) ? "#fff" : "#c03636" }}>
                        {rejectedIdx.has(i) ? "✓ Rejected" : "Reject"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 4px", fontWeight: 800, fontSize: 15 }}>
          <span>TOTAL</span><span>₹{total.toLocaleString("en-IN")}</span>
        </div>

        {r.status === "Submitted" ? (
          rejectedIdx.size > 0 ? (
            <div style={{ marginTop: 10, background: "#fdf1f1", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12.5, color: "#7a2323", marginBottom: 8, fontWeight: 700 }}>
                {rejectedIdx.size === items.length ? "All entries marked — whole statement will be rejected." : `${rejectedIdx.size} entry(s) marked for rejection · Remaining approved: ₹${approvedTotal.toLocaleString("en-IN")}`}
              </div>
              <label style={{ fontSize: 12, fontWeight: 700 }}>Reject Reason *</label>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} style={{ width: "100%", margin: "6px 0 10px", padding: 8, borderRadius: 8, border: "1px solid var(--line)" }} placeholder="What needs to be corrected…" />
              <label style={{ fontSize: 12, fontWeight: 700 }}>Attachment (optional)</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => uploadAttach(e.target.files[0])} style={{ margin: "6px 0", fontSize: 12 }} />
              {attach && <div style={{ fontSize: 11.5, color: "#0f7a44" }}>✓ attached</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn btn-ghost" onClick={() => setRejectedIdx(new Set())}>Clear</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-danger" disabled={busy} onClick={doReject}>Confirm Reject ({rejectedIdx.size})</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 12.5 }}>Approved Amount: ₹<input value={approvedAmt} onChange={(e) => setApprovedAmt(e.target.value.replace(/[^\d.]/g, ""))} style={{ width: 110, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)" }} /></div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Tip: use per-row "Reject" to reject only some entries</div>
              <button className="btn" style={{ background: "#0f7a44", color: "#fff", borderColor: "transparent" }} disabled={busy} onClick={approve}>Approve</button>
            </div>
          )
        ) : (
          <div style={{ marginTop: 10, textAlign: "center", fontWeight: 700, color: r.status === "Approved" ? "#0f7a44" : "#c03636" }}>
            {r.status === "Approved" ? `✓ Approved · ₹${Number(r.approvedAmount || total).toLocaleString("en-IN")}` : `Rejected: ${r.rejectRemark || ""}`}
          </div>
        )}
      </div>
    </div>
  );
}

const fLbl = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 };
const fSel = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, minWidth: 150 };

function exportExpenseCsv(list) {
  const head = ["Employee", "Emp Code", "Designation", "Grade", "Location", "Period From", "Period To", "Entries", "Amount", "Status", "Submitted"];
  const body = (list || []).map((r) => [r.user || r._by, r.empCode, r.designation, r.grade, r.location, r.periodFrom, r.periodTo, (r.items || []).length, r.amount, r.status, r.submittedAt]);
  const csv = [head, ...body].map((row) => row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "expense-statements.csv"; a.click();
}
