import { useEffect, useMemo, useState } from "react";
import { Phone, MapPin, Eye, X } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

/* Customers (admin) — follow-up entries nunchi automatic ga aggregate ayina
   customer directory. Enquiry-style layout (count cards + tools + column search). */
export default function CustomersPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [colSearch, setColSearch] = useState({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);

  const load = () => {
    setBusy(true);
    api.customers("")
      .then((d) => setRows(d.customers || []))
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);

  const list = useMemo(() => {
    let l = rows || [];
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
  }, [rows, q, colSearch]);

  const exportCsv = () => {
    const head = ["Customer", "Mobile", "Type", "Place", "Address", "Entries", "Last Entry", "By"];
    const body = list.map((r) => [r.name, r.mobile, r.type, r.place, r.address, r.followups, (r.last_followup || "").slice(0, 16), r.by]);
    const csv = [head, ...body].map((row) => row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv"; a.click();
  };

  const withMobile = (rows || []).filter((r) => r.mobile).length;
  const totalEntries = (rows || []).reduce((s, r) => s + (r.followups || 0), 0);

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <PageHead
        crumb="SFA"
        title="Customers List"
        actions={
          <>
            <button className="btn btn-soft" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
            <button className="btn btn-soft" onClick={exportCsv}>Export</button>
          </>
        }
      />

      {/* count cards — Enquiry style */}
      <div className="stat-row">
        <StatCard label="Total" value={rows ? rows.length : 0} sub="All customers" />
        <StatCard label="Total Entries" value={totalEntries} sub="Follow-up records" />
        <StatCard label="With Mobile" value={withMobile} sub="Have contact number" />
        <StatCard label="Showing" value={list.length} sub="After filters" />
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
                {["Customer", "Mobile", "Type", "Place", "Address", "Entries", "Last Entry", "By", "Action"].map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
              <tr style={{ background: "#fafbff" }}>
                {[["name"], ["mobile"], ["type"], ["place"], ["address"], [null], [null], ["by"], [null]].map(([k], i) => (
                  <th key={i} style={{ padding: "6px 10px" }}>
                    {k && <input value={colSearch[k] || ""} onChange={(e) => setColSearch((c) => ({ ...c, [k]: e.target.value }))} placeholder="Search…"
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
                  No customers yet — customer entries from the app will appear here.
                </td></tr>
              ) : list.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                    <span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>{r.name}</span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>{r.mobile ? <span style={{ color: "var(--accent)" }}><Phone size={12} /> {r.mobile}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px" }}>{r.type ? <span style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{r.type}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px" }}>{r.place ? <span><MapPin size={12} /> {r.place}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px", maxWidth: 320 }}>{r.address || "—"}</td>
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
