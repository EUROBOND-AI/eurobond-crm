import { useEffect, useMemo, useState } from "react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { buildExpensePdf } from "../lib/expensePdf.js";
import { scopeRows } from "../lib/scope.js";
import { HEADER_COLS, LINE_COLS, NUMATCARD_START, depoKey, headerRow, lineRows, downloadSheet } from "../lib/sapExport.js";

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
  const [picked, setPicked] = useState(new Set());
  const [areaState, setAreaState] = useState({});
  const [refMaster, setRefMaster] = useState(null);   // { depo: lastUsed }
  const [refOpen, setRefOpen] = useState(false);
  const [working, setWorking] = useState(false);

  /* area name -> state, for the cost centre of each line */
  useEffect(() => {
    api.areasAll().then((d) => {
      const m = {};
      (d.areas || []).forEach(([n, st]) => { if (n) m[String(n).trim().toLowerCase()] = st; });
      setAreaState(m);
    }).catch(() => {});
  }, []);
  /* last Customer ref number used per depot (Accounts can edit it) */
  const loadRefMaster = async () => {
    try {
      const d = await api.settingsList();
      const row = (d.settings || []).find((x) => x.skey === "sap_numatcard");
      const saved = row ? JSON.parse(row.svalue || "{}") : {};
      const m = { ...NUMATCARD_START, ...saved };
      setRefMaster(m);
      return m;
    } catch { setRefMaster({ ...NUMATCARD_START }); return { ...NUMATCARD_START }; }
  };
  useEffect(() => { loadRefMaster(); }, []);
  const saveRefMaster = (m) => api.settingsSave("sap_numatcard", JSON.stringify(m), "SAP Customer ref number (last used per depot)");

  const userOf = (r) => users.find((u) => u.name === (r.user || r.createdBy || r._by)) || {};
  const togglePick = (id) => setPicked((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* Approved -> Coordination To Accounts */
  const moveToCoordination = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`Move ${ids.length} statement(s) to Coordination To Accounts?`)) return;
    setWorking(true);
    for (const id of ids) {
      const r = rows.find((x) => x._id === id); if (!r) continue;
      try { await api.update("expense", id, { ...r, status: "Coordination", coordinationAt: new Date().toISOString() }); } catch {}
    }
    setPicked(new Set()); setWorking(false); load();
  };

  /* Coordination -> Uploaders. The day this happens is the SAP Tax Date, and
     each statement gets the next Customer ref number of its depot. */
  const sendToUploader = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`Send ${ids.length} statement(s) to Accounts (Uploaders)?`)) return;
    setWorking(true);
    const m = { ...(await loadRefMaster()) };
    const now = new Date().toISOString();
    for (const id of ids) {
      const r = rows.find((x) => x._id === id); if (!r) continue;
      const dk = depoKey(r.depo || userOf(r).depo);
      let ref = r.sapRefNo;
      if (!ref && dk) { ref = (Number(m[dk]) || 0) + 1; m[dk] = ref; }
      try { await api.update("expense", id, { ...r, status: "Uploader", sentToAccountsAt: now, sapRefNo: ref ?? "" }); } catch {}
    }
    try { await saveRefMaster(m); } catch {}
    setRefMaster(m);
    setPicked(new Set()); setWorking(false); load();
  };

  const downloadHeader = async (list2) => {
    if (!list2.length) { alert("Select at least one statement"); return; }
    const today = new Date();
    const rowsOut = list2.map((r) => headerRow(r, userOf(r), today));
    await downloadSheet(`SAP-Header-${today.toISOString().slice(0, 10)}.xlsx`, HEADER_COLS, rowsOut);
  };
  const downloadLines = async (r) => {
    const u = userOf(r);
    const out = lineRows(r, areaState, u.state);
    if (!out.length) { alert("No approved lines in this statement."); return; }
    const safe = String(r.user || "person").replace(/[^a-z0-9]+/gi, "-");
    await downloadSheet(`SAP-Lines-${safe}-${(r.periodTo || "").slice(0, 7)}.xlsx`, LINE_COLS, out);
  };

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
  const tabs = ["Submitted", "Approved", "Coordination To Accounts", "Uploaders", "Rejected"];
  /* data appears only after the user clicks Show */
  const list = !applied ? [] : statements.filter((r) => {
    let ok = false;
    if (tab === "Submitted") ok = r.status === "Submitted";
    else if (tab === "Approved") ok = r.status === "Approved";
    else if (tab === "Coordination To Accounts") ok = r.status === "Coordination";
    else if (tab === "Uploaders") ok = r.status === "Uploader";
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
        <ToolButtons module="Expense" module="Expense"
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
          <button key={t} onClick={() => { setTab(t); setPicked(new Set()); }} className="btn" style={{ background: tab === t ? "#2b6fb8" : undefined, color: tab === t ? "#fff" : undefined, borderColor: tab === t ? "transparent" : undefined }}>{t}</button>
        ))}
      </div>

      {/* what can be done with the ticked statements on this tab */}
      {applied && ["Approved", "Coordination To Accounts", "Uploaders"].includes(tab) && list.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>{picked.size} selected</span>
          {tab === "Approved" && (
            <button className="btn btn-primary" disabled={!picked.size || working} onClick={() => moveToCoordination([...picked])}>
              ➜ Move to Coordination To Accounts
            </button>
          )}
          {tab === "Coordination To Accounts" && (
            <button className="btn btn-primary" disabled={!picked.size || working} onClick={() => sendToUploader([...picked])}>
              ➜ Send to Uploader
            </button>
          )}
          {tab === "Uploaders" && (
            <>
              <button className="btn btn-primary" disabled={!picked.size} onClick={() => downloadHeader(list.filter((r) => picked.has(r._id)))}>
                ⬇ Header Uploader (selected)
              </button>
              <button className="btn btn-soft" onClick={() => downloadHeader(list)}>⬇ Header Uploader (all {list.length})</button>
              <button className="btn btn-ghost" onClick={() => setRefOpen(true)}>Customer Ref No. master</button>
            </>
          )}
          {working && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Working…</span>}
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
        : list.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No {tab.toLowerCase()} statements.</div>
        : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                {["Approved", "Coordination To Accounts", "Uploaders"].includes(tab) && (
                  <th style={{ padding: "11px 14px" }}>
                    <input type="checkbox" checked={list.length > 0 && list.every((r) => picked.has(r._id))}
                      onChange={(e) => setPicked(e.target.checked ? new Set(list.map((r) => r._id)) : new Set())} />
                  </th>
                )}
                {["Employee", "Emp Code", "Period", "Entries", "Amount", "Submitted", "Status"].filter(colVisible)
                  .concat(tab === "Uploaders" ? ["Depot", "Ref No"] : [])
                  .concat(["Action"]).map((h) => <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r._id} style={{ borderTop: "1px solid #eef1f8", background: picked.has(r._id) ? "#f2f6ff" : "transparent" }}>
                    {["Approved", "Coordination To Accounts", "Uploaders"].includes(tab) && (
                      <td style={{ padding: "10px 14px" }}><input type="checkbox" checked={picked.has(r._id)} onChange={() => togglePick(r._id)} /></td>
                    )}
                    {colVisible("Employee") && <td style={{ padding: "10px 14px", fontWeight: 700 }}><span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer" }}>{r.user || r._by}</span></td>}
                    {colVisible("Emp Code") && <td style={{ padding: "10px 14px" }}>{r.empCode || "—"}</td>}
                    {colVisible("Period") && <td style={{ padding: "10px 14px" }}>{r.periodFrom} → {r.periodTo}</td>}
                    {colVisible("Entries") && <td style={{ padding: "10px 14px" }}>{(r.items || []).length}</td>}
                    {colVisible("Amount") && <td style={{ padding: "10px 14px", fontWeight: 700 }}>₹{(r.amount || 0).toLocaleString("en-IN")}</td>}
                    {colVisible("Submitted") && <td style={{ padding: "10px 14px" }}>{r.submittedAt || "—"}</td>}
                    {colVisible("Status") && <td style={{ padding: "10px 14px" }}><span style={{ fontWeight: 700, color: r.status === "Approved" ? "#0f7a44" : r.status === "Rejected" ? "#c03636" : "#2563eb" }}>{r.status === "Coordination" ? "Coordination" : r.status === "Uploader" ? "With Accounts" : r.status}</span></td>}
                    {tab === "Uploaders" && <td style={{ padding: "10px 14px" }}>{r.depo || userOf(r).depo || "—"}</td>}
                    {tab === "Uploaders" && <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.sapRefNo || "—"}</td>}
                    <td style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-primary" style={{ padding: "5px 12px" }} onClick={() => setView(r)}>Open</button>
                      {tab === "Approved" && (
                        <button className="btn btn-soft" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => moveToCoordination([r._id])}>➜ Coordination</button>
                      )}
                      {tab === "Coordination To Accounts" && (
                        <>
                          <button className="btn btn-soft" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => buildExpensePdf(r, true, { adminSummary: true }).catch((e) => alert(e.message))}>PDF</button>
                          <button className="btn btn-soft" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => buildExpensePdf(r, false, { adminSummary: true }).catch((e) => alert(e.message))}>PDF + Bills</button>
                          <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => sendToUploader([r._id])}>➜ Uploader</button>
                        </>
                      )}
                      {tab === "Uploaders" && (
                        <>
                          <button className="btn btn-soft" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => downloadHeader([r])}>⬇ Header</button>
                          <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => downloadLines(r)}>⬇ Lines</button>
                          <button className="btn btn-soft" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => buildExpensePdf(r, true, { adminSummary: true }).catch((e) => alert(e.message))}>PDF</button>
                        </>
                      )}
                      <button className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 12 }}
                        onClick={async () => {
                          if (!window.confirm("Delete this expense statement? This cannot be undone.")) return;
                          try { await api.remove("expense", r._id || r.id); load(); } catch (e) { alert(e.message); }
                        }}>Delete</button>
                    </td>
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

      {/* summary in the exact SAP header format, for a quick check before download */}
      {applied && tab === "Uploaders" && list.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", marginTop: 16, overflowX: "auto" }}>
          <div style={{ padding: "12px 14px", fontWeight: 800, fontSize: 13.5 }}>Header Uploader — Summary</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              {HEADER_COLS.map((hr, hi) => (
                <tr key={hi} style={{ background: hi === 0 ? "#1f3a68" : "#e8eefb" }}>
                  {hr.map((h, i) => <th key={i} style={{ padding: "7px 9px", textAlign: "left", whiteSpace: "nowrap", color: hi === 0 ? "#fff" : "#1f3a68", fontWeight: 800 }}>{h}</th>)}
                </tr>
              ))}
            </thead>
            <tbody>
              {list.map((r) => {
                const vals = headerRow(r, userOf(r), new Date());
                return (
                  <tr key={r._id} style={{ borderTop: "1px solid #eef1f8" }}>
                    {vals.map((v, i) => <td key={i} style={{ padding: "7px 9px", whiteSpace: i === 12 ? "normal" : "nowrap", minWidth: i === 12 ? 260 : undefined }}>{String(v)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {refOpen && refMaster && (
        <div className="modal-mask" onClick={() => setRefOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Customer Ref No. — last used per depot</h3>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>
              The next statement sent to Accounts gets this number + 1. Change it only if SAP was updated by hand.
            </p>
            <div style={{ maxHeight: 360, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 110px", gap: 6, alignItems: "center" }}>
              {Object.keys(refMaster).sort().map((k) => (
                <div key={k} style={{ display: "contents" }}>
                  <span style={{ fontSize: 13, textTransform: "capitalize" }}>{k === "ho" ? "HO" : k}</span>
                  <input type="number" value={refMaster[k]} onChange={(e) => setRefMaster((m) => ({ ...m, [k]: Number(e.target.value) || 0 }))}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => { setRefOpen(false); loadRefMaster(); }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                try { await saveRefMaster(refMaster); setRefOpen(false); } catch (e) { alert(e.message); }
              }}>Save</button>
            </div>
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
  const [itemApproved, setItemApproved] = useState({});
  const [approvedAmt, setApprovedAmt] = useState(total);
  const [rejectedIdx, setRejectedIdx] = useState(new Set());   // per-entry reject

  const toggleReject = (i) => setRejectedIdx((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const approvedTotal = items.filter((_, i) => !rejectedIdx.has(i)).reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const downloadPdf = async () => {
    setBusy(true);
    try { await buildExpensePdf(r, true, { adminSummary: true }); } catch (e) { alert("PDF failed: " + e.message); }
    setBusy(false);
  };
  const downloadPdfBills = async () => {
    setBusy(true);
    try { await buildExpensePdf(r, false, { adminSummary: true }); } catch (e) { alert("PDF failed: " + e.message); }
    setBusy(false);
  };

  const approve = async () => {
    /* save the per-row approved amounts and use their sum as the statement total */
    const newItems = items.map((it, i) => ({
      ...it,
      approvedAmount: rejectedIdx.has(i) ? 0 : Number(itemApproved[i] ?? it.approvedAmount ?? it.amount ?? 0),
    }));
    const sum = newItems.reduce((a, b) => a + (Number(b.approvedAmount) || 0), 0);
    if (!window.confirm(`Approve this statement for ₹${sum.toLocaleString("en-IN")}?`)) return;
    setBusy(true);
    try {
      await api.update("expense", r._id, { ...r, items: newItems, status: "Approved", approvedAmount: sum, approvedAt: new Date().toLocaleString("en-IN"), rejectRemark: "", rejectAttachment: "" });
      try { await api.create("notification", { title: "Expense Approved ✓", message: `Your expense statement (₹${sum.toLocaleString("en-IN")}) has been approved.`, to: r.user || r.createdBy, forUser: r.createdById, to: r.createdBy || "", link: "/app/expense", at: new Date().toISOString() }); } catch {}
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
      try { await api.create("notification", { title: "Expense Rejected", message: msg, forUser: r.createdById, to: r.createdBy || "", link: "/app/expense", at: new Date().toISOString() }); } catch {}
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
              {["SI No", "Date", "Ex/Out-station", "Origin to Destination", "Description", "KM", "Category", "Amount", "Approved Amount", "Bill"]
                .map((h) => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap" }}>{h}</th>)}
              {r.status === "Submitted" && <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 800, fontSize: 11.5, color: "#c03636" }}>Action</th>}
            </tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8", background: rejectedIdx.has(i) ? "#fdecec" : undefined }}>
                  <td style={{ padding: "8px 10px" }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{it.date}</td>
                  <td style={{ padding: "8px 10px" }}>{it.station || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{it.desc || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{it.description || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{it.km || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{it.category}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, textDecoration: rejectedIdx.has(i) ? "line-through" : undefined }}>₹{(Number(it.amount) || 0).toLocaleString("en-IN")}</td>
                  <td style={{ padding: "6px 8px" }}>
                    {/* pre-filled with the claimed amount; admin can change it */}
                    <input value={itemApproved[i] ?? (it.approvedAmount ?? it.amount ?? "")}
                      onChange={(e) => setItemApproved((m) => ({ ...m, [i]: e.target.value.replace(/[^\d.]/g, "") }))}
                      style={{ width: 92, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 12 }} />
                  </td>
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
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f7a44" }}>
                Approved Total: ₹{Object.keys(itemApproved).length || items.length
                  ? items.reduce((sum, it, i) => sum + (rejectedIdx.has(i) ? 0 : Number(itemApproved[i] ?? it.approvedAmount ?? it.amount ?? 0)), 0).toLocaleString("en-IN")
                  : 0}
              </div>
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
