import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const COLORS = ["#4b5cf0", "#20bf6b", "#f0932b", "#eb3b5a", "#8854d0"];

export default function EnquiryDashboard() {
  const [all, setAll] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [fZone, setFZone] = useState("");
  const [fHod, setFHod] = useState("");
  const [fUser, setFUser] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  useEffect(() => {
    api.list("enquiry")
      .then((d) => setAll((d.records || []).map((r) => ({ ...r.data, _by: r.created_by_name || "—", _at: r.created_at }))))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {});
  }, []);

  /* who belongs to which zone / HOD — resolved from the app users list */
  const userMap = useMemo(() => {
    const m = {};
    users.forEach((u) => { if (u.name) m[u.name] = u; });
    return m;
  }, [users]);

  const rows = useMemo(() => all.filter((r) => {
    const person = r.passto || r.assignedTo || r._by || "";
    const u = userMap[person];
    if (fUser && person !== fUser) return false;
    if (fHod && (r.hod || (u && u.manager) || "") !== fHod) return false;
    if (fZone && (u ? (u.zone || "") : "") !== fZone) return false;
    if (fFrom || fTo) {
      const d = r._at ? new Date(r._at) : null;
      if (fFrom && (!d || d < new Date(fFrom))) return false;
      if (fTo && (!d || d > new Date(fTo + "T23:59:59"))) return false;
    }
    return true;
  }), [all, userMap, fZone, fHod, fUser, fFrom, fTo]);

  const zones = useMemo(() => [...new Set(users.map((u) => u.zone).filter(Boolean))].sort(), [users]);
  const hods = useMemo(() => [...new Set(users.map((u) => u.manager).filter(Boolean))].sort(), [users]);
  const selS = { padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12.5, background: "#fff" };

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
      {/* filters: zone / HOD / user / date */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16, background: "#fff", padding: 12, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <select value={fZone} onChange={(e) => setFZone(e.target.value)} style={selS}>
          <option value="">All Zones</option>{zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={selS}>
          <option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}
        </select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={selS}>
          <option value="">All Users</option>{users.map((u) => <option key={u.name}>{u.name}</option>)}
        </select>
        <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={selS} />
        <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={selS} />
        {(fZone || fHod || fUser || fFrom || fTo) && (
          <button className="btn btn-ghost" onClick={() => { setFZone(""); setFHod(""); setFUser(""); setFFrom(""); setFTo(""); }}>Clear</button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>{rows.length} enquiries</span>
      </div>
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
