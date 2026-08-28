import { useEffect, useMemo, useState } from "react";
import { PageHead, StatCard, Pill } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { fmtKm } from "../lib/geo.js";

export default function UserReportCard() {
  const [users, setUsers] = useState([]);
  const [sel, setSel] = useState("");
  const [fZone, setFZone] = useState("");
  const [fCity, setFCity] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessions, setSessions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listUsers(), api.list("expense"), api.list("enquiry")])
      .then(([u, e, q]) => {
        setUsers((u.users || []).filter((x) => x.status == 1));
        setExpenses((e.records || []).map((r) => ({ ...r.data, _by: r.created_by_name })));
        setEnquiries((q.records || []).map((r) => ({ ...r.data, _by: r.created_by_name })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.attList(date).then((d) => setSessions(d.sessions || [])).catch(() => setSessions([]));
  }, [date]);

  const u = users.find((x) => String(x.id) === sel);
  const myExp = u ? expenses.filter((e) => e._by === u.name) : [];
  const myEnq = u ? enquiries.filter((e) => e._by === u.name) : [];
  const mySess = u ? sessions.filter((s) => s.user_id == u.id) : [];
  const expTotal = myExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const kmTotal = mySess.reduce((s, x) => s + (Number(x.distance_km) || 0), 0);

  return (
    <>
      <PageHead crumb="Analytics / User Report" title="User Report Card" />
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={fZone} onChange={(e) => { setFZone(e.target.value); setSel(""); }} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
          <option value="">All Zones</option>
          {[...new Set(users.map((u) => u.zone).filter(Boolean))].map((z) => <option key={z}>{z}</option>)}
        </select>
        <select value={fCity} onChange={(e) => { setFCity(e.target.value); setSel(""); }} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
          <option value="">All Cities</option>
          {[...new Set(users.map((u) => u.city).filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, minWidth: 220 }}>
          <option value="">— Select team member —</option>
          {users.filter((x) => (!fZone || x.zone === fZone) && (!fCity || x.city === fCity)).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.mobile})</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 }} />
      </div>

      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : !u ? <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>Select a team member to see their report card.</div>
      : (
        <>
          <div className="stat-row">
            <StatCard label="Attendance" value={mySess.length ? "Present" : "—"} sub={date} color={mySess.length ? "#20bf6b" : "#eb3b5a"} />
            <StatCard label="Distance" value={fmtKm(kmTotal)} sub={"on " + date} />
            <StatCard label="Enquiries" value={myEnq.length} sub="All time" color="#f0932b" />
            <StatCard label="Expenses" value={"₹" + expTotal.toLocaleString("en-IN")} sub={myExp.length + " claims"} color="#8854d0" />
          </div>

          <div className="chart-card card-pad" style={{ marginBottom: 16 }}>
            <h4>Attendance sessions — {date}</h4>
            {mySess.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>No attendance on this date.</p> : (
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Start</th><th>End</th><th>Distance</th><th>GPS Points</th><th>Status</th></tr></thead>
                <tbody>
                  {mySess.map((s) => (
                    <tr key={s.id}>
                      <td>{s.start_time ? new Date(s.start_time).toLocaleTimeString("en-IN") : "—"}</td>
                      <td>{s.end_time ? new Date(s.end_time).toLocaleTimeString("en-IN") : "Running"}</td>
                      <td>{fmtKm(Number(s.distance_km) || 0)}</td>
                      <td>{s.points_count}</td>
                      <td><Pill status={s.status === "DONE" ? "Completed" : "Pending"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="chart-card card-pad">
            <h4>Recent expenses</h4>
            {myExp.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>No expenses submitted.</p> : (
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {myExp.slice(0, 10).map((e, i) => (
                    <tr key={i}>
                      <td>{e.createdAt || "—"}</td><td>{e.type || "—"}</td><td>{e.category || "—"}</td>
                      <td>₹{Number(e.amount || 0).toLocaleString("en-IN")}</td>
                      <td><Pill status={e.status || "Pending"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </>
      )}

    </>
  );
}
