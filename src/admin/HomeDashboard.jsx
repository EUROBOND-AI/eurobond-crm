import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";
import { Users, FileText, Wallet, Target, Building2, CalendarCheck, TrendingUp, MapPin } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const C = {
  blue: "#4a7bff", violet: "#8b5cf6", green: "#10b981", amber: "#f59e0b",
  pink: "#ec4899", cyan: "#06b6d4", indigo: "#6366f1", red: "#ef4444",
};

function Kpi({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 18, padding: "20px 22px", position: "relative", overflow: "hidden",
      boxShadow: "0 10px 24px rgba(40,50,100,.13), 0 2px 6px rgba(40,50,100,.08)",
      borderTop: `4px solid ${color}`, transition: "transform .16s, box-shadow .16s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 18px 40px rgba(40,50,100,.22)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 24px rgba(40,50,100,.13), 0 2px 6px rgba(40,50,100,.08)"; }}>
      <div style={{ position: "absolute", right: -20, top: -20, width: 90, height: 90, borderRadius: "50%", background: color, opacity: 0.12 }} />
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color, display: "grid", placeItems: "center", color: "#fff", marginBottom: 12, boxShadow: `0 8px 18px ${color}66` }}>{icon}</div>
      <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children, right }) {
  return (
    <div style={{ background: "#fff", borderRadius: 18, padding: "18px 20px", boxShadow: "0 10px 24px rgba(40,50,100,.10)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontFamily: "var(--font-display)" }}>{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function HomeDashboard() {
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const safe = (p) => p.then((r) => r).catch(() => ({ records: [] }));
      const [enq, cust, exp, leave, target, proj, att] = await Promise.all([
        safe(api.list("enquiry")), safe(api.list("followup")), safe(api.list("expense")),
        safe(api.list("leave")), safe(api.list("target")), safe(api.list("projectProjection")),
        safe(api.attList ? api.attList(new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)) : Promise.resolve({ sessions: [] })),
      ]);
      const enqR = (enq.records || []).map((r) => r.data || r);
      const custR = (cust.records || []).map((r) => r.data || r);
      const expR = (exp.records || []).map((r) => r.data || r);
      const leaveR = (leave.records || []).map((r) => r.data || r);
      const projR = (proj.records || []).map((r) => r.data || r);
      const sessions = att.sessions || [];

      const expTotal = expR.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const expPending = expR.filter((r) => (r.status || "") === "Submitted").reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const enqWin = enqR.filter((r) => (r.status || "") === "Win").length;
      const winRate = enqR.length ? Math.round((enqWin / enqR.length) * 100) : 0;

      // enquiry by status
      const byStatus = {};
      enqR.forEach((r) => { const k = r.status || "Review Pending"; byStatus[k] = (byStatus[k] || 0) + 1; });
      const enqPie = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

      // project by status
      const projByStatus = {};
      projR.forEach((r) => { const k = r.status || "Running"; projByStatus[k] = (projByStatus[k] || 0) + 1; });
      const projBars = Object.entries(projByStatus).map(([name, value]) => ({ name, value }));

      // expense by category
      const byCat = {};
      expR.forEach((r) => { const k = r.category || "Other"; byCat[k] = (byCat[k] || 0) + (Number(r.amount) || 0); });
      const expBars = Object.entries(byCat).map(([name, value]) => ({ name, value })).slice(0, 6);

      setD({
        enqCount: enqR.length, custCount: custR.length, expTotal, expPending,
        leaveCount: leaveR.filter((r) => (r.status || "") === "Pending").length,
        projCount: projR.length, winRate,
        presentToday: sessions.filter((s) => s.status === "RUNNING" || s.status === "DONE").length,
        totalKm: sessions.reduce((s, x) => s + (Number(x.distance_km) || 0), 0),
        enqPie, projBars, expBars,
      });
    })();
  }, []);

  if (!d) return (
    <div>
      <PageHead crumb="Analytics" title="Dashboard" />
      <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>Loading analytics…</div>
    </div>
  );

  const PIE_COLORS = [C.amber, C.blue, C.green, C.violet, C.red, C.cyan];

  return (
    <div>
      <div className="print-title">Eurobond CRM — Business Dashboard · {new Date().toLocaleDateString("en-IN")}</div>
      <PageHead crumb="Analytics" title="Business Dashboard" actions={<button className="btn btn-soft no-print" onClick={() => window.print()}>🖨 Print / PDF</button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Kpi icon={<FileText size={22} />} label="Total Enquiries" value={d.enqCount} sub={`${d.winRate}% win rate`} color={C.blue} />
        <Kpi icon={<Users size={22} />} label="Customers" value={d.custCount} sub="In directory" color={C.violet} />
        <Kpi icon={<Wallet size={22} />} label="Expenses" value={"₹" + d.expTotal.toLocaleString("en-IN")} sub={"₹" + d.expPending.toLocaleString("en-IN") + " pending"} color={C.green} />
        <Kpi icon={<Building2 size={22} />} label="Projects" value={d.projCount} sub="Projections" color={C.amber} />
        <Kpi icon={<CalendarCheck size={22} />} label="Present Today" value={d.presentToday} sub="Field staff" color={C.pink} />
        <Kpi icon={<MapPin size={22} />} label="KM Today" value={d.totalKm.toFixed(1)} sub="Distance covered" color={C.cyan} />
        <Kpi icon={<Target size={22} />} label="Pending Leaves" value={d.leaveCount} sub="Awaiting approval" color={C.indigo} />
        <Kpi icon={<TrendingUp size={22} />} label="Win Rate" value={d.winRate + "%"} sub="Enquiry conversion" color={C.red} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel title="Enquiries by Status">
          {d.enqPie.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={d.enqPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {d.enqPie.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Projects by Status">
          {d.projBars.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.projBars}>
                <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {d.projBars.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Expense by Category (₹)">
        {d.expBars.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d.expBars}>
              <defs>
                <linearGradient id="expg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.violet} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={C.violet} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
              <Area type="monotone" dataKey="value" stroke={C.violet} strokeWidth={2.5} fill="url(#expg)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No data yet</div>;
}
