import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { CARD, selS, StatBox, BarChart, Donut } from "./DashKit.jsx";

export default function TargetDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [type, setType] = useState("Sales");
  const [fUser, setFUser] = useState("");
  const [fHod, setFHod] = useState("");
  const [period, setPeriod] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const show = () => {
    setShown(true); setRows(null);
    api.list("target", false).then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => setRows([]));
  };

  const list = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (type && String(r.targetType || "").toLowerCase() !== type.toLowerCase()) return false;
      if (fUser && (r.user || "") !== fUser) return false;
      if (fHod && (r.hod || "") !== fHod) return false;
      if (period && !String(r.period || "").toLowerCase().includes(period.toLowerCase())) return false;
      return true;
    });
  }, [rows, type, fUser, fHod, period]);

  const tgt = list.reduce((s, r) => s + (Number(r.target) || 0), 0);
  const ach = list.reduce((s, r) => s + (Number(r.achieved) || 0), 0);
  const pct = tgt ? Math.round((ach / tgt) * 100) : 0;
  const unit = type === "Sales" ? "₹" : "";
  const fmt = (v) => unit + Number(v).toLocaleString("en-IN") + (type === "Specs" ? " Sq.Mtr" : "");

  const byPerson = useMemo(() => {
    const m = {};
    list.forEach((r) => { const k = r.user || "—"; m[k] = (m[k] || 0) + (Number(r.achieved) || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  }, [list]);

  const byPeriod = useMemo(() => {
    const m = {};
    list.forEach((r) => { const k = r.period || "—"; m[k] = (m[k] || 0) + (Number(r.achieved) || 0); });
    return Object.entries(m).slice(-12).map(([label, value]) => ({ label, value }));
  }, [list]);

  const achievers = list.filter((r) => Number(r.target) > 0 && Number(r.achieved) >= Number(r.target)).length;
  const behind = list.filter((r) => Number(r.target) > 0 && Number(r.achieved) < Number(r.target)).length;
  const hods = [...new Set(users.map((u) => u.manager).filter(Boolean))];

  return (
    <div>
      <PageHead title="Target Dashboard" crumb="Target Dashboard" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "inline-flex", background: "#eef1ff", borderRadius: 10, padding: 3 }}>
          {["Sales", "Specs"].map((t) => (
            <button key={t} onClick={() => setType(t)} style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: type === t ? "var(--navy)" : "transparent", color: type === t ? "#fff" : "var(--navy)" }}>{t}</button>
          ))}
        </div>
        <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period (e.g. Aug 2026)" style={selS} />
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={selS}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={selS}><option value="">All Users</option>{users.map((u) => <option key={u.name}>{u.name}</option>)}</select>
        <button className="btn btn-primary" style={{ padding: "9px 22px", fontWeight: 700 }} onClick={show}>Show</button>
      </div>

      {!shown ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Set filters and click <b>Show</b>.</div>
      : rows === null ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
      : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 20 }}>
            <StatBox label={`Target (${type})`} value={fmt(tgt)} tone="#3949ab" />
            <StatBox label="Achieved" value={fmt(ach)} tone="#1f9d55" />
            <StatBox label="Achievement" value={pct + "%"} tone={pct >= 100 ? "#1f9d55" : pct >= 60 ? "#e08600" : "#c0392b"} />
            <StatBox label="Targets Met" value={`${achievers} / ${achievers + behind}`} sub={`${behind} behind`} tone="#8854d0" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Achievement — Period wise</h3>
              <BarChart data={byPeriod} color="#1f9d55" money={type === "Sales"} />
            </div>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Target vs Achieved</h3>
              <Donut data={[
                { label: "Achieved", value: Math.min(ach, tgt), color: "#1f9d55" },
                { label: "Pending", value: Math.max(0, tgt - ach), color: "#e6eaf5" },
              ]} />
            </div>
            <div style={{ ...CARD, gridColumn: "1 / -1" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Top Performers</h3>
              <BarChart data={byPerson} color="#3949ab" money={type === "Sales"} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
