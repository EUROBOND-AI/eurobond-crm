import { useEffect, useMemo, useState } from "react";
import { Users, Search, RefreshCw, Phone, MapPin } from "lucide-react";
import { api } from "../lib/api.js";

/* ---------------------------------------------------------------------------
   Customers (admin) — follow-up entries nunchi automatic ga aggregate ayina
   customer directory. Separate data entry ledu; sales team follow-ups ye source.
--------------------------------------------------------------------------- */
export default function CustomersPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("All");
  const [busy, setBusy] = useState(false);

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
    return l;
  }, [rows, q, typeF]);

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>SFA</div>
          <h2 style={{ fontFamily: "Bricolage Grotesque", fontSize: 22, fontWeight: 800, margin: "2px 0 0" }}>
            Customers {rows && <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>· {list.length} of {rows.length}</span>}
          </h2>
        </div>
        <button className="btn-ghost" onClick={load} disabled={busy} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <RefreshCw size={14} className={busy ? "spin" : ""} /> Refresh
        </button>
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

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                {["Customer", "Mobile", "Type", "Place", "Follow-ups", "Last Follow-up", "By"].map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={7} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  <Users size={30} style={{ opacity: 0.4 }} /><br />No customers yet — follow-up entries ikkada customers ga vastayi.
                </td></tr>
              ) : list.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    {r.mobile ? <a href={`tel:${r.mobile}`} style={{ color: "var(--accent)", textDecoration: "none", display: "inline-flex", gap: 5, alignItems: "center" }}><Phone size={12} />{r.mobile}</a> : "—"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>{r.type ? <span style={{ fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{r.type}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px" }}>{r.place ? <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><MapPin size={12} color="var(--muted)" />{r.place}</span> : "—"}</td>
                  <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700 }}>{r.followups}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap", color: "var(--muted)" }}>{(r.last_followup || "").slice(0, 16)}</td>
                  <td style={{ padding: "11px 14px", color: "var(--muted)" }}>{r.by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
