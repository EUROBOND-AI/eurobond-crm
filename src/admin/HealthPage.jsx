import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errLog, setErrLog] = useState(() => { try { return JSON.parse(localStorage.getItem("eb_error_log") || "[]"); } catch { return []; } });

  const run = () => {
    setLoading(true);
    try { setErrLog(JSON.parse(localStorage.getItem("eb_error_log") || "[]")); } catch {}
    api.healthCheck().then((d) => setData(d)).catch((e) => setData({ error: e.message, checks: [] })).finally(() => setLoading(false));
  };
  useEffect(() => { run(); }, []);

  const pct = data && data.total ? Math.round((data.ok / data.total) * 100) : 0;
  const barColor = pct >= 90 ? "#1f9d55" : pct >= 60 ? "#e08600" : "#c0392b";

  return (
    <div>
      <PageHead title="System Health & Diagnostics" crumb="System Health" />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={run} disabled={loading}>{loading ? "Checking…" : "🔄 Run Check"}</button>
        {data && !data.error && <span style={{ color: "var(--muted)", fontSize: 12.5 }}>Server time: {data.server_time}</span>}
      </div>

      {data && !data.error && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "var(--shadow)", marginBottom: 16, maxWidth: 720 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
            <span>Overall Health</span><span style={{ color: barColor }}>{data.ok}/{data.total} OK ({pct}%)</span>
          </div>
          <div style={{ height: 10, background: "#eef1f8", borderRadius: 6, overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: barColor }} /></div>
        </div>
      )}

      {data === null ? <div style={{ padding: 30, color: "var(--muted)" }}>Loading…</div>
      : data.error ? <div style={{ padding: 20, background: "#fdecec", color: "#c03636", borderRadius: 12, fontWeight: 600 }}>Error: {data.error}</div>
      : (
        <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
          {data.checks.map((c, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 10, padding: "12px 14px", boxShadow: "var(--shadow)", borderLeft: `4px solid ${c.ok ? "#1f9d55" : "#c0392b"}` }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.ok ? "✅" : "❌"} {c.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{c.detail}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: c.ok ? "#1f9d55" : "#c0392b" }}>{c.ok ? "OK" : "ISSUE"}</span>
            </div>
          ))}

          {/* runtime errors captured from the app/admin (same as F12 console) */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Recent Errors ({errLog.length})</h3>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => { try { localStorage.removeItem("eb_error_log"); } catch {} setErrLog([]); }}>Clear</button>
            </div>
            {errLog.length === 0 ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 14, fontSize: 13, color: "#1f7a44", fontWeight: 600 }}>✅ No errors recorded. Everything is working.</div>
            ) : errLog.slice().reverse().map((e, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 13px", marginBottom: 6, boxShadow: "var(--shadow)", borderLeft: "4px solid #e08600" }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: "#c0392b" }}>{e.type}</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>{e.msg}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{e.page} {e.extra ? "· " + e.extra : ""} · {String(e.at).slice(0, 19).replace("T", " ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
