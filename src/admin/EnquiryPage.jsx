import { useEffect, useMemo, useState } from "react";
import { Edit3, UserPlus, Trash2, Share2, X, Search } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { scopeRows } from "../lib/scope.js";

const LEAD_SOURCES = [
  "IndiaMart", "Website", "Direct Call", "Exhibition", "DCCHAT",
  "IndiaMart (ARCHER)", "Other", "Website Archer", "Website Eurobond",
];
const UOMS = ["Sq.Mtr", "Sq.Ft", "Nos", "Kg", "Ton", "Sheet"];

/* enquiry date (yyyy-mm-dd) for range filter */
const statusBg = (s) => { const st = (s || "pending").toLowerCase(); return st === "win" ? "#e5f9f1" : st === "assigned" ? "#e8f0ff" : st === "spam" ? "#fdecec" : "#fef3e2"; };
const statusFg = (s) => { const st = (s || "pending").toLowerCase(); return st === "win" ? "#059669" : st === "assigned" ? "#2563eb" : st === "spam" ? "#c0392b" : "#c07f00"; };
function enqDate(r) {
  /* prefer the actual enquiry/lead date over the sync (_created) date */
  if (r.date) {
    const p = String(r.date).split(/[-/]/);
    if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
    if (p.length === 3 && p[0].length === 4) return `${p[0]}-${p[1].padStart(2, "0")}-${p[2].padStart(2, "0")}`;
  }
  if (r.enquiryDate) return String(r.enquiryDate).slice(0, 10);
  if (r._created) return String(r._created).slice(0, 10);
  return null;
}

/* Enquiry (admin) — BreezeCRM style. India Mart + manual leads, assign to sales person. */
export default function EnquiryPage() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [colSearch, setColSearch] = useState({});
  const [search, setSearch] = useState("");
  const [sourceSel, setSourceSel] = useState([...LEAD_SOURCES]);   // Enquiry From dropdown
  const [srcOpen, setSrcOpen] = useState(false);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const [applied, setApplied] = useState({ from: today, to: today, sources: [...LEAD_SOURCES], shown: false });   // data shows only after Show is clicked
  const [tab, setTab] = useState("Enquiries");   // status tabs
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [viewRow, setViewRow] = useState(null);
  const [imSync, setImSync] = useState(false);

  const syncIndiamart = async () => {
    setImSync(true);
    try {
      const r = await api.indiamartSync();
      const errs = (r.errors && r.errors.length) ? "\n\nNote: " + r.errors.join("; ") : "";
      alert(`IndiaMart sync done.\nFetched: ${r.fetched || 0}\nNew leads added: ${r.added || 0}${errs}`);
      load();
    } catch (e) { alert("Sync failed: " + e.message); }
    setImSync(false);
  };
  const [assignFor, setAssignFor] = useState(null);
  const [reassign, setReassign] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const TABS = ["Enquiries", "Pending to Assign", "Assigned", "Spam", "Reassign", "Win"];

  const load = () => api.list("enquiry", false)
    .then((d) => setRows((d.records || []).map((r) => ({ ...r.data, _id: r.id, _created: r.created_at }))))
    .catch(() => setRows([]));
  useEffect(() => { load(); api.listUsers().then((d) => setUsers((d.users || d.records || []).filter((u) => (u.role || u.data?.role) !== "Admin"))).catch(() => {}); }, []);

  /* auto-sync IndiaMart leads once per hour when admin opens Enquiry */
  useEffect(() => {
    const key = "imSync_" + new Date().toISOString().slice(0, 13);   // per hour
    if (!localStorage.getItem(key)) {
      api.indiamartSync().then((r) => { localStorage.setItem(key, "1"); if (r.added > 0) load(); }).catch(() => {});
    }
  }, []);

  const tabFilter = (r) => {
    const st = (r.status || "Pending").toLowerCase();
    switch (tab) {
      case "Enquiries": return true;
      case "Pending to Assign": return st === "pending" || !r.assignedTo;
      case "Assigned": return st === "assigned";
      case "Spam": return st === "spam";
      case "Reassign": return !!r.reassigned;
      case "Win": return st === "win";
      default: return true;
    }
  };

  const list = useMemo(() => {
    let l = rows || [];
    if (!applied.shown) return [];   // nothing until Show is clicked
    l = scopeRows(l, users, ["assignedTo", "assigned_to", "createdBy", "by"]);   // role visibility
    l = l.filter(tabFilter);
    /* Enquiry From (applied via Show) */
    if (applied.sources.length < LEAD_SOURCES.length) l = l.filter((r) => applied.sources.includes(r.leadFrom || r.leadSource));
    /* date range (applied via Show) */
    if (applied.from) l = l.filter((r) => { const d = enqDate(r); return d && d >= applied.from; });
    if (applied.to) l = l.filter((r) => { const d = enqDate(r); return d && d <= applied.to; });
    if (search) {
      const q = search.toLowerCase();
      l = l.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
    }
    Object.entries(colSearch).forEach(([k, v]) => {
      const vv = String(v || "").toLowerCase();
      if (vv) l = l.filter((r) => String(r[k] ?? "").toLowerCase().includes(vv));
    });
    return l;
  }, [rows, search, colSearch, applied, tab, users]);

  const applyShow = () => { setApplied({ from: fromDate, to: toDate, sources: [...sourceSel], shown: true }); setPage(1); };

  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const pageRows = list.slice((page - 1) * pageSize, page * pageSize);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => s.size === pageRows.length ? new Set() : new Set(pageRows.map((r) => r._id)));

  const del = async (r) => { if (!confirm(`Delete enquiry from ${r.company || r.customer || "this lead"}?`)) return; try { await api.remove("enquiry", r._id); load(); } catch (e) { alert(e.message); } };

  const doAssign = async (userId, userName, isReassign) => {
    if (!window.confirm(`${isReassign ? "Re-Assign" : "Assign"} to ${userName}?`)) return;
    const ids = assignFor === "bulk" ? [...selected] : [assignFor._id];
    try {
      for (const id of ids) {
        const row = (rows || []).find((r) => r._id === id);
        if (!row) continue;
        await api.update("enquiry", id, {
          ...row, assignedTo: userName, assignedToId: userId,
          passto: userName, status: "Assigned", assignDate: new Date().toLocaleDateString("en-GB"),
        });
        try { await api.create("notification", { title: isReassign ? "Enquiry Re-Assigned" : "New Enquiry Assigned", message: `${row.company || row.customer || "A lead"} enquiry assigned to you.`, forUser: userId, link: "/app/m/enquiry", at: new Date().toISOString() }); } catch {}
      }
      setAssignFor(null); setReassign(false); setSelected(new Set()); load();
    } catch (e) { alert(e.message); }
  };

  const exportCsv = () => {
    const head = ["Sl#", "Lead From", "Year", "Month", "Date", "Company", "Contact", "Email", "State", "Area", "HOD", "Passto", "Product", "Enquiry Details", "Status", "Assign Date"];
    const body = list.map((r, i) => [i + 1, r.leadFrom || r.leadSource, r.year, r.month, r.date, r.company || r.customer, r.contact || r.phone, r.email, r.state, r.area || r.city, r.hod, r.passto || r.assignedTo, r.product, r.enquiryDetails, r.status || "Pending", r.assignDate]);
    const csv = [head, ...body].map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "enquiries.csv"; a.click();
  };

  const downloadFormat = () => {
    const head = ["Date", "Customer Name", "Contact Person", "Phone No", "Email", "Location", "Lead From", "Product Required", "Quantity", "UOM", "Order Value", "Enquiry Details"];
    const csv = head.map((h) => `"${h}"`).join(",") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "enquiry_import_format.csv"; a.click();
  };

  const importFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
      const idx = (k) => header.findIndex((h) => h.includes(k));
      let ok = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = (lines[i].match(/(".*?"|[^,]+)/g) || []).map((c) => c.trim().replace(/^"|"$/g, ""));
        const g = (k) => { const j = idx(k); return j >= 0 ? cols[j] : ""; };
        const cust = g("customer") || g("company");
        if (!cust) continue;
        const now = new Date();
        await api.create("enquiry", {
          date: g("date") || now.toLocaleDateString("en-GB"), year: String(now.getFullYear()), month: String(now.getMonth() + 1).padStart(2, "0"),
          company: cust, customer: cust, contactPerson: g("contact person"), contact: g("phone"), phone: g("phone"),
          email: g("email"), area: g("location"), leadFrom: g("lead from") || "Other",
          product: g("product"), quantity: g("quantity"), uom: g("uom"), orderValue: g("order value"),
          enquiryDetails: g("enquiry details"), status: "Pending",
        });
        ok++;
      }
      alert(`Imported ${ok} enquiries.`);
      load();
    } catch (e) { alert("Import failed: " + e.message); }
  };

  const th = { padding: "10px 10px", fontWeight: 800, fontSize: 11.5, color: "#fff", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", fontSize: 12.5, borderBottom: "1px solid #eef1f8", whiteSpace: "nowrap" };

  const iconBtn = (bg) => ({ width: 30, height: 30, borderRadius: "50%", border: "none", display: "inline-grid", placeItems: "center", cursor: "pointer", color: "#fff", background: bg, marginRight: 5 });

  return (
    <div>
      <PageHead crumb="SFA" title="Enquiry List" actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={() => setShowAdd(true)}>Add New</button>
          <button className="btn" style={{ background: "#3fb6d3", color: "#fff", borderColor: "transparent" }} disabled={selected.size === 0} onClick={() => setAssignFor("bulk")}>Bulk Assign</button>
          <button className="btn btn-primary" disabled={selected.size === 0} onClick={() => { setReassign(true); setAssignFor("bulk"); }}>Bulk Re-Assign</button>
          <button className="btn" style={{ background: "#2b6fb8", color: "#fff", borderColor: "transparent" }} onClick={downloadFormat}>Download Format</button>
          <label className="btn" style={{ background: "#1f3a68", color: "#fff", borderColor: "transparent", cursor: "pointer" }}>Import File<input type="file" accept=".csv" hidden onChange={(e) => importFile(e.target.files[0])} /></label>
        </div>
      } />

      {/* status tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {TABS.map((t) => {
          const on = tab === t;
          return <button key={t} onClick={() => { setTab(t); setPage(1); }}
            style={{ padding: "8px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid " + (on ? "#2b6fb8" : "#ccd2e6"), background: on ? "linear-gradient(135deg,#1f3a68,#2b6fb8)" : "#fff", color: on ? "#fff" : "#5a6484" }}>
            {t}
          </button>;
        })}
      </div>

      {/* filters row: Enquiry From dropdown + date range + Show */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow-3d)" }}>
        <div style={{ position: "relative", minWidth: 240 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Enquiry From</label>
          <div onClick={() => setSrcOpen((v) => !v)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
              {sourceSel.length === LEAD_SOURCES.length ? "All" : sourceSel.length === 0 ? "None" : sourceSel.join(", ")}
            </span>
            <span style={{ marginLeft: 8 }}>▾</span>
          </div>
          {srcOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", borderRadius: 10, boxShadow: "0 12px 30px rgba(20,25,60,.25)", zIndex: 50, padding: 8, maxHeight: 280, overflowY: "auto" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <input type="checkbox" checked={sourceSel.length === LEAD_SOURCES.length} onChange={(e) => setSourceSel(e.target.checked ? [...LEAD_SOURCES] : [])} /> All
              </label>
              <div style={{ borderTop: "1px solid #eef1f8", margin: "4px 0" }} />
              {LEAD_SOURCES.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={sourceSel.includes(s)} onChange={(e) => setSourceSel((f) => e.target.checked ? [...f, s] : f.filter((x) => x !== s))} /> {s}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} />
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} />
        </div>
        <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={applyShow}>Show</button>
        <button className="btn btn-soft" onClick={exportCsv}>Export to Excel</button>
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: 12, color: "#9aa2bd" }} />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Enter text to search..." style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: "1px solid #dde2ef", fontSize: 13 }} />
      </div>

      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-3d)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg,#1f3a68,#2b6fb8)" }}>
                <th style={th}><input type="checkbox" checked={pageRows.length > 0 && selected.size === pageRows.length} onChange={toggleAll} /></th>
                <th style={th}>Action</th>
                {["Sl#", "Lead From", "Year", "Month", "Date", "Company Name", "Contact number", "Contact Person", "Email Id", "State", "Area", "Product Request", "Enquiry details", "HOD", "Passto", "Status", "Assign Date"].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={19} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={19} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{applied.shown ? "No enquiries found for the selected date / filter." : "Select date & Enquiry From, then click Show to load enquiries."}</td></tr>
              ) : pageRows.map((r, i) => (
                <tr key={r._id} style={{ background: selected.has(r._id) ? "#eef5ff" : "#fff" }}>
                  <td style={td}><input type="checkbox" checked={selected.has(r._id)} onChange={() => toggle(r._id)} /></td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button title="Edit" style={iconBtn("#22a45d")} onClick={() => setEditRow(r)}><Edit3 size={14} /></button>
                      <button title="Assign" style={iconBtn("#e8833a")} onClick={() => { setReassign(false); setAssignFor(r); }}><UserPlus size={14} /></button>
                      <button title="Delete" style={iconBtn("#e5484d")} onClick={() => del(r)}><Trash2 size={14} /></button>
                      {(r.assignedTo || r.passto) && <button title="Re-Assign (Forward)" style={iconBtn("#6c5ce7")} onClick={() => { setReassign(true); setAssignFor(r); }}><Share2 size={14} /></button>}
                    </div>
                  </td>
                  <td style={td}>{(page - 1) * pageSize + i + 1}</td>
                  <td style={td}>{r.leadFrom || r.leadSource || "—"}</td>
                  <td style={td}>{r.year || (r._created ? r._created.slice(0, 4) : "—")}</td>
                  <td style={td}>{r.month || (r._created ? r._created.slice(5, 7) : "—")}</td>
                  <td style={td}>{r.date || (r._created ? r._created.slice(8, 10) : "—")}</td>
                  <td style={td}><span onClick={() => setViewRow(r)} style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 600 }}>{r.company || r.customer || "—"}</span></td>
                  <td style={td}>{r.contact || r.phone || "—"}</td>
                  <td style={td}>{r.contactPerson || "—"}</td>
                  <td style={{ ...td, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{r.email || "—"}</td>
                  <td style={td}>{r.state || "—"}</td>
                  <td style={td}>{r.area || r.city || "—"}</td>
                  <td style={td}>{r.product || "—"}</td>
                  <td style={{ ...td, maxWidth: 160, whiteSpace: "normal" }}>{r.enquiryDetails || "—"}</td>
                  <td style={td}>{r.hod || "—"}</td>
                  <td style={td}>{r.passto || r.assignedTo || "—"}</td>
                  <td style={td}><span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 8, background: statusBg(r.status), color: statusFg(r.status) }}>{r.status || "Pending"}</span></td>
                  <td style={td}>{r.assignDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* pagination */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Page {page} of {pages} ({list.length} items)</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
            <button className="btn" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          </div>
        </div>
      </div>

      {(showAdd || editRow) && <EnquiryForm row={editRow} onClose={() => { setShowAdd(false); setEditRow(null); }} onSaved={() => { setShowAdd(false); setEditRow(null); load(); }} />}
      {viewRow && <AdminEnquiryView r={viewRow} onClose={() => setViewRow(null)} />}
      {assignFor && <AssignModal users={users} reassign={reassign} count={assignFor === "bulk" ? selected.size : 1} onClose={() => { setAssignFor(null); setReassign(false); }} onAssign={doAssign} />}
    </div>
  );
}

/* Add / Edit enquiry form */
function EnquiryForm({ row, onClose, onSaved }) {
  const [f, setF] = useState(row || {
    date: new Date().toISOString().slice(0, 10), customer: "", contactPerson: "", phone: "", email: "",
    area: "", state: "", leadFrom: "IndiaMart", product: "", quantity: "", uom: "Sq.Mtr", orderValue: "", enquiryDetails: "",
  });
  const [busy, setBusy] = useState(false);
  const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!f.customer) { alert("Customer Name required"); return; }
    if (!f.leadFrom) { alert("Lead From required"); return; }
    setBusy(true);
    try {
      const now = new Date();
      const payload = {
        ...f, company: f.customer,
        year: f.year || String(now.getFullYear()), month: f.month || String(now.getMonth() + 1).padStart(2, "0"),
        contact: f.phone, status: f.status || "Pending",
      };
      if (row?._id) await api.update("enquiry", row._id, payload);
      else await api.create("enquiry", payload);
      onSaved();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{row ? "Edit Enquiry" : "Add New Enquiry"}</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Date *</label><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Lead From *</label>
            <select value={f.leadFrom} onChange={(e) => set("leadFrom", e.target.value)} style={inp}>
              {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <label style={{ fontSize: 11.5, fontWeight: 700 }}>Customer Name *</label>
        <input value={f.customer} onChange={(e) => set("customer", e.target.value)} style={inp} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Contact Person</label><input value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Phone No</label><input value={f.phone} onChange={(e) => set("phone", e.target.value.replace(/[^\d+]/g, ""))} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Email</label><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>State</label><input value={f.state} onChange={(e) => set("state", e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Location / Area</label><input value={f.area} onChange={(e) => set("area", e.target.value)} style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Product Required</label><input value={f.product} onChange={(e) => set("product", e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>Quantity</label><input value={f.quantity} onChange={(e) => set("quantity", e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 700 }}>UOM</label><select value={f.uom} onChange={(e) => set("uom", e.target.value)} style={inp}>{UOMS.map((u) => <option key={u}>{u}</option>)}</select></div>
        </div>
        <label style={{ fontSize: 11.5, fontWeight: 700 }}>Order Value</label>
        <input value={f.orderValue} onChange={(e) => set("orderValue", e.target.value)} style={inp} />
        <label style={{ fontSize: 11.5, fontWeight: 700 }}>Enquiry Details</label>
        <textarea rows={3} value={f.enquiryDetails} onChange={(e) => set("enquiryDetails", e.target.value)} style={{ ...inp, resize: "vertical" }} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 6 }} disabled={busy || !f.customer} onClick={save}>{busy ? "Saving…" : (row ? "Update Enquiry" : "Save Enquiry")}</button>
      </div>
    </div>
  );
}

/* Assign / Re-Assign modal — search sales person by name or id */
function AssignModal({ users, reassign, count, onClose, onAssign }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const list = ql ? users.filter((u) => {
    const name = (u.name || u.data?.name || "").toLowerCase();
    const code = (u.empCode || u.data?.empCode || u.id || "").toString().toLowerCase();
    return name.includes(ql) || code.includes(ql);
  }) : users;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{reassign ? "Re-Assign" : "Assign"} {count > 1 ? `(${count} enquiries)` : ""}</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: "#9aa2bd" }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or employee ID…" style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: "1px solid #dde2ef", fontSize: 13 }} />
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 6 }}>
          {list.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13, padding: 12, textAlign: "center" }}>No sales person found</div>
            : list.map((u) => {
              const name = u.name || u.data?.name || "User";
              const code = u.empCode || u.data?.empCode || u.id;
              const uid = u.id || u.data?.id;
              return (
                <div key={uid} onClick={() => onAssign(uid, name, reassign)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, border: "1px solid #eef1f8", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f6fc")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{code}{(u.grade || u.data?.grade) ? ` · ${u.grade || u.data?.grade}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{reassign ? "Re-Assign" : "Assign"} →</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/* Admin enquiry detail view — shows all + Win Sq.Meter + attachment download */
function AdminEnquiryView({ r, onClose }) {
  const row = (label, val) => val ? <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f2f8", fontSize: 13 }}><span style={{ color: "var(--muted)" }}>{label}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span></div> : null;
  const isPdf = r.winInvoice && String(r.winInvoice).match(/\.pdf$/i);
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{r.company || r.customer}</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
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
        {row("Passto", r.passto || r.assignedTo)}
        {row("Status", r.status)}
        {row("Assign Date", r.assignDate)}
        {r.status === "Win" && (
          <div style={{ marginTop: 14, background: "#e5f9f1", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 800, color: "#0f7a44", marginBottom: 8 }}>🏆 Win Details</div>
            {row("Order (Sq. Meter)", r.winSqm)}
            {row("Amount", r.winAmount ? `₹${r.winAmount}` : "")}
            {row("Won At", r.winAt)}
            {r.winInvoice && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Invoice / PO Attachment</div>
                {isPdf
                  ? <span onClick={() => window.dispatchEvent(new CustomEvent("crm-lightbox", { detail: r.winInvoice }))} style={{ color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>📄 View PDF</span>
                  : <img src={r.winInvoice} alt="invoice" onClick={() => window.dispatchEvent(new CustomEvent("crm-lightbox", { detail: r.winInvoice }))} style={{ width: 120, borderRadius: 8, cursor: "pointer", border: "1px solid #cfe8d8" }} />}
                <a href={r.winInvoice} download style={{ display: "inline-block", marginLeft: 12, color: "#0f7a44", fontWeight: 700, fontSize: 12.5 }}>⬇ Download</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
