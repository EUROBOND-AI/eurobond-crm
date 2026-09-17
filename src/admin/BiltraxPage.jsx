import { useEffect, useMemo, useState } from "react";
import { Eye, Trophy, Share2, Phone, Trash2 } from "lucide-react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { api, auth } from "../lib/api.js";
import { scopeRows, visibleUsers } from "../lib/scope.js";

const BILTRAX_TYPES = ["Requested", "Appointment"];
const th = { padding: "11px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 12.5, borderTop: "1px solid #f0f2f8" };
const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 };
const lbl = { fontSize: 11.5, fontWeight: 700 };
const iconBtn = (c) => ({ background: "transparent", border: "none", cursor: "pointer", color: c, padding: 4 });

const EMPTY = {
  biltraxType: "Requested", projectLink: "", projectName: "", latestSubStatus: "",
  landmark: "", address: "", associatedCompanies: "", buildingUse: "",
  professional1: "", professional2: "", professional3: "", professional4: "",
  assignPerson: "", hod: "", assignedDate: "", appointmentDate: "", status: "Pending",
};

export default function BiltraxPage() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [winFor, setWinFor] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [fType, setFType] = useState("");
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

  const list = useMemo(() => rows.filter((r) => {
    if (fType && (r.biltraxType || "Requested") !== fType) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return `${r.projectName} ${r.address} ${r.landmark} ${r.assignPerson}`.toLowerCase().includes(t);
  }), [rows, fType, q]);

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
    const head = ["Type", "Project Link", "Project Name", "Latest Sub Status", "Landmark", "Address",
      "Associated Companies", "Building Use", "Professional Detail 1", "Professional Detail 2",
      "Professional Detail 3", "Professional Detail 4", "Assign Person", "HOD", "Assigned Date", "Appointment Date", "Status"];
    const body = list.map((r) => [r.biltraxType, r.projectLink, r.projectName, r.latestSubStatus, r.landmark,
      r.address, r.associatedCompanies, r.buildingUse, r.professional1, r.professional2, r.professional3,
      r.professional4, r.assignPerson, r.hod, r.assignedDate, r.appointmentDate, r.status]);
    const csv = [head, ...body].map((x) => x.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "biltrax.csv"; a.click();
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
        <ToolButtons onRefresh={load} refreshing={loading} onExport={exportCsv}
          onAdd={() => setForm({ ...EMPTY })} addLabel="Add Biltrax" />
      } />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Requested" value={counts.requested} />
        <StatCard label="Appointment" value={counts.appointment} />
        <StatCard label="Won" value={counts.won} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, address, person…"
          style={{ ...inp, width: 280, marginBottom: 0 }} />
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={{ ...inp, width: 190, marginBottom: 0 }}>
          <option value="">All Types</option>
          {BILTRAX_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f7f9ff" }}>
            <tr>{["Action", "Type", "Project Link", "Project Name", "Latest Sub Status", "Landmark", "Address",
              "Associated Companies", "Building Use", "Professional Detail 1", "Professional Detail 2",
              "Professional Detail 3", "Professional Detail 4", "Assign Person", "HOD", "Assigned Date", "Appointment Date", "Status"]
              .map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={18} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={18} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No Biltrax projects yet.</td></tr>
            ) : list.map((r) => (
              <tr key={r._id}>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  <button title="View" style={iconBtn("#2b6fb8")} onClick={() => setView(r)}><Eye size={15} /></button>
                  <button title="Win" style={iconBtn("#1f9d55")} onClick={() => setWinFor(r)}><Trophy size={15} /></button>
                  <button title="Assign" style={iconBtn("#6c5ce7")} onClick={() => setAssignFor(r)}><Share2 size={15} /></button>
                  {r.professional1 && (
                    <a title="Call" href={`tel:${String(r.professional1).replace(/\D/g, "")}`} style={{ ...iconBtn("#0f7a44"), display: "inline-block" }}><Phone size={15} /></a>
                  )}
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
      {winFor && <BiltraxWin r={winFor} onClose={() => setWinFor(null)} onDone={load} />}
      {assignFor && <BiltraxAssign r={assignFor} users={users} onClose={() => setAssignFor(null)} onDone={load} />}
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
      {rowLine("Status", r.status || "Pending")}
      {r.status === "Win" && (
        <div style={{ marginTop: 14, background: "#e5f9f1", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 800, color: "#0f7a44", marginBottom: 8 }}>🏆 Win Details</div>
          {rowLine("Order (Sq. Meter)", r.winSqm)}
          {rowLine("Sales Amount", r.winAmount ? `₹${Number(r.winAmount).toLocaleString("en-IN")}` : "")}
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
  const [sqm, setSqm] = useState(r.winSqm || "");
  const [amount, setAmount] = useState(r.winAmount || "");
  const [file, setFile] = useState(r.winAttachment || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!sqm || !amount) { alert("Enter Sq. Meter and Sales Amount"); return; }
    setBusy(true);
    try {
      await api.update("biltrax", r._id, { ...r, status: "Win", winSqm: sqm, winAmount: amount, winAttachment: file,
        wonAt: new Date().toLocaleString("en-IN") });
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title={`🏆 Mark Win — ${r.projectName || ""}`} onClose={onClose}>
      <label style={lbl}>Order (Sq. Meter) *</label>
      <input value={sqm} inputMode="decimal" onChange={(e) => setSqm(e.target.value.replace(/[^\d.]/g, ""))} style={inp} />
      <label style={lbl}>Sales Amount (₹) *</label>
      <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={inp} />
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

/* Assign to the other side: a sales person picks a specification person and the
   project shows up in Sales to Spec; a specs person picks a sales person and it
   shows up in Spec to Sales. Either way it is tagged as coming from Biltrax. */
function BiltraxAssign({ r, users, onClose, onDone }) {
  const me = auth.user || {};
  const iAmSpec = /spec/i.test(`${me.role || ""} ${me.designation || ""}`);
  const wantRole = iAmSpec ? "sales" : "spec";
  const options = users
    .filter((u) => u.status == 1 && new RegExp(wantRole, "i").test(`${u.role || ""} ${u.designation || ""}`))
    .map((u) => u.name);

  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!pick) { alert("Select a person"); return; }
    setBusy(true);
    const mod = iAmSpec ? "specToSales" : "salesToSpec";
    try {
      await api.create(mod, {
        source: "Biltrax",
        projectName: r.projectName, city: r.landmark || r.address,
        helpNeeded: note || r.latestSubStatus || "",
        contacts: [r.professional1, r.professional2, r.professional3, r.professional4].filter(Boolean).map((p) => ({ name: p })),
        salesPerson: iAmSpec ? pick : (me.name || ""),
        specPerson: iAmSpec ? (me.name || "") : pick,
        status: "Pending", createdBy: me.name || "",
        createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        biltraxId: r._id, biltraxLink: r.projectLink || "",
      });
      try {
        await api.create("notification", {
          title: "Biltrax Project Assigned",
          message: `${me.name} assigned the Biltrax project "${r.projectName}" to you.`,
          to: pick, link: `/app/m/${mod}`, at: new Date().toISOString(),
        });
      } catch {}
      await api.update("biltrax", r._id, { ...r, assignPerson: pick,
        assignedDate: new Date().toLocaleDateString("en-GB"), status: r.status === "Win" ? r.status : "Assigned" });
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title={`Assign to ${iAmSpec ? "Sales" : "Specification"} Person`} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>
        It will appear in their <b>{iAmSpec ? "Spec to Sales" : "Sales to Spec"}</b> list, marked as Biltrax.
      </p>
      <label style={lbl}>Person</label>
      <select value={pick} onChange={(e) => setPick(e.target.value)} style={inp}>
        <option value="">— Select —</option>{options.map((n) => <option key={n}>{n}</option>)}
      </select>
      <label style={lbl}>Note (optional)</label>
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={inp} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Assign"}</button>
      </div>
    </Modal>
  );
}
