import { useEffect, useMemo, useState } from "react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { scopeRows, visibleUsers } from "../lib/scope.js";

const sel = { padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12.5, background: "#fff" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12.5, borderTop: "1px solid #f0f2f8" };

export default function BiltraxDashboard() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fType, setFType] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {});
  }, []);

  const show = async () => {
    setBusy(true); setShown(true);
    try {
      const [d, uu] = await Promise.all([api.list("biltrax", false), api.listUsers().catch(() => ({ users: [] }))]);
      setRows(scopeRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })), uu.users || [],
        ["createdBy", "assignPerson", "hod"]));
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const list = useMemo(() => rows.filter((r) =>
    (!fState || r.state === fState) && (!fHod || r.hod === fHod) &&
    (!fPerson || r.assignPerson === fPerson) && (!fType || (r.biltraxType || "Requested") === fType)
  ), [rows, fState, fHod, fPerson, fType]);

  const stage = (r) => (r.status === "Win" ? "Win" : (r.assignPerson ? "Processing" : "Draft"));

  const stats = useMemo(() => {
    const won = list.filter((r) => r.status === "Win");
    return {
      total: list.length,
      draft: list.filter((r) => stage(r) === "Draft").length,
      processing: list.filter((r) => stage(r) === "Processing").length,
      won: won.length,
      sqm: won.reduce((s, r) => s + (Number(r.winSqm) || 0), 0),
      amount: won.reduce((s, r) => s + (Number(r.winAmount) || 0), 0),
      appointment: list.filter((r) => r.biltraxType === "Appointment").length,
    };
  }, [list]);

  /* per-person split — who is holding how many, and what has been won */
  const byPerson = useMemo(() => {
    const m = {};
    list.forEach((r) => {
      const k = r.assignPerson || "— Unassigned —";
      if (!m[k]) m[k] = { name: k, hod: r.hod || "", total: 0, draft: 0, processing: 0, won: 0, sqm: 0, amount: 0 };
      m[k].total++;
      m[k][stage(r).toLowerCase()]++;
      if (r.status === "Win") { m[k].sqm += Number(r.winSqm) || 0; m[k].amount += Number(r.winAmount) || 0; }
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [list]);

  const states = [...new Set(rows.map((r) => r.state).filter(Boolean))].sort();
  const hods = [...new Set(rows.map((r) => r.hod).filter(Boolean))].sort();
  const persons = [...new Set(rows.map((r) => r.assignPerson).filter(Boolean))].sort();

  return (
    <div>
      <PageHead crumb="Dashboards" title="Biltrax Dashboard" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16, background: "#fff", padding: 12, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <select value={fType} onChange={(e) => setFType(e.target.value)} style={sel}>
          <option value="">All Types</option><option>Requested</option><option>Appointment</option>
        </select>
        <select value={fState} onChange={(e) => setFState(e.target.value)} style={sel}>
          <option value="">All States</option>{states.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={sel}>
          <option value="">All HOD</option>{hods.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={fPerson} onChange={(e) => setFPerson(e.target.value)} style={sel}>
          <option value="">All Persons</option>{persons.map((x) => <option key={x}>{x}</option>)}
        </select>
        <button className="btn btn-primary" style={{ padding: "8px 22px", fontWeight: 700 }} onClick={show} disabled={busy}>
          {busy ? "Loading…" : "Show"}
        </button>
      </div>

      {!shown ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
          Choose your filters and click <b>Show</b>.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 12, marginBottom: 18 }}>
            <StatCard label="Total Projects" value={stats.total} />
            <StatCard label="Draft" value={stats.draft} />
            <StatCard label="Processing" value={stats.processing} />
            <StatCard label="Won" value={stats.won} />
            <StatCard label="Appointments" value={stats.appointment} />
            <StatCard label="Won Sq. Meter" value={stats.sqm.toLocaleString("en-IN")} />
            <StatCard label="Won Amount" value={"₹" + stats.amount.toLocaleString("en-IN")} />
          </div>

          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f7f9ff" }}>
                <tr>{["Person", "HOD", "Total", "Draft", "Processing", "Won", "Won Sq.Mtr", "Won Amount"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {byPerson.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No projects match these filters.</td></tr>
                ) : byPerson.map((p) => (
                  <tr key={p.name}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.name}</td>
                    <td style={td}>{p.hod || "—"}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{p.total}</td>
                    <td style={td}>{p.draft}</td>
                    <td style={td}>{p.processing}</td>
                    <td style={{ ...td, color: "#0f7a44", fontWeight: 700 }}>{p.won}</td>
                    <td style={td}>{p.sqm.toLocaleString("en-IN")}</td>
                    <td style={td}>₹{p.amount.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
