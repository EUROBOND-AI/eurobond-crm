import { useEffect, useMemo, useState } from "react";
import { Phone, MapPin, Eye, X } from "lucide-react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { scopeRows } from "../lib/scope.js";
import { api } from "../lib/api.js";

/* Address cell — chinnaga chupinchi "read more" tho expand */
function AddressCell({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return <td style={{ padding: "11px 14px" }}>—</td>;
  const short = text.length > 40;
  return (
    <td style={{ padding: "11px 14px", maxWidth: 200, fontSize: 12.5 }}>
      {open || !short ? text : text.slice(0, 40) + "… "}
      {short && <span onClick={() => setOpen((v) => !v)} style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>{open ? " less" : "read more"}</span>}
    </td>
  );
}

/* Customers (admin) — follow-up entries nunchi automatic ga aggregate ayina
   customer directory. Enquiry-style layout (count cards + tools + column search). */
export default function CustomersPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [colSearch, setColSearch] = useState({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [fwdOpen, setFwdOpen] = useState(null);
  const [users, setUsers] = useState([]);
  const CUST_COLS = ["Customer", "Category", "Contact", "Mobile", "Email", "Projects", "Place", "Address", "Entries", "By"];
  const [hiddenCols, setHiddenCols] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("cust_hidden_cols") || "[]")); } catch { return new Set(); } });
  const [cfgOpen, setCfgOpen] = useState(false);
  const toggleCol = (c) => setHiddenCols((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); localStorage.setItem("cust_hidden_cols", JSON.stringify([...n])); return n; });
  const colVisible = (c) => !hiddenCols.has(c);
  /* filters */
  const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [applied, setApplied] = useState(null);   // Show clicked -> filters applied

  const load = () => {
    setBusy(true);
    api.customers("")
      .then((d) => setRows(d.customers || []))
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);
  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.role !== "Admin"))).catch(() => {}); }, []);

  const applyShow = () => setApplied({ state: fState, hod: fHod, person: fPerson, from: fFrom, to: fTo });

  const toggleSel = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const list = useMemo(() => {
    let l = scopeRows(rows || [], users, ["by", "createdBy", "salesPerson"]);
    if (!applied && !q.trim()) return [];   // nothing until Show is clicked (or a search typed)
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      l = l.filter((r) =>
        (r.name || "").toLowerCase().includes(ql) ||
        (r.mobile || "").includes(ql) ||
        (r.place || "").toLowerCase().includes(ql) ||
        (r.by || "").toLowerCase().includes(ql));
    }
    /* applied filters (Show button) */
    if (applied) {
      if (applied.state) l = l.filter((r) => (r.state || "").toLowerCase() === applied.state.toLowerCase());
      if (applied.hod) l = l.filter((r) => (r.hod || "").toLowerCase().includes(applied.hod.toLowerCase()));
      if (applied.person) l = l.filter((r) => (r.by || "").toLowerCase().includes(applied.person.toLowerCase()));
      if (applied.from) l = l.filter((r) => { const d = (r.last_followup || "").slice(0, 10); return d && d >= applied.from; });
      if (applied.to) l = l.filter((r) => { const d = (r.last_followup || "").slice(0, 10); return d && d <= applied.to; });
    }
    Object.entries(colSearch).forEach(([k, v]) => {
      if (!v) return;
      const vv = v.toLowerCase();
      l = l.filter((r) => String(r[k] ?? "").toLowerCase().includes(vv));
    });
    return l;
  }, [rows, q, colSearch, applied, users]);

  const importCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { alert("CSV is empty."); setBusy(false); return; }
      const parse = (line) => { const out = []; let cur = "", inQ = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
      const head = parse(lines[0]).map((h) => h.trim().toLowerCase());
      const idx = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const ci = { name: idx(["customer", "name", "firm", "party"]), mobile: idx(["mobile", "phone"]), email: idx(["email"]), place: idx(["place", "city"]), address: idx(["address"]), state: idx(["state"]), category: idx(["category", "type"]) };
      let added = 0;
      for (let i = 1; i < lines.length; i++) {
        const c = parse(lines[i]);
        const name = ci.name >= 0 ? (c[ci.name] || "").trim() : "";
        if (!name) continue;
        const rec = { name, mobile: ci.mobile >= 0 ? (c[ci.mobile] || "").trim() : "", email: ci.email >= 0 ? (c[ci.email] || "").trim() : "", place: ci.place >= 0 ? (c[ci.place] || "").trim() : "", address: ci.address >= 0 ? (c[ci.address] || "").trim() : "", state: ci.state >= 0 ? (c[ci.state] || "").trim() : "", category: ci.category >= 0 ? (c[ci.category] || "").trim() : "", by: "Imported", followups: 0, imported: true };
        try { await api.create("customer", rec); added++; } catch {}
      }
      alert(`${added} customers imported.`);
      load();
    } catch (e) { alert("Import failed: " + e.message); }
    setBusy(false);
  };

  const exportCsv = () => {
    const head = ["Customer", "Mobile", "Type", "Place", "Address", "Entries", "Last Entry", "By"];
    const body = list.map((r) => [r.name, r.mobile, r.type, r.place, r.address, r.followups, (r.last_followup || "").slice(0, 16), r.by]);
    const csv = [head, ...body].map((row) => row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv"; a.click();
  };

  const withMobile = (rows || []).filter((r) => r.mobile).length;
  /* duplicate detection: same mobile appearing more than once */
  const mobileCounts = {};
  (rows || []).forEach((r) => { if (r.mobile) mobileCounts[r.mobile] = (mobileCounts[r.mobile] || 0) + 1; });
  const dupMobiles = new Set(Object.keys(mobileCounts).filter((m) => mobileCounts[m] > 1));
  const dupCount = (rows || []).filter((r) => r.mobile && dupMobiles.has(r.mobile)).length;
  const totalEntries = (rows || []).reduce((s, r) => s + (r.followups || 0), 0);

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <PageHead
        crumb="SFA"
        title="Customers List"
        actions={
          <ToolButtons
            onRefresh={load}
            refreshing={busy}
            onExport={exportCsv}
            onImport={() => document.getElementById("cust-import-file").click()}
            onHeaderConfig={() => setCfgOpen(true)}
            onLogs={() => alert("Logs — customer entries come from field app follow-ups.")}
            onReport={exportCsv}
          />
        }
      />
      <input id="cust-import-file" type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />

      {sel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "linear-gradient(135deg,#eef1ff,#f4ecff)", borderRadius: 12, marginBottom: 14 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "var(--accent)" }}>{sel.size} selected</span>
          <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12.5 }}
            onClick={() => {
              const selRows = (rows || []).filter((r) => sel.has(r.mobile || r.name));
              setFwdOpen({ mobiles: selRows.map((r) => r.mobile).filter(Boolean), names: selRows.map((r) => r.name).filter(Boolean) });
            }}>➡ Forward to…</button>
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {/* count cards — Enquiry style */}
      <div className="stat-row">
        <StatCard label="Total" value={rows ? rows.length : 0} sub="All customers" />
        <StatCard label="Total Entries" value={totalEntries} sub="Follow-up records" />
        <StatCard label="With Mobile" value={withMobile} sub="Have contact number" />
        <StatCard label="Duplicates" value={dupCount} sub="Same mobile repeated" color={dupCount > 0 ? "#ef4444" : "#94a3b8"} />
        <StatCard label="Showing" value={list.length} sub="After filters" />
      </div>

      {/* filters + Show */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "14px 0", background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>State</label>
          <select value={fState} onChange={(e) => setFState(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 130 }}>
            <option value="">All States</option>
            {[...new Set((rows || []).map((r) => r.state).filter(Boolean))].sort().map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>HOD</label>
          <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 130 }}>
            <option value="">All HODs</option>
            {[...new Set((rows || []).map((r) => r.hod).filter(Boolean))].sort().map((h) => <option key={h}>{h}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Sales Person</label>
          <select value={fPerson} onChange={(e) => setFPerson(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 150 }}>
            <option value="">All</option>
            {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>From Date</label>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} /></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>To Date</label>
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} /></div>
        <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={applyShow}>Show</button>
        {applied && <button className="btn btn-soft" onClick={() => { setApplied(null); setFState(""); setFHod(""); setFPerson(""); setFFrom(""); setFTo(""); }}>Clear</button>}
      </div>

      <div style={{ position: "relative", margin: "14px 0" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / mobile / place / sales person…"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                <th style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>
                  <input type="checkbox" title="Select all"
                    checked={list.length > 0 && list.every((r) => sel.has(r.mobile || r.name))}
                    onChange={(e) => setSel(e.target.checked ? new Set(list.map((r) => r.mobile || r.name)) : new Set())} />
                </th>
                {["Customer", "Category", "Contact", "Mobile", "Email", "Projects", "Place", "Address", "Entries", "By"].filter(colVisible).concat(["Action"]).map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
              <tr style={{ background: "#fafbff" }}>
                {[[null], ["name", "Customer"], ["category", "Category"], ["contactName", "Contact"], ["mobile", "Mobile"], ["email", "Email"], [null, "Projects"], ["place", "Place"], ["address", "Address"], [null, "Entries"], ["by", "By"], [null, "Action"]].filter(([, col]) => !col || col === "Action" || colVisible(col)).map(([k], i) => (
                  <th key={i} style={{ padding: "6px 10px" }}>
                    {k && <input value={colSearch[k] || ""} onChange={(e) => setColSearch((c) => ({ ...c, [k]: e.target.value }))} placeholder="Search…"
                      style={{ width: "100%", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 11.5, background: "#fff", fontWeight: 400 }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  {applied || q.trim() ? "No customers found for the selected filter." : "Use filters and click Show to load customers (or type in search)."}
                </td></tr>
              ) : list.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "11px 14px" }}><input type="checkbox" checked={sel.has(r.mobile || r.name)} onChange={() => toggleSel(r.mobile || r.name)} /></td>
                  {colVisible("Customer") && <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                    <span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>{r.name}</span>
                    {r.mobile && dupMobiles.has(r.mobile) && <span title="Duplicate mobile" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#ef4444", background: "#fdeceb", padding: "1px 6px", borderRadius: 6 }}>DUP</span>}
                  </td>}
                  {colVisible("Category") && <td style={{ padding: "11px 14px" }}>{r.category ? <span style={{ fontSize: 11, background: "#f1ebff", color: "#7c3aed", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{r.category}</span> : "—"}</td>}
                  {colVisible("Contact") && <td style={{ padding: "11px 14px" }}>{r.contactName || (Array.isArray(r.contacts) && r.contacts[0] && r.contacts[0].name) || "—"}</td>}
                  {colVisible("Mobile") && <td style={{ padding: "11px 14px" }}>{r.mobile ? <span style={{ color: "var(--accent)" }}><Phone size={12} /> {r.mobile}</span> : "—"}</td>}
                  {colVisible("Email") && <td style={{ padding: "11px 14px" }}>{r.email || (Array.isArray(r.contacts) && r.contacts[0] && r.contacts[0].email) || "—"}</td>}
                  {colVisible("Projects") && <td style={{ padding: "11px 14px", maxWidth: 180 }}>{r.projectName || (Array.isArray(r.projects) ? r.projects.join(", ") : "") || "—"}</td>}
                  {colVisible("Place") && <td style={{ padding: "11px 14px" }}>{r.place ? <span><MapPin size={12} /> {r.place}</span> : "—"}</td>}
                  {colVisible("Address") && <AddressCell text={r.address} />}
                  {colVisible("Entries") && <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700 }}>{r.followups}</td>}
                  {colVisible("By") && <td style={{ padding: "11px 14px", color: "var(--muted)" }}>{r.by || "—"}</td>}
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setView(r)}><Eye size={12} /> View</button>
                      <button className="btn btn-soft" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setFwdOpen({ mobiles: r.mobile ? [r.mobile] : [], names: [r.name] })}>➡ Forward</button>
                      <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={async () => {
                          if (!window.confirm(`Delete customer ${r.name}? This removes their entries.`)) return;
                          try { await api.deleteCustomer(r.mobile, r.name); load(); } catch (e) { alert(e.message); }
                        }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cfgOpen && (
        <div className="modal-mask" onClick={() => setCfgOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Show / Hide Columns</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setCfgOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {CUST_COLS.map((c) => (
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

      {view && (
        <div className="modal-mask" onClick={() => setView(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{view.name}</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setView(null)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
              {view.category && <div><b>Category:</b> {view.category}</div>}
              {view.mobile && <div><b>Mobile:</b> {view.mobile}</div>}
              {(view.projectName || (view.projects && view.projects.length)) && <div><b>Projects:</b> {view.projectName || (view.projects || []).join(", ")}</div>}
              {view.address && <div><b>Address:</b> {view.address}</div>}
              {Array.isArray(view.contacts) && view.contacts.length > 0 && (
                <div><b>Contacts:</b> {view.contacts.map((c) => `${c.name || ""} (${c.mobile || ""})`).join(", ")}</div>
              )}
              <div><b>Entries:</b> {view.followups}</div>
              {view.last_followup && <div><b>Last Entry:</b> {String(view.last_followup).slice(0, 16)}</div>}
              {view.by && <div><b>Created By:</b> {view.by}</div>}
            </div>

            {Array.isArray(view.updates) && view.updates.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>📋 Follow-up History</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {view.updates.slice().reverse().map((u, i) => (
                    <div key={i} style={{ borderLeft: "3px solid var(--accent)", background: "#f6f8fd", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <b>{u.type || "Follow Up"}</b>
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>{u.date || (u.at ? String(u.at).slice(0, 10) : "")}</span>
                      </div>
                      {u.remark && <div style={{ fontSize: 11.5, marginTop: 2 }}>{u.remark}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {fwdOpen && (
        <div className="modal-mask" onClick={() => setFwdOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Forward Customers</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setFwdOpen(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
              Forwarding {fwdOpen.names.length} customer(s) — all their entries move to the selected person (use when someone resigns).
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 700 }}>Forward to</label>
            <select id="fwd-user" style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 14px" }}>
              <option value="">— Select person —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            <button className="btn btn-primary" style={{ width: "100%" }}
              onClick={async () => {
                const toId = document.getElementById("fwd-user").value;
                if (!toId) { alert("Select a person"); return; }
                try {
                  const r = await api.forwardCustomers(fwdOpen.mobiles, fwdOpen.names, Number(toId));
                  alert(`Forwarded ${r.forwarded} entries.`);
                  setFwdOpen(null); setSel(new Set()); load();
                } catch (e) { alert(e.message); }
              }}>Forward</button>
          </div>
        </div>
      )}
    </div>
  );
}
