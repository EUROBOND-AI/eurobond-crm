import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const STAGES = [
  { key: "Review Pending", color: "#f59e0b" },
  { key: "Inprocess", color: "#4a7bff" },
  { key: "Completed", color: "#06b6d4" },
  { key: "Win", color: "#10b981" },
  { key: "Close", color: "#ef4444" },
];

export default function DealPipeline() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.list("enquiry").then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const move = async (r, status) => {
    try {
      const data = { ...r, status }; delete data._id;
      await api.update("enquiry", r._id, data);
      setRows((x) => x.map((y) => (y._id === r._id ? { ...y, status } : y)));
    } catch (e) { alert(e.message); }
  };

  const byStage = (k) => rows.filter((r) => (r.status || "Review Pending") === k);

  return (
    <div>
      <PageHead crumb="SFA / Pipeline" title="Deal Pipeline" actions={<button className="btn btn-soft" onClick={load}>Refresh</button>} />
      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(210px, 1fr))`, gap: 14, overflowX: "auto", paddingBottom: 10 }}>
          {STAGES.map((st) => {
            const items = byStage(st.key);
            const value = items.reduce((s, r) => s + (Number(r.value) || Number(r.amount) || 0), 0);
            return (
              <div key={st.key} style={{ background: "#f4f6fc", borderRadius: 16, padding: 12, minHeight: 400 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: `2.5px solid ${st.color}` }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: st.color }}>{st.key}</span>
                  <span style={{ background: st.color, color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 10, padding: "2px 9px" }}>{items.length}</span>
                </div>
                {value > 0 && <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, marginBottom: 10 }}>₹{value.toLocaleString("en-IN")}</div>}
                {items.map((r) => (
                  <div key={r._id} style={{ background: "#fff", borderRadius: 12, padding: "11px 12px", marginBottom: 9, boxShadow: "0 4px 12px rgba(40,50,100,.08)", borderLeft: `3px solid ${st.color}` }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 3 }}>{r.companyName || r.partyName || r.customer || r.name || "Enquiry"}</div>
                    {r.contactPerson && <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.contactPerson}</div>}
                    {(r.value || r.amount) && <div style={{ fontSize: 11.5, fontWeight: 700, color: st.color, marginTop: 3 }}>₹{Number(r.value || r.amount).toLocaleString("en-IN")}</div>}
                    <select value={r.status || "Review Pending"} onChange={(e) => move(r, e.target.value)}
                      style={{ width: "100%", marginTop: 7, padding: "5px 7px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 11, background: "#f8f9ff" }}>
                      {STAGES.map((s) => <option key={s.key}>{s.key}</option>)}
                    </select>
                  </div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center", padding: 20 }}>No deals</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
