import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const COLORS = ["#4b5cf0", "#20bf6b", "#f0932b", "#eb3b5a", "#8854d0"];

export default function EnquiryDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.list("enquiry")
      .then((d) => setRows((d.records || []).map((r) => ({ ...r.data, _by: r.created_by_name || "—", _at: r.created_at }))))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stat = (s) => rows.filter((r) => r.status === s).length;
  const funnel = useMemo(() => ([
    { name: "Review Pending", value: stat("Review Pending") },
    { name: "Inprocess", value: stat("Inprocess") },
    { name: "Win", value: stat("Win") },
    { name: "Close", value: stat("Close") },
  ]), [rows]);

  const byUser = useMemo(() => {
    const m = {};
    rows.forEach((r) => { const k = r._by; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [rows]);

  const winRate = rows.length ? Math.round((stat("Win") / rows.length) * 100) : 0;

  return (
    <>
      <PageHead crumb="Analytics / Enquiry" title="Enquiry Dashboard" />
      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : err ? <div style={{ padding: 20, background: "#fdecec", color: "#c03636", borderRadius: 10 }}>{err}</div>
      : rows.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>
          <h3 style={{ marginBottom: 8 }}>No enquiries yet</h3>
          <p style={{ fontSize: 13.5 }}>Add enquiries from the Enquiry module or field app — live analytics will appear here.</p>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <StatCard label="Total Enquiries" value={rows.length} sub="All time" />
            <StatCard label="Inprocess" value={stat("Inprocess")} sub="Being worked" color="#f0932b" />
            <StatCard label="Win" value={stat("Win")} sub="Converted" color="#20bf6b" />
            <StatCard label="Win Rate" value={winRate + "%"} sub="Conversion" color="#4b5cf0" />
          </div>
          <div className="chart-grid">
            <div className="chart-card card-pad">
              <h4>Enquiry Funnel</h4>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={funnel} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {funnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend /><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card card-pad">
              <h4>Enquiries by User</h4>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byUser}>
                  <XAxis dataKey="name" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip /><Bar dataKey="count" fill="#4b5cf0" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

    </>
  );
}
