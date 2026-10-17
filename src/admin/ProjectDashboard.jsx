/* Project Dashboard — Project Projection, Sales or Specs side, plus the two
   hand-overs between the teams (Sales → Spec and Spec → Sales).

   Statuses are the four the Project Projection list uses: Running, Hold,
   Win and Loss. The old screen looked for "open" and "lost", so Running and
   Loss were never counted where they should have been. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { scopeRows, userByName } from "../lib/scope.js";
import {
  DxPage, KpiCard, Panel, WeekBars, HalfDonut, Pipeline, RankBars, RowList, WordPill, ShowGate, RefreshBtn, TodayClock, NightList,
  usePlaceFilter, useDateRange, readDate, monthBars, countBy, money, num, pct, fmtInt, ORD,
} from "../components/dash.jsx";

const low = (x) => String(x || "").trim().toLowerCase();
export function projStatus(r) {
  const s = low(r.status || "running");
  if (s === "win" || s === "won") return "win";
  if (s === "loss" || s === "lost") return "loss";
  if (s === "hold") return "hold";
  return "running";
}
const PS = { running: ["Running", "info"], hold: ["Hold", "warn"], win: ["Win", "good"], loss: ["Loss", "bad"] };
const handStage = (r) => {
  const s = low(r.status || "pending");
  if (s === "pending" || s === "") return "pending";
  if (s.includes("process")) return "process";
  return "done";
};

export default function ProjectDashboard() {
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const load = () => {
    setShown(true); setBusy(true);
    Promise.all([
      api.list("projectProjection", false, { slim: true }).catch(() => ({ records: [] })),
      api.list("salesToSpec", false, { slim: true }).catch(() => ({ records: [] })),
      api.list("specToSales", false, { slim: true }).catch(() => ({ records: [] })),
      api.listUsers().catch(() => ({ users: [] })),
    ]).then(([p, a, b, uu]) => {
      const all = uu.users || [];
      const rd = (x) => (x.records || []).map((r) => ({ _id: r.id, ...r.data }));
      setUsers(all);
      setData({
        proj: scopeRows(rd(p), all),
        s2s: scopeRows(rd(a), all, ["createdBy", "salesPerson", "specPerson", "by"]),
        sp2s: scopeRows(rd(b), all, ["createdBy", "specPerson", "salesPerson", "by"]),
      });
    }).finally(() => setBusy(false));
  };
  return <ProjectDashboardView data={data} users={users} busy={busy} shown={shown} onShow={load} />;
}

export function ProjectDashboardView({ data, users, busy, shown, onShow }) {
  const nav = useNavigate();
  const pf = usePlaceFilter(users);
  const dr = useDateRange();
  const [side, setSide] = useState("Sales");
  const dateOf = (r) => readDate(r.visitDate) || readDate(r.createdAt);
  const keep = (r, names) => dr.inRange(dateOf(r)) && (!pf.any || pf.matchAny(names));

  const list = useMemo(() => (data ? data.proj : []).filter((r) =>
    (side === "Specs" ? !!r.isSpec : !r.isSpec) && keep(r, [r.createdBy, r.salesPerson, r.specPerson]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , [data, side, dr.from, dr.to, pf.zone, pf.state, pf.hod, pf.person, users]);
  const s2s = useMemo(() => (data ? data.s2s : []).filter((r) => keep(r, [r.createdBy, r.salesPerson, r.specPerson]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , [data, dr.from, dr.to, pf.zone, pf.state, pf.hod, pf.person, users]);
  const sp2s = useMemo(() => (data ? data.sp2s : []).filter((r) => keep(r, [r.createdBy, r.specPerson, r.salesPerson]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , [data, dr.from, dr.to, pf.zone, pf.state, pf.hod, pf.person, users]);

  const S = useMemo(() => {
    const by = { running: 0, hold: 0, win: 0, loss: 0 };
    list.forEach((r) => { by[projStatus(r)]++; });
    const won = list.filter((r) => projStatus(r) === "win");
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const thisMonth = list.filter((r) => { const d = dateOf(r); return d && d >= month; });
    return {
      by, total: list.length,
      sqm: won.reduce((s, r) => s + (Number(r.winSqm || r.sqmApproved) || 0), 0),
      sales: won.reduce((s, r) => s + (Number(r.winSales) || 0), 0),
      newMonth: thisMonth.length,
      winMonth: thisMonth.filter((r) => projStatus(r) === "win").length,
      decided: by.win + by.loss,
    };
  }, [list]);

  const months = useMemo(() => monthBars(list, dateOf, 12), [list]);
  const people = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const n = r.createdBy || "—";
      const x = m.get(n) || { name: n, total: 0, running: 0, hold: 0, win: 0, loss: 0, sqm: 0, sales: 0 };
      const st = projStatus(r);
      x.total++; x[st]++;
      if (st === "win") { x.sqm += Number(r.winSqm || r.sqmApproved) || 0; x.sales += Number(r.winSales) || 0; }
      m.set(n, x);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [list]);
  const recent = useMemo(() => [...list].sort((a, b) => (dateOf(b) || 0) - (dateOf(a) || 0)).slice(0, 7), [list]);
  const hs = (arr) => { const o = { pending: 0, process: 0, done: 0 }; arr.forEach((r) => { o[handStage(r)]++; }); return o; };
  const A = hs(s2s), B = hs(sp2s);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";
  const goList = () => nav("/admin/sfa/project-projection");
  const short = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");

  return (
    <DxPage title="Project Dashboard" sub={`${side} project projections`}
      actions={<>
        <div className="dx-seg">{["Sales", "Specs"].map((t) => <button key={t} className={side === t ? "on" : ""} onClick={() => setSide(t)}>{t}</button>)}</div>
        {shown && <RefreshBtn onClick={onShow} busy={busy} />}
        <button className="dx-btn dx-btn-p" onClick={goList}><ExternalLink size={15} /> Open Projects</button>
      </>}>
      <div className="dx-filters">
        {pf.fields}
        {dr.fields}
        {(pf.any || dr.any) && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={() => { pf.clear(); dr.clear(); }}>Clear</button>}
      </div>

      {!shown || (busy && !data) ? <ShowGate onShow={onShow} busy={busy} what="projects" /> : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label={`${side} Projects`} value={fmtInt(S.total)} chip={S.by.running} sub="running right now" onClick={goList} />
            <KpiCard label="Win" value={fmtInt(S.by.win)} chip={pct(S.by.win, S.decided) + "%"} sub="of decided projects won" onClick={goList} />
            <KpiCard label="Sq.Mtr Won" value={fmtInt(S.sqm)} sub="on won projects" onClick={goList} />
            <KpiCard label="Sales Value" value={money(S.sales)} chip={S.by.hold} sub="projects on hold" onClick={goList} />
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Projects by month" sub="By visit date · this month in deep blue">
              <WeekBars days={months} unit="projects" height={250} />
            </Panel>
            <Panel title="Status" sub="Every project, where it stands">
              <HalfDonut size={260} center={pct(S.by.win, S.total) + "%"} centerLabel="won"
                segments={[
                  { label: "Win", value: S.by.win, color: ORD[0] },
                  { label: "Running", value: S.by.running, color: ORD[1] },
                  { label: "Hold", value: S.by.hold, color: ORD[2] },
                  { label: "Loss", value: S.by.loss, color: ORD[3] },
                ]} />
            </Panel>
            <Panel night title="This month" sub="Live">
              <TodayClock />
              <div className="dx-stat-mini">
                <div><b>{num(S.newMonth)}</b><span>New projects</span></div>
                <div><b>{num(S.winMonth)}</b><span>Won</span></div>
                <div><b>{num(S.by.running)}</b><span>Running</span></div>
              </div>
              <NightList title="Latest wins" empty="No wins yet."
                rows={list.filter((r) => projStatus(r) === "win").sort((a, b) => (dateOf(b) || 0) - (dateOf(a) || 0)).slice(0, 4)
                  .map((r) => ({ label: r.projectName || "Project", sub: r.createdBy || "—", value: r.winSales ? money(r.winSales) : num(r.winSqm) + " sqm" }))} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-half" style={{ marginBottom: 16 }}>
            <Panel title="Sales → Spec" sub={`${num(s2s.length)} handed to the specs team`}>
              <Pipeline steps={[
                { label: "Sent", value: s2s.length },
                { label: "In process or approved", value: A.process + A.done },
                { label: "Approved", value: A.done },
              ]} />
            </Panel>
            <Panel title="Spec → Sales" sub={`${num(sp2s.length)} handed to the sales team`}>
              <Pipeline steps={[
                { label: "Sent", value: sp2s.length },
                { label: "In process or won", value: B.process + B.done },
                { label: "Win", value: B.done },
              ]} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-even" style={{ marginBottom: 16 }}>
            <Panel title="Most projects" sub="Per person">
              <RankBars items={people.map((p) => ({ label: p.name, value: p.total, note: p.win ? `${p.win} won` : "" }))} photoOf={photoOf} />
            </Panel>
            <Panel title="Project type" sub="What is being built">
              <RankBars items={countBy(list, (r) => r.projectType)} />
            </Panel>
            <Panel title="Category" sub="Who the project is with">
              <RankBars items={countBy(list, (r) => r.category)} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-4">
            <Panel title="Latest projects" sub="Newest visit first">
              <RowList rows={recent.map((r) => {
                const [w, tone] = PS[projStatus(r)];
                return {
                  key: r._id, title: r.projectName || "Project", avatar: r.createdBy || r.projectName, photo: photoOf(r.createdBy),
                  meta: <>{r.createdBy || "—"} · {r.city || "—"} · {short(dateOf(r))}</>,
                  right: <WordPill text={w} tone={tone} />,
                };
              })} />
            </Panel>
            <Panel title="By person" sub="Projects each person is carrying">
              <div style={{ overflowX: "auto" }}>
                <table className="dx-table">
                  <thead><tr>{["Person", "Projects", "Running", "Hold", "Win", "Loss", "Sq.Mtr", "Sales"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {people.length === 0 ? <tr><td colSpan={8} className="dx-empty">No projects for these filters.</td></tr>
                    : people.slice(0, 25).map((p) => (
                      <tr key={p.name}>
                        <td><b>{p.name}</b></td><td>{p.total}</td><td>{p.running || "—"}</td><td>{p.hold || "—"}</td>
                        <td>{p.win || "—"}</td><td>{p.loss || "—"}</td><td>{p.sqm ? num(p.sqm) : "—"}</td><td>{p.sales ? money(p.sales) : "—"}</td>
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
