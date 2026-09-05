import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { CARD, selS, StatBox, BarChart, Donut, MONTHS_SHORT, parseDate } from "./DashKit.jsx";

export default function ProjectDashboard() {
  const [proj, setProj] = useState(null);
  const [s2s, setS2s] = useState([]);
  const [sp2s, setSp2s] = useState([]);
  const [users, setUsers] = useState([]);
  const [side, setSide] = useState("Sales");     // Sales vs Specs projections
  const [fUser, setFUser] = useState("");
  const [fHod, setFHod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const show = () => {
    setShown(true); setProj(null);
    Promise.all([
      api.list("projectProjection", false).catch(() => ({ records: [] })),
      api.list("salesToSpec", false).catch(() => ({ records: [] })),
      api.list("specToSales", false).catch(() => ({ records: [] })),
    ]).then(([p, a, b]) => {
      setProj((p.records || []).map((r) => ({ _id: r.id, ...r.data })));
      setS2s((a.records || []).map((r) => ({ _id: r.id, ...r.data })));
      setSp2s((b.records || []).map((r) => ({ _id: r.id, ...r.data })));
    });
  };

  const inRange = (r) => {
    const d = parseDate(r.visitDate || r.createdAt);
    if (from && (!d || d < new Date(from))) return false;
    if (to && (!d || d > new Date(to + "T23:59:59"))) return false;
    return true;
  };

  const list = useMemo(() => {
    if (!proj) return [];
    return proj.filter((r) => {
      if (side === "Specs" ? !r.isSpec : !!r.isSpec) return false;
      if (fUser && (r.createdBy || "") !== fUser) return false;
      if (fHod && (r.hod || "") !== fHod) return false;
      return inRange(r);
    });
  }, [proj, side, fUser, fHod, from, to]);

  const cnt = (st) => list.filter((r) => String(r.status || "Open").toLowerCase() === st).length;
  const win = cnt("win"), lost = cnt("lost"), hold = cnt("hold");
  const open = list.length - win - lost - hold;
  const sqm = list.reduce((s, r) => s + (Number(r.sqmApproved || r.winSqm) || 0), 0);
  const sales = list.reduce((s, r) => s + (Number(r.winSales) || 0), 0);

  const byMonth = useMemo(() => {
    const m = {};
    list.forEach((r) => { const d = parseDate(r.visitDate || r.createdAt); if (d) { const k = MONTHS_SHORT[d.getMonth()] + " " + String(d.getFullYear()).slice(2); m[k] = (m[k] || 0) + 1; } });
    return Object.entries(m).slice(-12).map(([label, value]) => ({ label, value }));
  }, [list]);

  const byType = useMemo(() => {
    const m = {};
    list.forEach((r) => { const k = r.projectType || "—"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  }, [list]);

  const s2sList = s2s.filter(inRange), sp2sList = sp2s.filter(inRange);
  const st = (arr, s) => arr.filter((r) => String(r.status || "Pending").toLowerCase() === s).length;
  const hods = [...new Set(users.map((u) => u.manager).filter(Boolean))];

  return (
    <div>
      <PageHead title="Project Dashboard" crumb="Project Dashboard" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "inline-flex", background: "#eef1ff", borderRadius: 10, padding: 3 }}>
          {["Sales", "Specs"].map((t) => (
            <button key={t} onClick={() => setSide(t)} style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: side === t ? "var(--navy)" : "transparent", color: side === t ? "#fff" : "var(--navy)" }}>{t}</button>
          ))}
        </div>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selS} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selS} />
        <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={selS}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={selS}><option value="">All Users</option>{users.map((u) => <option key={u.name}>{u.name}</option>)}</select>
        <button className="btn btn-primary" style={{ padding: "9px 22px", fontWeight: 700 }} onClick={show}>Show</button>
      </div>

      {!shown ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Set filters and click <b>Show</b>.</div>
      : proj === null ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
      : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 20 }}>
            <StatBox label={`${side} Projects`} value={list.length} tone="#3949ab" />
            <StatBox label="Win" value={win} tone="#1f9d55" />
            <StatBox label="Open / Hold" value={`${open} / ${hold}`} tone="#e08600" />
            <StatBox label="Lost" value={lost} tone="#c0392b" />
            <StatBox label="Sq.Mtr Approved" value={sqm.toLocaleString("en-IN")} tone="#8854d0" />
            <StatBox label="Sales Value" value={"₹" + sales.toLocaleString("en-IN")} tone="#0b3c8c" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, marginBottom: 18 }}>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Projects — Month wise</h3>
              <BarChart data={byMonth} color="#3949ab" />
            </div>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Status Split</h3>
              <Donut data={[
                { label: "Win", value: win, color: "#1f9d55" },
                { label: "Open", value: open, color: "#3949ab" },
                { label: "Hold", value: hold, color: "#e08600" },
                { label: "Lost", value: lost, color: "#c0392b" },
              ]} />
            </div>
            <div style={{ ...CARD, gridColumn: "1 / -1" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Project Type</h3>
              <BarChart data={byType} color="#8854d0" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Sales → Specs ({s2sList.length})</h3>
              <Donut data={[
                { label: "Pending", value: st(s2sList, "pending"), color: "#e08600" },
                { label: "In Process", value: st(s2sList, "in process"), color: "#3949ab" },
                { label: "Approved", value: st(s2sList, "approved"), color: "#1f9d55" },
              ]} />
            </div>
            <div style={CARD}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Specs → Sales ({sp2sList.length})</h3>
              <Donut data={[
                { label: "Pending", value: st(sp2sList, "pending"), color: "#e08600" },
                { label: "In Process", value: st(sp2sList, "in process"), color: "#3949ab" },
                { label: "Win", value: st(sp2sList, "win"), color: "#1f9d55" },
              ]} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
