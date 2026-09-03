import { useEffect, useMemo, useState } from "react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const monthKey = (dateStr) => {
  const d = new Date(dateStr); const m = d.getMonth(); // 0=Jan
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m];
};
/* financial year of a date (Apr-Mar). Returns the starting year. */
const fyOf = (dateStr) => { const d = new Date(dateStr); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };

export default function TourReport() {
  const [sessions, setSessions] = useState(null);
  const [users, setUsers] = useState([]);
  const [fy, setFy] = useState(() => { const n = new Date(); return n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; });
  const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState("");
  const [fUser, setFUser] = useState("");
  const [fArea, setFArea] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {});
  }, []);

  const runShow = () => {
    setShown(true); setSessions(null);
    const from = `${fy}-04-01`, to = `${fy + 1}-03-31`;
    api.attList(from, to).then((d) => setSessions(d.rows || d.sessions || [])).catch(() => setSessions([]));
  };

  /* each session: user, work_date, visit_type (ExStation/Outstation/Local), visit_name (areas, comma-sep) */
  const filtered = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter((s) => {
      if (fState && (s.state || "") !== fState) return false;
      if (fHod && (s.manager || s.hod || "") !== fHod) return false;
      if (fUser && (s.name || s.user || "") !== fUser) return false;
      return true;
    });
  }, [sessions, fState, fHod, fUser]);

  /* explode areas: one session may have 2-3 areas -> each counts once */
  const areaRows = useMemo(() => {
    const out = [];
    filtered.forEach((s) => {
      const areas = String(s.visit_name || "").split(",").map((a) => a.trim()).filter(Boolean);
      const list = areas.length ? areas : ["(no area)"];
      list.forEach((area) => out.push({ area, month: monthKey(s.work_date), type: s.visit_type || "Local", user: s.name || s.user }));
    });
    return out;
  }, [filtered]);

  const areaFiltered = fArea ? areaRows.filter((r) => r.area === fArea) : areaRows;

  /* summary boxes */
  const totalVisits = areaFiltered.length;
  const exStation = areaFiltered.filter((r) => /ex/i.test(r.type)).length;
  const outStation = areaFiltered.filter((r) => /out/i.test(r.type)).length;
  const uniqueAreas = new Set(areaFiltered.map((r) => r.area)).size;

  /* month-wise table */
  const monthTable = useMemo(() => {
    const rows = MONTHS.map((m) => {
      const inM = areaFiltered.filter((r) => r.month === m);
      const ex = inM.filter((r) => /ex/i.test(r.type)).length;
      const out = inM.filter((r) => /out/i.test(r.type)).length;
      return { month: m, ex, out, count: inM.length };
    });
    const grand = rows.reduce((s, r) => s + r.count, 0) || 1;
    return { rows, grand };
  }, [areaFiltered]);

  const allAreas = useMemo(() => [...new Set(areaRows.map((r) => r.area))].sort(), [areaRows]);
  const states = [...new Set(users.map((u) => u.state).filter(Boolean))].sort();
  const hods = users.filter((u) => `${u.role || ""} ${u.designation || ""}`.toLowerCase().includes("hod")).map((u) => u.name);
  const userNames = users.map((u) => u.name);

  const exportExcel = () => {
    const head = "Month,Ex Station,Out-Station,Tour Count,%\n";
    const body = monthTable.rows.map((r) => `${r.month},${r.ex},${r.out},${r.count},${((r.count / monthTable.grand) * 100).toFixed(1)}%`).join("\n");
    const totalEx = monthTable.rows.reduce((s, r) => s + r.ex, 0);
    const totalOut = monthTable.rows.reduce((s, r) => s + r.out, 0);
    const foot = `\nTotal,${totalEx},${totalOut},${monthTable.grand},100%`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([head + body + foot], { type: "text/csv" }));
    a.download = `tour-report-${fy}-${fy + 1}.csv`; a.click();
  };

  const totalEx = monthTable.rows.reduce((s, r) => s + r.ex, 0);
  const totalOut = monthTable.rows.reduce((s, r) => s + r.out, 0);

  return (
    <div>
      <PageHead title="Tour Report" crumb="Tour Report" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))} style={sel}>
          {[0, 1, 2, 3].map((o) => { const y = new Date().getFullYear() - o; return <option key={y} value={y}>{y}-{String(y + 1).slice(2)}</option>; })}
        </select>
        <select value={fState} onChange={(e) => setFState(e.target.value)} style={sel}><option value="">All States</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={sel}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={sel}><option value="">All Users</option>{userNames.map((u) => <option key={u}>{u}</option>)}</select>
        {shown && allAreas.length > 0 && <select value={fArea} onChange={(e) => setFArea(e.target.value)} style={sel}><option value="">All Areas</option>{allAreas.map((a) => <option key={a}>{a}</option>)}</select>}
        <button className="btn btn-primary" style={{ padding: "8px 20px", fontWeight: 700 }} onClick={runShow}>Show</button>
        {shown && <button className="btn" onClick={exportExcel}>Export</button>}
      </div>

      {!shown ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Set filters and click <b>Show</b>.</div>
      ) : sessions === null ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Total Area Visits" value={totalVisits} />
            <StatCard label="Ex Station" value={exStation} />
            <StatCard label="Out-Station" value={outStation} />
            <StatCard label="Unique Areas" value={uniqueAreas} />
          </div>

          <h3 style={{ margin: "0 0 10px" }}>Monthwise Tour Details</h3>
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f0f2fa" }}>
                  {["Month", "Ex Station", "Out-Station", "Tour Count", "%"].map((h) => <th key={h} style={thc}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {monthTable.rows.map((r) => (
                  <tr key={r.month} style={{ borderTop: "1px solid #eef0f6" }}>
                    <td style={tdc}><b>{r.month}</b></td><td style={tdc}>{r.ex}</td><td style={tdc}>{r.out}</td>
                    <td style={tdc}>{r.count}</td><td style={tdc}>{((r.count / monthTable.grand) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #d7dcef", background: "#f7f9ff", fontWeight: 800 }}>
                  <td style={tdc}>Total</td><td style={tdc}>{totalEx}</td><td style={tdc}>{totalOut}</td><td style={tdc}>{monthTable.grand}</td><td style={tdc}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
const sel = { padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };
const thc = { padding: "10px 12px", textAlign: "left", fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap" };
const tdc = { padding: "9px 12px", borderRight: "1px solid #f4f6fc" };
