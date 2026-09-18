import { useEffect, useMemo, useState } from "react";
import { Eye, Share2, Trash2, MessageSquare, Pencil, UserPlus } from "lucide-react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { api, auth } from "../lib/api.js";
import { scopeRows, visibleUsers } from "../lib/scope.js";

const BILTRAX_TYPES = ["Requested", "Appointment"];
const th = { padding: "10px 10px", fontWeight: 800, fontSize: 11.5, color: "#fff", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "9px 10px", fontSize: 12.5, borderBottom: "1px solid #eef1f8", whiteSpace: "nowrap" };
const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 };
const lbl = { fontSize: 11.5, fontWeight: 700 };
const iconBtn = (bg) => ({ width: 30, height: 30, borderRadius: "50%", border: "none", display: "inline-grid", placeItems: "center", cursor: "pointer", color: "#fff", background: bg, marginRight: 5 });

const EMPTY = {
  biltraxType: "Requested", projectLink: "", projectName: "", latestSubStatus: "",
  landmark: "", address: "", state: "", associatedCompanies: "", buildingUse: "",
  professional1: "", professional2: "", professional3: "", professional4: "",
  assignPerson: "", hod: "", assignedDate: "", appointmentDate: "", status: "Pending",
};

export default function BiltraxPage() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [chatFor, setChatFor] = useState(null);
  const [reassign, setReassign] = useState(false);
  const [fwdOpen, setFwdOpen] = useState(false);
  const [fType, setFType] = useState("");
  const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState("Draft");
  const [selected, setSelected] = useState(new Set());
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.list("biltrax", false), api.listUsers().catch(() => ({ users: [] }))])
      .then(([d, uu]) => {
        const all = uu.users || [];
        setUsers(all);
        setRows(scopeRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })), all,
          ["createdBy", "assignPerson", "hod"]));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  /* Draft = not assigned yet · Processing = assigned, still open · Win = closed */
  const stageOf = (r) => (r.status === "Win" ? "Win" : (r.assignPerson ? "Processing" : "Draft"));

  const list = useMemo(() => (!shown ? [] : rows.filter((r) => {
    if (stageOf(r) !== tab) return false;
    if (fType && (r.biltraxType || "Requested") !== fType) return false;
    if (fState && (r.state || "") !== fState) return false;
    if (fHod && (r.hod || "") !== fHod) return false;
    if (fPerson && (r.assignPerson || "") !== fPerson) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return `${r.projectName} ${r.address} ${r.landmark} ${r.assignPerson}`.toLowerCase().includes(t);
  })), [rows, shown, tab, fType, fState, fHod, fPerson, q]);

  const save = async (data) => {
    try {
      if (data._id) await api.update("biltrax", data._id, data);
      else await api.create("biltrax", { ...data, createdBy: auth.user?.name || "" });
      setForm(null); load();
    } catch (e) { alert(e.message); }
  };

  const del = async (r) => {
    if (!window.confirm(`Delete "${r.projectName || "this project"}"?`)) return;
    try { await api.remove("biltrax", r._id); load(); } catch (e) { alert(e.message); }
  };

  const exportCsv = () => {
    const head = ["Type", "Project Link", "Project Name", "Latest Sub Status", "Landmark", "Address", "State",
      "Associated Companies", "Building Use", "Professional Detail 1", "Professional Detail 2",
      "Professional Detail 3", "Professional Detail 4", "Assign Person", "HOD", "Assigned Date", "Appointment Date", "Status"];
    const body = list.map((r) => [r.biltraxType, r.projectLink, r.projectName, r.latestSubStatus, r.landmark,
      r.address, r.state, r.associatedCompanies, r.buildingUse, r.professional1, r.professional2, r.professional3,
      r.professional4, r.assignPerson, r.hod, r.assignedDate, r.appointmentDate, r.status]);
    const csv = [head, ...body].map((x) => x.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "biltrax.csv"; a.click();
  };

  /* the sheet only carries project information — assignment happens inside the app */
  const COLS = ["Type", "Project Link", "Project Name", "Latest Sub Status", "Landmark", "Address",
    "State", "Associated Companies", "Building Use", "Professional Detail 1", "Professional Detail 2",
    "Professional Detail 3", "Professional Detail 4"];

  const downloadFormat = () => {
    const sample = ["Appointment", "https://biltrax.com/project/123", "Skyline Towers", "Design stage",
      "Near Phoenix Mall", "Kurla West, Mumbai", "Maharashtra", "ABC Builders, XYZ Architects", "Commercial",
      "Arch. Rakesh - 9876543210", "PMC - Mr. Shah 9876500011", "Contractor - 9876500022", ""];
    const csv = [COLS, sample].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "biltrax-format.csv"; a.click();
  };

  const importCsv = async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { alert("CSV is empty."); setLoading(false); return; }
      const parse = (line) => { const out = []; let cur = "", inQ = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
      const head = parse(lines[0]).map((h) => h.trim().toLowerCase());
      const at = (name) => head.indexOf(name.toLowerCase());
      const pick = (c, name) => { const i = at(name); return i >= 0 ? (c[i] || "").trim() : ""; };
      let ok = 0, fail = 0;
      for (let i = 1; i < lines.length; i++) {
        const c = parse(lines[i]);
        const projectName = pick(c, "Project Name");
        if (!projectName) continue;
        const person = pick(c, "Assign Person");
        const u = users.find((x) => x.name === person);
        const rec = {
          biltraxType: pick(c, "Type") || "Requested",
          projectLink: pick(c, "Project Link"), projectName,
          latestSubStatus: pick(c, "Latest Sub Status"), landmark: pick(c, "Landmark"),
          address: pick(c, "Address"), state: pick(c, "State"),
          associatedCompanies: pick(c, "Associated Companies"), buildingUse: pick(c, "Building Use"),
          professional1: pick(c, "Professional Detail 1"), professional2: pick(c, "Professional Detail 2"),
          professional3: pick(c, "Professional Detail 3"), professional4: pick(c, "Professional Detail 4"),
          assignPerson: person, hod: pick(c, "HOD") || u?.manager || "",
          assignedDate: pick(c, "Assigned Date"), appointmentDate: pick(c, "Appointment Date"),
          status: person ? "Assigned" : "Pending",
          createdBy: auth.user?.name || "",
        };
        try { await api.create("biltrax", rec); ok++; } catch { fail++; }
      }
      alert(`${ok} project(s) imported${fail ? `, ${fail} failed` : ""}.`);
      setShown(true);
      load();
    } catch (e) { alert("Import failed: " + e.message); }
    setLoading(false);
  };

  const counts = useMemo(() => ({
    total: rows.length,
    requested: rows.filter((r) => (r.biltraxType || "Requested") === "Requested").length,
    appointment: rows.filter((r) => r.biltraxType === "Appointment").length,
    won: rows.filter((r) => r.status === "Win").length,
  }), [rows]);

  return (
    <div>
      <PageHead crumb="SFA" title="Biltrax" actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={() => setForm({ ...EMPTY })}>Add New</button>
          <button className="btn" style={{ background: "#3fb6d3", color: "#fff", borderColor: "transparent" }} disabled={selected.size === 0} onClick={() => { setReassign(false); setAssignFor("bulk"); }}>Bulk Assign</button>
          <button className="btn" style={{ background: "#0f7a44", color: "#fff", borderColor: "transparent" }} disabled={selected.size === 0} onClick={() => setFwdOpen(true)}>Forward</button>
          <button className="btn btn-danger" disabled={selected.size === 0} onClick={async () => {
            if (!window.confirm(`Delete ${selected.size} project(s)?`)) return;
            for (const id of selected) { try { await api.remove("biltrax", id); } catch {} }
            setSelected(new Set()); load();
          }}>Delete</button>
          <button className="btn" style={{ background: "#2b6fb8", color: "#fff", borderColor: "transparent" }} onClick={downloadFormat}>Download Format</button>
          <label className="btn" style={{ background: "#1f3a68", color: "#fff", borderColor: "transparent", cursor: "pointer" }}>Import File<input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} /></label>
          <button className="btn btn-soft" onClick={exportCsv}>Export</button>
        </div>
      } />

      <input id="biltrax-import" type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Requested" value={counts.requested} />
        <StatCard label="Appointment" value={counts.appointment} />
        <StatCard label="Won" value={counts.won} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow-3d)" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, address, person…"
          style={{ ...inp, width: 250, marginBottom: 0 }} />
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={{ ...inp, width: 170, marginBottom: 0 }}>
          <option value="">All Types</option>
          {BILTRAX_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={fState} onChange={(e) => setFState(e.target.value)} style={{ ...inp, width: 170, marginBottom: 0 }}>
          <option value="">All States</option>
          {[...new Set(rows.map((r) => r.state).filter(Boolean))].sort().map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={{ ...inp, width: 170, marginBottom: 0 }}>
          <option value="">All HOD</option>
          {[...new Set(rows.map((r) => r.hod).filter(Boolean))].sort().map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={fPerson} onChange={(e) => setFPerson(e.target.value)} style={{ ...inp, width: 190, marginBottom: 0 }}>
          <option value="">All Persons</option>
          {[...new Set(rows.map((r) => r.assignPerson).filter(Boolean))].sort().map((x) => <option key={x}>{x}</option>)}
        </select>
        <button className="btn btn-primary" style={{ padding: "9px 22px", fontWeight: 700 }} onClick={() => setShown(true)}>Show</button>
        {shown && <button className="btn btn-ghost" onClick={() => { setShown(false); setQ(""); setFType(""); setFState(""); setFHod(""); setFPerson(""); }}>Clear</button>}
      </div>

      {/* status tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["Draft", "Processing", "Win"].map((t) => {
          const on = tab === t;
          return <button key={t} onClick={() => { setTab(t); setSelected(new Set()); }}
            style={{ padding: "8px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid " + (on ? "#2b6fb8" : "#ccd2e6"), background: on ? "linear-gradient(135deg,#1f3a68,#2b6fb8)" : "#fff", color: on ? "#fff" : "#5a6484" }}>
            {t}
          </button>;
        })}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "linear-gradient(135deg,#1f3a68,#2b6fb8)" }}>
              <th style={th}>
                <input type="checkbox" checked={list.length > 0 && list.every((r) => selected.has(r._id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(list.map((r) => r._id)) : new Set())} />
              </th>
              {["Action", "Type", "Project Link", "Project Name", "Latest Sub Status", "Landmark", "Address", "State",
              "Associated Companies", "Building Use", "Professional Detail 1", "Professional Detail 2",
              "Professional Detail 3", "Professional Detail 4", "Assign Person", "HOD", "Assigned Date", "Appointment Date", "Status"]
              .map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={20} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
            ) : !shown ? (
              <tr><td colSpan={20} style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
                Set your filters and click <b>Show</b> to load the list.
              </td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={20} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No Biltrax projects match these filters.</td></tr>
            ) : list.map((r) => (
              <tr key={r._id} style={{ background: selected.has(r._id) ? "#f2f6ff" : "transparent" }}>
                <td style={td}>
                  <input type="checkbox" checked={selected.has(r._id)}
                    onChange={(e) => setSelected((p2) => { const n = new Set(p2); e.target.checked ? n.add(r._id) : n.delete(r._id); return n; })} />
                </td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button title="View" style={iconBtn("#2b6fb8")} onClick={() => setView(r)}><Eye size={15} /></button>
                  <button title="Edit" style={iconBtn("#f59e0b")} onClick={() => setForm(r)}><Pencil size={15} /></button>
                  <button title="Assign" style={iconBtn("#3fb6d3")} onClick={() => { setReassign(false); setAssignFor(r); }}><UserPlus size={15} /></button>
                  <button title="Message" style={iconBtn("#0b6cb0")} onClick={() => setChatFor(r)}>
                    <MessageSquare size={15} />
                    {Array.isArray(r.chat) && r.chat.length > 0 && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0b6cb0" }}>{r.chat.length}</span>
                    )}
                  </button>
                  <button title="Forward" style={iconBtn("#0f7a44")} onClick={() => { setSelected(new Set([r._id])); setFwdOpen(true); }}><Share2 size={15} /></button>
                  <button title="Delete" style={iconBtn("#e5484d")} onClick={() => del(r)}><Trash2 size={15} /></button>
                </td>
                <td style={td}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999,
                    background: r.biltraxType === "Appointment" ? "#fff4e5" : "#eef2ff",
                    color: r.biltraxType === "Appointment" ? "#ad6800" : "#4f46e5" }}>
                    {r.biltraxType || "Requested"}
                  </span>
                </td>
                <td style={td}>{r.projectLink ? <a href={r.projectLink} target="_blank" rel="noreferrer" className="link">Open</a> : "—"}</td>
                <td style={{ ...td, fontWeight: 700 }}>{r.projectName || "—"}</td>
                <td style={td}>{r.latestSubStatus || "—"}</td>
                <td style={td}>{r.landmark || "—"}</td>
                <td style={td}>{r.address || "—"}</td>
                <td style={td}>{r.state || "—"}</td>
                <td style={td}>{r.associatedCompanies || "—"}</td>
                <td style={td}>{r.buildingUse || "—"}</td>
                <td style={td}>{r.professional1 || "—"}</td>
                <td style={td}>{r.professional2 || "—"}</td>
                <td style={td}>{r.professional3 || "—"}</td>
                <td style={td}>{r.professional4 || "—"}</td>
                <td style={td}>{r.assignPerson || "—"}</td>
                <td style={td}>{r.hod || "—"}</td>
                <td style={td}>{r.assignedDate || "—"}</td>
                <td style={td}>{r.appointmentDate || "—"}</td>
                <td style={td}>{r.status || "Pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && <BiltraxForm row={form} users={users} onClose={() => setForm(null)} onSave={save} />}
      {view && <BiltraxView r={view} onClose={() => setView(null)} />}
      {assignFor && (
        <BiltraxAssign
          rows={assignFor === "bulk" ? rows.filter((x) => selected.has(x._id)) : [assignFor]}
          users={users} reassign={reassign}
          onClose={() => { setAssignFor(null); setReassign(false); }}
          onDone={() => { setSelected(new Set()); load(); }} />
      )}
      {fwdOpen && (
        <BiltraxForward rows={rows.filter((x) => selected.has(x._id))} onClose={() => setFwdOpen(false)} />
      )}
      {chatFor && <BiltraxChat r={chatFor} onClose={() => setChatFor(null)} onDone={load} />}
    </div>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.5)", zIndex: 9999, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 720 : 460, padding: 20, maxHeight: "88vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 16.5 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function BiltraxForm({ row, users, onClose, onSave }) {
  const [f, setF] = useState(row);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const hods = [...new Set(users.filter((u) => /hod/i.test(u.role || "")).map((u) => u.name))];
  const people = visibleUsers(users).filter((u) => u.status == 1).map((u) => u.name);

  return (
    <Modal title={f._id ? "Edit Biltrax" : "Add Biltrax"} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={lbl}>Biltrax Type</label>
          <select value={f.biltraxType} onChange={(e) => set("biltraxType", e.target.value)} style={inp}>
            {BILTRAX_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><label style={lbl}>Project Link</label><input value={f.projectLink} onChange={(e) => set("projectLink", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Project Name</label><input value={f.projectName} onChange={(e) => set("projectName", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Latest Sub Status</label><input value={f.latestSubStatus} onChange={(e) => set("latestSubStatus", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Landmark</label><input value={f.landmark} onChange={(e) => set("landmark", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Address</label><input value={f.address} onChange={(e) => set("address", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>State</label><input value={f.state} onChange={(e) => set("state", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Associated Companies</label><input value={f.associatedCompanies} onChange={(e) => set("associatedCompanies", e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Building Use</label><input value={f.buildingUse} onChange={(e) => set("buildingUse", e.target.value)} style={inp} /></div>
        {[1, 2, 3, 4].map((n) => (
          <div key={n}><label style={lbl}>Professional Detail {n}</label>
            <input value={f[`professional${n}`]} onChange={(e) => set(`professional${n}`, e.target.value)} style={inp} /></div>
        ))}
        <div><label style={lbl}>Assign Person</label>
          <select value={f.assignPerson} onChange={(e) => {
            const nm = e.target.value;
            const u = users.find((x) => x.name === nm);
            setF((x) => ({ ...x, assignPerson: nm, hod: u?.manager || x.hod,
              assignedDate: nm ? (x.assignedDate || new Date().toLocaleDateString("en-GB")) : "" }));
          }} style={inp}>
            <option value="">— Select —</option>{people.map((n) => <option key={n}>{n}</option>)}
          </select></div>
        <div><label style={lbl}>HOD</label>
          <select value={f.hod} onChange={(e) => set("hod", e.target.value)} style={inp}>
            <option value="">— Select —</option>{hods.map((n) => <option key={n}>{n}</option>)}
          </select></div>
        <div><label style={lbl}>Assigned Date</label><input value={f.assignedDate} onChange={(e) => set("assignedDate", e.target.value)} style={inp} /></div>
        {f.biltraxType === "Appointment" && (
          <div><label style={lbl}>Appointment Date</label>
            <input type="date" value={f.appointmentDate} onChange={(e) => set("appointmentDate", e.target.value)} style={inp} /></div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSave(f)}>Save</button>
      </div>
    </Modal>
  );
}

const rowLine = (k, v) => (
  <div key={k} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #f2f4fa", fontSize: 13 }}>
    <div style={{ width: 175, color: "var(--muted)", fontWeight: 700 }}>{k}</div>
    <div style={{ flex: 1 }}>{v || "—"}</div>
  </div>
);

function BiltraxView({ r, onClose }) {
  return (
    <Modal title={r.projectName || "Biltrax Project"} onClose={onClose} wide>
      {rowLine("Biltrax Type", r.biltraxType || "Requested")}
      {rowLine("Project Link", r.projectLink ? <a href={r.projectLink} target="_blank" rel="noreferrer" className="link">{r.projectLink}</a> : "")}
      {rowLine("Latest Sub Status", r.latestSubStatus)}
      {rowLine("Landmark", r.landmark)}
      {rowLine("Address", r.address)}
      {rowLine("Associated Companies", r.associatedCompanies)}
      {rowLine("Building Use", r.buildingUse)}
      {[1, 2, 3, 4].map((n) => rowLine(`Professional Detail ${n}`, r[`professional${n}`]))}
      {rowLine("Assign Person", r.assignPerson)}
      {rowLine("HOD", r.hod)}
      {rowLine("Assigned Date", r.assignedDate)}
      {r.biltraxType === "Appointment" && rowLine("Appointment Date", r.appointmentDate)}
      {rowLine("State", r.state)}
      {rowLine("Status", r.status || "Pending")}
      {r.status === "Win" && (
        <div style={{ marginTop: 14, background: "#e5f9f1", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 800, color: "#0f7a44", marginBottom: 8 }}>
            🏆 {r.winType === "Specification" ? "Specification Win" : "Sales Win"}
          </div>
          {r.winSqm ? rowLine("Order (Sq. Meter)", r.winSqm) : null}
          {r.winAmount ? rowLine("Sales Amount", `₹${Number(r.winAmount).toLocaleString("en-IN")}`) : null}
          {r.specGrade ? rowLine("Approved Grade", r.specGrade) : null}
          {r.specColour ? rowLine("Colour", r.specColour) : null}
          {r.salesWonBy ? rowLine("Sales Won By", r.salesWonBy) : null}
          {r.specWonBy ? rowLine("Spec Won By", r.specWonBy) : null}
          {r.winAttachment && rowLine("Attachment",
            <span className="link" style={{ cursor: "pointer" }}
              onClick={() => window.dispatchEvent(new CustomEvent("crm-lightbox", { detail: r.winAttachment }))}>View file</span>)}
        </div>
      )}
      <button className="btn" style={{ width: "100%", marginTop: 14 }} onClick={onClose}>Close</button>
    </Modal>
  );
}

function BiltraxWin({ r, onClose, onDone }) {
  const me = auth.user || {};
  /* A sales win is an order value; a specification win is the grade and colour
     that got approved for the project, same as on a quotation. */
  const isSpec = /spec/i.test(`${me.role || ""} ${me.designation || ""}`);
  const [sqm, setSqm] = useState(r.winSqm || "");
  const [amount, setAmount] = useState(r.winAmount || "");
  const [grades, setGrades] = useState([]);
  const [colours, setColours] = useState([]);
  const [grade, setGrade] = useState(r.specGrade || "");
  const [colour, setColour] = useState(r.specColour || "");
  const [file, setFile] = useState(r.winAttachment || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSpec) return;
    api.productNames && api.productNames().then((d) => setGrades(d.names || [])).catch(() => {});
  }, [isSpec]);
  useEffect(() => {
    if (!isSpec || !grade) { setColours([]); return; }
    api.productsByName(grade).then((d) => setColours(d.rows || [])).catch(() => setColours([]));
  }, [grade, isSpec]);

  const save = async () => {
    if (isSpec) {
      if (!grade) { alert("Select the approved Grade"); return; }
    } else if (!sqm || !amount) { alert("Enter Sq. Meter and Sales Amount"); return; }
    setBusy(true);
    try {
      const patch = isSpec
        ? { specGrade: grade, specColour: colour, specWonBy: me.name || "", specWonAt: new Date().toLocaleString("en-IN") }
        : { winSqm: sqm, winAmount: amount, salesWonBy: me.name || "", wonAt: new Date().toLocaleString("en-IN") };
      await api.update("biltrax", r._id, { ...r, status: "Win", winType: isSpec ? "Specification" : "Sales",
        winAttachment: file, ...patch });
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title={`🏆 ${isSpec ? "Specification" : "Sales"} Win — ${r.projectName || ""}`} onClose={onClose}>
      {isSpec ? (
        <>
          <label style={lbl}>Approved Grade *</label>
          <select value={grade} onChange={(e) => { setGrade(e.target.value); setColour(""); }} style={inp}>
            <option value="">— Select Grade —</option>
            {grades.map((g) => <option key={g}>{g}</option>)}
          </select>
          <label style={lbl}>Colour</label>
          <select value={colour} onChange={(e) => setColour(e.target.value)} style={inp} disabled={!grade}>
            <option value="">{grade ? "— Select Colour —" : "Select a grade first"}</option>
            {colours.map((c, i) => (
              <option key={i} value={`${c.code ? c.code + " · " : ""}${c.colour || ""}`}>
                {c.code ? c.code + " · " : ""}{c.colour}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label style={lbl}>Order (Sq. Meter) *</label>
          <input value={sqm} inputMode="decimal" onChange={(e) => setSqm(e.target.value.replace(/[^\d.]/g, ""))} style={inp} />
          <label style={lbl}>Sales Amount (₹) *</label>
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={inp} />
        </>
      )}
      <label style={lbl}>Attachment (optional)</label>
      <input type="file" accept="image/*,application/pdf" style={{ marginBottom: 10 }}
        onChange={async (e) => {
          const f = e.target.files && e.target.files[0]; if (!f) return;
          try { const u = await api.uploadCompressed(f, "biltrax"); setFile(u.url || u.path || ""); }
          catch (er) { alert("Upload failed: " + er.message); }
        }} />
      {file && <div style={{ fontSize: 12, color: "#1f9d55", marginBottom: 10 }}>✓ Attached</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Mark Win"}</button>
      </div>
    </Modal>
  );
}

/* Admin <-> field chat on a project. Every message is kept on the record and the
   other side gets a notification. */
function BiltraxChat({ r, onClose, onDone }) {
  const me = auth.user || {};
  const [msgs, setMsgs] = useState(Array.isArray(r.chat) ? r.chat : []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const entry = { by: me.name || "Admin", text: text.trim(), at: new Date().toLocaleString("en-IN") };
    const next = [...msgs, entry];
    try {
      await api.update("biltrax", r._id, { ...r, chat: next });
      const to = [r.assignPerson, r.hod, r.createdBy].filter((x) => x && x !== me.name);
      for (const t of [...new Set(to)]) {
        try {
          await api.create("notification", {
            title: "Message from Admin",
            message: `${r.projectName || "Biltrax project"}: ${entry.text}`,
            to: t, link: "/app/notifications", at: new Date().toISOString(),
          });
        } catch {}
      }
      setMsgs(next); setText("");
      onDone && onDone();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <Modal title={`💬 ${r.projectName || "Biltrax project"}`} onClose={onClose}>
      <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
        {msgs.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13, padding: 10 }}>No messages yet.</div>
        ) : msgs.map((m, i) => (
          <div key={i} style={{ background: "#f4f7ff", borderRadius: 10, padding: "9px 11px", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--navy)" }}>{m.by}</div>
            <div style={{ fontSize: 13, margin: "3px 0" }}>{m.text}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{m.at}</div>
          </div>
        ))}
      </div>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" style={inp} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Close</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </Modal>
  );
}

/* Assign or re-assign one or many projects to a field person. */
function BiltraxAssign({ rows, users, reassign, onClose, onDone }) {
  const me = auth.user || {};
  const people = visibleUsers(users).filter((u) => u.status == 1);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  const ql = q.trim().toLowerCase();
  const opts = people.filter((u) => !ql || `${u.name} ${u.code || ""} ${u.role || ""}`.toLowerCase().includes(ql));

  const go = async () => {
    if (!pick) { alert("Select a person"); return; }
    if (reassign && !remark.trim()) { alert("Please enter a reason for re-assigning"); return; }
    setBusy(true);
    const u = people.find((x) => x.name === pick);
    const today = new Date().toLocaleDateString("en-GB");
    try {
      for (const r of rows) {
        await api.update("biltrax", r._id, {
          ...r, assignPerson: pick, hod: u?.manager || r.hod || "",
          assignedDate: today, status: r.status === "Win" ? r.status : "Assigned",
          ...(reassign ? { reassigned: true, reassignedBy: me.name || "", reassignRemark: remark.trim(), reassignAt: today } : {}),
        });
        try {
          await api.create("notification", {
            title: reassign ? "Biltrax Re-Assigned" : "Biltrax Project Assigned",
            message: `${r.projectName || "A project"} has been ${reassign ? "re-assigned" : "assigned"} to you.${remark.trim() ? " " + remark.trim() : ""}`,
            to: pick, link: "/app/biltrax", at: new Date().toISOString(),
          });
        } catch {}
      }
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title={`${reassign ? "Re-Assign" : "Assign"} ${rows.length > 1 ? `${rows.length} projects` : rows[0]?.projectName || "project"}`} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code…" style={inp} />
      <div style={{ maxHeight: 230, overflowY: "auto", marginBottom: 12 }}>
        {opts.map((u) => (
          <div key={u.id} onClick={() => setPick(u.name)}
            style={{ padding: "9px 11px", borderRadius: 9, cursor: "pointer", marginBottom: 5,
              border: pick === u.name ? "1.5px solid var(--navy)" : "1px solid #eef1f8",
              background: pick === u.name ? "#f2f6ff" : "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{u.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{[u.code, u.role, u.city].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
        {opts.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12.5, padding: 8 }}>No matching person.</div>}
      </div>
      {reassign && (
        <>
          <label style={lbl}>Reason for re-assigning *</label>
          <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} style={inp} />
        </>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={go}>
          {busy ? "Saving…" : reassign ? "Re-Assign" : "Assign"}
        </button>
      </div>
    </Modal>
  );
}

/* Forward the selected projects to someone as a plain message. */
function BiltraxForward({ rows, onClose }) {
  const me = auth.user || {};
  const [to, setTo] = useState("");
  const [users, setUsers] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.listUsers().then((d) => setUsers(visibleUsers(d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const send = async () => {
    if (!to) { alert("Select who to forward to"); return; }
    setBusy(true);
    const names = rows.map((r) => r.projectName || "project").join(", ");
    try {
      await api.create("notification", {
        title: "Biltrax Projects Forwarded",
        message: `${me.name} forwarded: ${names}.${note.trim() ? " " + note.trim() : ""}`,
        to, link: "/app/biltrax", at: new Date().toISOString(),
      });
      alert(`Forwarded ${rows.length} project(s) to ${to}.`);
      onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title={`Forward ${rows.length} project(s)`} onClose={onClose}>
      <label style={lbl}>Forward to</label>
      <select value={to} onChange={(e) => setTo(e.target.value)} style={inp}>
        <option value="">— Select —</option>{users.map((u) => <option key={u.id}>{u.name}</option>)}
      </select>
      <label style={lbl}>Note (optional)</label>
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={inp} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Forward"}</button>
      </div>
    </Modal>
  );
}
