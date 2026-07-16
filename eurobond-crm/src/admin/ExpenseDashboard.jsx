import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const COLORS = ["#4b5cf0", "#f0932b", "#20bf6b", "#eb3b5a", "#8854d0", "#0fb9b1"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function ExpenseDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.list("expense")
      .then((d) => setRows((d.records || []).map((r) => ({ ...r.data, _by: r.created_by_name, _at: r.created_at }))))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const by = (st) => rows.filter((r) => r.status === st);
    const sum = (list) => list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return {
      total, count: rows.length,
      pending: sum(by("Pending")), pendingN: by("Pending").length,
      approved: sum(by("Approved")), approvedN: by("Approved").length,
      rejected: sum(by("Rejected").concat(by("Reject"))), paid: sum(by("Paid")),
    };
  }, [rows]);

  const monthly = useMemo(() => {
    const m = Array.from({ length: 12 }, (_, i) => ({ name: MONTHS[i], amount: 0 }));
    rows.forEach((r) => {
      const d = new Date(r._at || Date.now());
      if (!isNaN(d)) m[d.getMonth()].amount += Number(r.amount) || 0;
    });
    return m;
  }, [rows]);

  const byCategory = useMemo(() => {
    const map = {};
    rows.forEach((r) => { const k = r.category || "Other"; map[k] = (map[k] || 0) + (Number(r.amount) || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [rows]);

  return (
    <>
      <PageHead crumb="Analytics / Expense" title="Expense Dashboard" />
      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : err ? <div style={{ padding: 20, background: "#fdecec", color: "#c03636", borderRadius: 10 }}>{err}</div>
      : rows.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>
          <h3 style={{ marginBottom: 8 }}>No expense data yet</h3>
          <p style={{ fontSize: 13.5 }}>When your team submits expenses from the field app, live analytics will appear here.</p>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <StatCard label="Total Claimed" value={"₹" + stats.total.toLocaleString("en-IN")} sub={stats.count + " claims"} />
            <StatCard label="Pending" value={"₹" + stats.pending.toLocaleString("en-IN")} sub={stats.pendingN + " claims"} color="#f0932b" />
            <StatCard label="Approved" value={"₹" + stats.approved.toLocaleString("en-IN")} sub={stats.approvedN + " claims"} color="#20bf6b" />
            <StatCard label="Paid" value={"₹" + stats.paid.toLocaleString("en-IN")} sub="Settled" color="#4b5cf0" />
            <StatCard label="Rejected" value={"₹" + stats.rejected.toLocaleString("en-IN")} sub="Not approved" color="#eb3b5a" />
          </div>

          <div className="chart-grid">
            <div className="chart-card card-pad">
              <h4>Monthly Expense Trend ({new Date().getFullYear()})</h4>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthly}>
                  <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} />
                  <Tooltip formatter={(v) => "₹" + Number(v).toLocaleString("en-IN")} />
                  <Area type="monotone" dataKey="amount" stroke="#4b5cf0" fill="#e4e8ff" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card card-pad">
              <h4>Category-wise Split</h4>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend /><Tooltip formatter={(v) => "₹" + Number(v).toLocaleString("en-IN")} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

    </>
  );
}
