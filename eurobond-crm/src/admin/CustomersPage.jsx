import { useEffect, useMemo, useState } from "react";
import { Users, Search, RefreshCw, Phone, MapPin, Download, Eye, X } from "lucide-react";
import { api } from "../lib/api.js";

/* ---------------------------------------------------------------------------
   Customers (admin) — follow-up entries nunchi automatic ga aggregate ayina
   customer directory built automatically from app entries.
--------------------------------------------------------------------------- */
export default function CustomersPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("All");
  const [busy, setBusy] = useState(false);
  const [colSearch, setColSearch] = useState({});
  const [view, setView] = useState(null);

  const load = () => {
    setBusy(true);
    api.customers("")
      .then((d) => setRows(d.customers || []))
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);

  const types = useMemo(() => {
    const t = new Set();
    (rows || []).forEach((r) => r.type && t.add(r.type));
    return ["All", ...[...t].sort()];
  }, [rows]);

  const list = useMemo(() => {
    let l = rows || [];
    if (typeF !== "All") l = l.filter((r) => r.type === typeF);
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      l = l.filter((r) =>
        (r.name || "").toLowerCase().includes(ql) ||
        (r.mobile || "").includes(ql) ||
        (r.place || "").toLowerCase().includes(ql) ||
        (r.by || "").toLowerCase().includes(ql));
    }
    Object.entries(colSearch).forEach(([k, v]) => {
      if (!v) return;
      const vv = v.toLowerCase();
      l = l.filter((r) => String(r[k] ?? "").toLowerCase().includes(vv));
    });
    return l;
  }, [rows, q, typeF, colSearch]);

  const exportCsv = () => {
    const head = ["Customer", "Mobile", "Type", "Place", "Address", "Entries", "Last Entry", "By"];
    const body = list.map((r) => [r.name, r.mobile, r.type, r.place, r.address, r.followups, (r.last_followup || "").slice(0, 16), r.by]);
    const csv = [head, ...body].map((row) => row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv"; a.click();
  };

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>SFA</div>
          <h2 style={{ fontFamily: "Bricolage Grotesque", fontSize: 22, fontWeight: 800, margin: "2px 0 0" }}>
            Customers {rows && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>· {list.length} of {rows.length}</span>}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={exportCsv} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-ghost" onClick={load} disabled={busy} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} color="var(--muted)" style={{ position: "absolute", left: 11, top: 11 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / mobile / place / sales person…"
            style={{ width: "100%", padding: "9px 12px 9px 32px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
        </div>
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* count cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
        {[
          ["Total Customers", rows ? rows.length : 0, "#3949ab"],
          ["Total Entries", (rows || []).reduce((s, r) => s + (r.followups || 0), 0), "#1f9d55"],
          ["With Mobile", (rows || []).filter((r) => r.mobile).length, "#e8a020"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "var(--shadow)", borderLeft: `4px solid ${color}` }}>
            <div style={{ fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: 26, color }}>{val}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                {["Customer", "Mobile", "Type", "Place", "Address", "Entries", "Last Entry", "By", "Action"].map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
              <tr style={{ background: "#fafbff" }}>
                {[["name", "Search"], ["mobile", "Search"], ["type", "Search"], ["place", "Search"], ["address", "Search"], [null], [null], ["by", "Search"], [null]].map(([k, ph], i) => (
                  <th key={i} style={{ padding: "6px 10px" }}>
                    {k && <input value={colSearch[k] || ""} onChange={(e) => setColSearch((c) => ({ ...c, [k]: e.target.value }))} placeholder={ph + "…"}
                      style={{ width: "100%", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 11.5, background: "#fff", fontWeight: 400 }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  <Users size={30} style={{ opacity: 0.4 }} /><br />No customers yet — customer entries from the app will appear here.
                </td></tr>
              ) : list.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                    <span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>{r.name}</span>
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    {r.mobile ? <a href={`tel:${r.mobile}`} style={{ color: "var(--accent)", textDecoration: "none", display: "inline-flex", gap: 5, alignItems: "center" }}><Phone size={12} />{r.mobile}</a> : "—"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>{r.type ? <span style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{r.type}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px" }}>{r.place ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><MapPin size={12} color="var(--muted)" />{r.place}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px" }}>{r.address || "—"}</td>
                  <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700 }}>{r.followups}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap", color: "var(--muted)" }}>{(r.last_followup || "").slice(0, 16)}</td>
                  <td style={{ padding: "11px 14px", color: "var(--muted)" }}>{r.by || "—"}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setView(r)}><Eye size={12} /> View</button>
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

      {view && (
        <div className="modal-mask" onClick={() => setView(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{view.name}</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setView(null)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
              {view.mobile && <div><b>Mobile:</b> {view.mobile}</div>}
              {view.type && <div><b>Type:</b> {view.type}</div>}
              {view.place && <div><b>Place:</b> {view.place}</div>}
              {view.address && <div><b>Address:</b> {view.address}</div>}
              <div><b>Entries:</b> {view.followups}</div>
              {view.last_followup && <div><b>Last Entry:</b> {String(view.last_followup).slice(0, 16)}</div>}
              {view.by && <div><b>By:</b> {view.by}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
