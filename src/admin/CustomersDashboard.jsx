import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { CARD, selS, StatBox, BarChart, Donut, MONTHS_SHORT, parseDate } from "./DashKit.jsx";

export default function CustomersDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [fUser, setFUser] = useState("");
  const [fHod, setFHod] = useState("");
  const [fState, setFState] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const show = () => {
    setShown(true); setRows(null);
    api.customers().then((d) => setRows(d.customers || d.rows || [])).catch(() => setRows([]));
  };

  const list = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (fUser && (r.by || "") !== fUser) return false;
      if (fHod && (r.hod || "") !== fHod) return false;
      if (fState && (r.state || "") !== fState) return false;
      const d = parseDate(r.last_followup);
      if (from && (!d || d < new Date(from))) return false;
      if (to && (!d || d > new Date(to + "T23:59:59"))) return false;
      return true;
    });
  }, [rows, fUser, fHod, fState, from, to]);

  /* new customers = 1 entry; repeat/follow-up = more than 1 */
  const newCust = list.filter((r) => (Number(r.followups) || 1) <= 1).length;
  const repeat = list.filter((r) => (Number(r.followups) || 1) > 1).length;
  const totalEntries = list.reduce((s, r) => s + (Number(r.followups) || 0), 0);

  const byMonth = useMemo(() => {
    const m = {};
    list.forEach((r) => { const d = parseDate(r.last_followup); if (d) { const k = MONTHS_SHORT[d.getMonth()] + " " + String(d.getFullYear()).slice(2); m[k] = (m[k] || 0) + 1; } });
    return Object.entries(m).slice(-12).map(([label, value]) => ({ label, value }));
  }, [list]);

  const byPerson = useMemo(() => {
    const m = {};
    list.forEach((r) => { const k = r.by || "—"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  }, [list]);

  const hods = [...new Set(users.map((u) => u.manager).filter(Boolean))];
  const states = [...new Set((rows || []).map((r) => r.state).filter(Boolean))];

  return (
    <div>
      <PageHead title="Customers Dashboard" crumb="Customers Dashboard" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selS} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selS} />
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={selS}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={selS}><option value="">All Users</option>{users.map((u) => <option key={u.name}>{u.name}</option>)}</select>
        <select value={fState} onChange={(e) => setFState(e.target.value)} style={selS}><option value="">All States</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn btn-primary" style={{ padding: "9px 22px", fontWeight: 700 }} onClick={show}>Show</button>
      </div>

      {!shown ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Set filters and click <b>Show</b>.</div>
      : rows === null ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
      : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 20 }}>
            <StatBox label="Total Customers" value={list.length} tone="#3949ab" />
            <StatBox label="New Customers" value={newCust} sub="single entry" tone="#1f9d55" />
            <StatBox label="Repeat / Follow-up" value={repeat} sub="more than one entry" tone="#e08600" />
            <StatBox label="Total Entries" value={totalEntries} tone="#8854d0" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Customers Added — Month wise</h3>
              <BarChart data={byMonth} color="#3949ab" />
            </div>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>New vs Repeat</h3>
              <Donut data={[{ label: "New", value: newCust, color: "#1f9d55" }, { label: "Repeat", value: repeat, color: "#e08600" }]} />
            </div>
            <div style={{ ...CARD, gridColumn: "1 / -1" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Top Users — Customers Added</h3>
              <BarChart data={byPerson} color="#8854d0" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
