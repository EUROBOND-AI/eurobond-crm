/* Target Dashboard — target against achieved, Sales in rupees and Specs in
   square metres. The clock counts down to the end of the month, and under it
   sits what still has to come in each day to close the gap. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { scopeRows, userByName } from "../lib/scope.js";
import {
  DxPage, KpiCard, Panel, WeekBars, HalfDonut, RankBars, ShowGate, RefreshBtn, LiveClock, useNow,
  usePlaceFilter, NightList, money, num, pct, fmtInt, ORD,
} from "../components/dash.jsx";

const MS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/* "Aug 2026", "August 2026", "2026-08", "08/2026" — a sortable number, or null */
export function periodKey(p) {
  const s = String(p || "").trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return +m[1] * 12 + (+m[2] - 1);
  m = s.match(/^(\d{1,2})[/\-](\d{4})/);
  if (m) return +m[2] * 12 + (+m[1] - 1);
  m = s.match(/([a-z]{3})[a-z]*[\s\-']*(\d{2,4})/);
  if (m && MS.includes(m[1])) { const y = m[2].length === 2 ? 2000 + +m[2] : +m[2]; return y * 12 + MS.indexOf(m[1]); }
  return null;
}

export default function TargetDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const load = () => {
    setShown(true); setBusy(true);
    Promise.all([api.list("target", false, { slim: true }), api.listUsers().catch(() => ({ users: [] }))])
      .then(([d, uu]) => {
        setUsers(uu.users || []);
        setRows(scopeRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })), uu.users || []));
      })
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  };
  return <TargetDashboardView rows={rows} users={users} busy={busy} shown={shown} onShow={load} />;
}

export function TargetDashboardView({ rows, users, busy, shown, onShow }) {
  const nav = useNavigate();
  const now = useNow(1000);
  const pf = usePlaceFilter(users);
  const [type, setType] = useState("Sales");
  const [period, setPeriod] = useState("");

  const isSales = type === "Sales";
  const fmt = (v) => (isSales ? money(v) : num(v) + " Sq.Mtr");
  const fmtShort = (v) => (isSales ? money(v) : fmtInt(v));

  const ofType = useMemo(() => (rows || []).filter((r) => String(r.targetType || "Sales").toLowerCase() === type.toLowerCase()), [rows, type]);
  const periods = useMemo(() => [...new Set(ofType.map((r) => String(r.period || "").trim()).filter(Boolean))]
    .sort((a, b) => (periodKey(b) ?? -1) - (periodKey(a) ?? -1)), [ofType]);

  /* open on the latest period — a total across every month ever set reads
     as one enormous target nobody is actually chasing */
  const picked = useRef("");
  useEffect(() => {
    if (picked.current === type || !periods.length) return;
    picked.current = type;
    setPeriod(periods[0]);
  }, [periods, type]);

  const list = useMemo(() => ofType.filter((r) => {
    if (period && String(r.period || "").trim() !== period) return false;
    if (pf.any && !pf.matchAny([r.user])) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ofType, period, pf.zone, pf.state, pf.hod, pf.person, users]);

  const tgt = list.reduce((s, r) => s + (Number(r.target) || 0), 0);
  const ach = list.reduce((s, r) => s + (Number(r.achieved) || 0), 0);
  const gap = Math.max(0, tgt - ach);
  const withTarget = list.filter((r) => Number(r.target) > 0);
  const met = withTarget.filter((r) => Number(r.achieved) >= Number(r.target)).length;

  /* the end of this month, and what is needed each day until then */
  const d0 = new Date(now);
  const monthEnd = new Date(d0.getFullYear(), d0.getMonth() + 1, 0, 23, 59, 59);
  const daysLeft = Math.max(1, Math.ceil((monthEnd - d0) / 86400000));

  const byPeriod = useMemo(() => {
    const m = new Map();
    ofType.filter((r) => !pf.any || pf.matchAny([r.user])).forEach((r) => {
      const k = String(r.period || "").trim() || "—";
      const x = m.get(k) || { label: k, value: 0, target: 0 };
      x.value += Number(r.achieved) || 0; x.target += Number(r.target) || 0;
      m.set(k, x);
    });
    const arr = [...m.values()].sort((a, b) => (periodKey(a.label) ?? 0) - (periodKey(b.label) ?? 0)).slice(-8);
    return arr.map((x, i) => ({
      label: x.label.length > 8 ? x.label.slice(0, 3) + " " + x.label.slice(-2) : x.label,
      full: x.label, value: x.value, note: "target " + fmtShort(x.target) + " · " + pct(x.value, x.target) + "%",
      isToday: period ? x.label === period : i === arr.length - 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofType, period, pf.zone, pf.state, pf.hod, pf.person, users, type]);

  const people = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const n = r.user || "—";
      const x = m.get(n) || { name: n, hod: r.hod || "", target: 0, achieved: 0 };
      x.target += Number(r.target) || 0; x.achieved += Number(r.achieved) || 0;
      m.set(n, x);
    });
    return [...m.values()].map((x) => ({ ...x, pct: pct(x.achieved, x.target) })).sort((a, b) => b.pct - a.pct || b.achieved - a.achieved);
  }, [list]);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";
  const goList = () => nav("/admin/sfa/target");

  return (
    <DxPage title="Target Dashboard" sub={`${type} targets against what has come in`}
      actions={<>
        <div className="dx-seg">{["Sales", "Specs"].map((t) => <button key={t} className={type === t ? "on" : ""} onClick={() => { setType(t); setPeriod(""); }}>{t}</button>)}</div>
        {shown && <RefreshBtn onClick={onShow} busy={busy} />}
        <button className="dx-btn dx-btn-p" onClick={goList}><ExternalLink size={15} /> Open Targets</button>
      </>}>
      <div className="dx-filters">
        <div><label>Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">All periods</option>{periods.map((p) => <option key={p}>{p}</option>)}</select></div>
        {pf.fields}
        {(pf.any || period) && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={() => { pf.clear(); setPeriod(""); }}>Clear</button>}
      </div>

      {!shown || (busy && !rows) ? <ShowGate onShow={onShow} busy={busy} what="targets" /> : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label={`${type} Target`} value={fmtShort(tgt)} chip={people.length} sub="people with a target" onClick={goList} />
            <KpiCard label="Achieved" value={fmtShort(ach)} chip={pct(ach, tgt) + "%"} sub="of the target" onClick={goList} />
            <KpiCard label="Still to Achieve" value={fmtShort(gap)} sub={gap ? "gap to close" : "target reached"} onClick={goList} />
            <KpiCard label="Targets Met" value={`${met}/${withTarget.length}`} chip={withTarget.length - met} sub="still behind" onClick={goList} />
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Achieved by period" sub={period ? `${period} in deep blue` : "Latest period in deep blue"}>
              <WeekBars days={byPeriod} height={250} fmt={fmtShort} />
            </Panel>
            <Panel title="Target progress" sub={period || "All periods together"}>
              <HalfDonut size={260} fmt={fmtShort} center={pct(ach, tgt) + "%"} centerLabel="of target achieved"
                segments={[
                  { label: "Achieved", value: Math.min(ach, tgt || ach), color: ORD[0] },
                  { label: "Remaining", value: gap, color: ORD[3] },
                ]} />
            </Panel>
            <Panel night title="Month closes in" sub={monthEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "long" }) + ", end of day"}>
              <LiveClock target={monthEnd.toISOString()} now={now} />
              <div className="dx-stat-mini">
                <div><b>{daysLeft}</b><span>Days left</span></div>
                <div><b>{fmtShort(gap)}</b><span>Gap</span></div>
                <div><b>{fmtShort(gap / daysLeft)}</b><span>Needed / day</span></div>
              </div>
              <NightList title="Furthest behind" empty="Everyone has met their target."
                rows={people.filter((p) => p.target > p.achieved).sort((a, b) => (b.target - b.achieved) - (a.target - a.achieved)).slice(0, 4)
                  .map((p) => ({ label: p.name, sub: p.pct + "% done", value: fmtShort(p.target - p.achieved) + " to go" }))} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-4">
            <Panel title="Top achievers" sub={`By ${isSales ? "value" : "Sq.Mtr"} achieved`}>
              <RankBars items={[...people].sort((a, b) => b.achieved - a.achieved).map((p) => ({ label: p.name, value: p.achieved, note: p.pct + "%" }))}
                fmt={fmtShort} photoOf={photoOf} />
            </Panel>
            <Panel title="Target vs achieved, by person" sub="Best first">
              <div style={{ overflowX: "auto" }}>
                <table className="dx-table">
                  <thead><tr>{["Person", "HOD", "Target", "Achieved", "Progress", ""].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                  <tbody>
                    {people.length === 0 ? <tr><td colSpan={6} className="dx-empty">No targets for these filters.</td></tr>
                    : people.slice(0, 30).map((p) => (
                      <tr key={p.name}>
                        <td><b>{p.name}</b></td>
                        <td>{p.hod || "—"}</td>
                        <td>{fmt(p.target)}</td>
                        <td>{fmt(p.achieved)}</td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--dx-100)", overflow: "hidden" }}>
                              <div style={{ width: Math.min(100, p.pct) + "%", height: "100%", borderRadius: 99, background: "var(--dx-600)" }} />
                            </div>
                            <b style={{ minWidth: 38, textAlign: "right" }}>{p.pct}%</b>
                          </div>
                        </td>
                        <td>{p.target > 0 && (p.achieved >= p.target
                          ? <span className="dx-pill good"><span aria-hidden="true">✓</span>Met</span>
                          : <span className="dx-pill warn"><span aria-hidden="true">!</span>Behind</span>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      )}
    </DxPage>
  );
}
