/* Biltrax Dashboard.

   Stages match the Biltrax list: Draft (nobody on it), Assigned (given to
   someone, nothing heard), Processing (they have added a remark) and Win.
   Draft is the office team's queue, so only they see it here as well. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { scopeRows, userByName, isPanelAdmin } from "../lib/scope.js";
import {
  DxPage, KpiCard, Panel, HalfDonut, Pipeline, RankBars, RowList, WordPill, ShowGate, RefreshBtn, TodayClock, NightList,
  usePlaceFilter, readDate, countBy, money, num, pct, fmtInt, ORD,
} from "../components/dash.jsx";

const low = (x) => String(x || "").trim().toLowerCase();
export function biltraxStage(r) {
  if (r.status === "Win") return "win";
  const worked = (r.followupsCount ?? (Array.isArray(r.followups) ? r.followups.length : 0)) || r.lastRemark;
  if (worked) return "processing";
  return r.assignPerson ? "assigned" : "draft";
}
const BS = { draft: ["Draft", "mute"], assigned: ["Assigned", "warn"], processing: ["Processing", "info"], win: ["Win", "good"] };

export default function BiltraxDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const load = () => {
    setShown(true); setBusy(true);
    Promise.all([api.list("biltrax", false), api.listUsers().catch(() => ({ users: [] }))])
      .then(([d, uu]) => {
        setUsers(uu.users || []);
        setRows(scopeRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })), uu.users || [], ["createdBy", "assignPerson", "hod"]));
      })
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  };
  return <BiltraxDashboardView rows={rows} users={users} busy={busy} shown={shown} onShow={load} />;
}

export function BiltraxDashboardView({ rows, users, busy, shown, onShow, admin = isPanelAdmin() }) {
  const nav = useNavigate();
  const pf = usePlaceFilter(users);
  const [type, setType] = useState("");

  const list = useMemo(() => (rows || []).filter((r) => {
    if (!admin && biltraxStage(r) === "draft") return false;
    if (type && (r.biltraxType || "Requested") !== type) return false;
    if (pf.any) {
      const own = pf.matchAny([r.assignPerson, r.hod]);
      const onlyState = pf.state && !pf.zone && !pf.hod && !pf.person;
      if (!own && !(onlyState && low(r.state) === low(pf.state))) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, admin, type, pf.zone, pf.state, pf.hod, pf.person, users]);

  const S = useMemo(() => {
    const by = { draft: 0, assigned: 0, processing: 0, win: 0 };
    list.forEach((r) => { by[biltraxStage(r)]++; });
    const won = list.filter((r) => biltraxStage(r) === "win");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);
    const appts = list.filter((r) => r.biltraxType === "Appointment");
    const upcoming = appts.filter((r) => { const d = readDate(r.appointmentDate); return d && d >= today && d < in7; });
    const follows = list.filter((r) => { const d = readDate(r.nextFollowDate); return d && d >= today && d < new Date(today.getTime() + 86400000); });
    return {
      by, total: list.length, appts: appts.length, upcoming, followsToday: follows.length,
      sqm: won.reduce((s, r) => s + (Number(r.winSqm) || 0), 0),
      amount: won.reduce((s, r) => s + (Number(r.winAmount) || 0), 0),
    };
  }, [list]);

  const people = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const n = r.assignPerson || "— Unassigned —";
      const x = m.get(n) || { name: n, hod: r.hod || "", total: 0, draft: 0, assigned: 0, processing: 0, win: 0, sqm: 0, amount: 0 };
      const st = biltraxStage(r);
      x.total++; x[st]++;
      if (st === "win") { x.sqm += Number(r.winSqm) || 0; x.amount += Number(r.winAmount) || 0; }
      m.set(n, x);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [list]);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";
  const goList = () => nav("/admin/sfa/biltrax");
  const short = (d) => (d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }) : "—");
  const steps = [
    ...(admin ? [{ label: "All leads", value: S.total }] : []),
    { label: "Given to someone", value: S.total - S.by.draft },
    { label: "Being worked or won", value: S.by.processing + S.by.win },
    { label: "Win", value: S.by.win },
  ];

  return (
    <DxPage title="Biltrax Dashboard" sub="Biltrax leads, from first look to win"
      actions={<>
        <div className="dx-seg">{[["", "All"], ["Requested", "Requested"], ["Appointment", "Appointment"]].map(([k, l]) => <button key={l} className={type === k ? "on" : ""} onClick={() => setType(k)}>{l}</button>)}</div>
        {shown && <RefreshBtn onClick={onShow} busy={busy} />}
        <button className="dx-btn dx-btn-p" onClick={goList}><ExternalLink size={15} /> Open Biltrax</button>
      </>}>
      <div className="dx-filters">
        {pf.fields}
        {pf.any && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={pf.clear}>Clear</button>}
      </div>

      {!shown || (busy && !rows) ? <ShowGate onShow={onShow} busy={busy} what="Biltrax leads" /> : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Biltrax Projects" value={fmtInt(S.total)} chip={admin ? S.by.draft : S.by.assigned}
              sub={admin ? "still in draft" : "not yet started"} onClick={goList} />
            <KpiCard label="Processing" value={fmtInt(S.by.processing)} chip={S.followsToday} sub="follow-ups due today" onClick={goList} />
            <KpiCard label="Won" value={fmtInt(S.by.win)} chip={pct(S.by.win, S.total) + "%"} sub="of all leads" onClick={goList} />
            <KpiCard label="Won Value" value={money(S.amount)} chip={fmtInt(S.sqm)} sub="Sq.Mtr won" onClick={goList} />
          </div>

          <Panel title="Pipeline" sub="How far leads get — the share under each stage is out of the first" style={{ marginBottom: 16 }}>
            <Pipeline steps={steps} />
          </Panel>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Appointments this week" sub={`${num(S.appts)} appointment leads in all`}>
              <RowList empty="No appointments in the next 7 days."
                rows={[...S.upcoming].sort((a, b) => readDate(a.appointmentDate) - readDate(b.appointmentDate)).slice(0, 6).map((r) => ({
                  key: r._id, title: r.projectName || "Project", avatar: r.assignPerson || r.projectName, photo: photoOf(r.assignPerson),
                  meta: <>{r.assignPerson || "Unassigned"} · {r.state || "—"}</>,
                  right: <WordPill text={short(readDate(r.appointmentDate))} tone="info" />,
                }))} />
            </Panel>
            <Panel title="By stage" sub="Every lead, where it stands">
              <HalfDonut size={260} center={pct(S.by.win, S.total) + "%"} centerLabel="won"
                segments={[
                  { label: "Win", value: S.by.win, color: ORD[0] },
                  { label: "Processing", value: S.by.processing, color: ORD[1] },
                  { label: "Assigned", value: S.by.assigned, color: ORD[2] },
                  ...(admin ? [{ label: "Draft", value: S.by.draft, color: ORD[3] }] : []),
                ]} />
            </Panel>
            <Panel night title="Today" sub="Live">
              <TodayClock />
              <div className="dx-stat-mini">
                <div><b>{num(S.followsToday)}</b><span>Follow-ups today</span></div>
                <div><b>{num(S.upcoming.length)}</b><span>Appts. this week</span></div>
                <div><b>{num(S.by.win)}</b><span>Won</span></div>
              </div>
              <NightList title="Follow-ups due today" empty="No follow-ups due today."
                rows={list.filter((r) => { const d = readDate(r.nextFollowDate); const t = new Date(); return d && d.toDateString() === t.toDateString(); }).slice(0, 4)
                  .map((r) => ({ label: r.projectName || "Project", sub: r.assignPerson || "—", value: r.nextFollowTime || "Today" }))} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-even" style={{ marginBottom: 16 }}>
            <Panel title="Most leads" sub="Per person">
              <RankBars items={people.filter((p) => !p.name.startsWith("—")).map((p) => ({ label: p.name, value: p.total, note: p.win ? `${p.win} won` : "" }))} photoOf={photoOf} />
            </Panel>
            <Panel title="Top states" sub="Where the projects are">
              <RankBars items={countBy(list, (r) => r.state)} />
            </Panel>
            <Panel title="Building use" sub="What is being built">
              <RankBars items={countBy(list, (r) => r.buildingUse)} />
            </Panel>
          </div>

          <Panel title="Person-wise split" sub="Who is holding how many, and what has been won">
            <div style={{ overflowX: "auto" }}>
              <table className="dx-table">
                <thead><tr>{["Person", "HOD", "Total", ...(admin ? ["Draft"] : []), "Assigned", "Processing", "Won", "Won Sq.Mtr", "Won Amount"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {people.length === 0 ? <tr><td colSpan={9} className="dx-empty">No projects match these filters.</td></tr>
                  : people.map((p) => (
                    <tr key={p.name}>
                      <td><b>{p.name}</b></td>
                      <td>{p.hod || "—"}</td><td><b>{p.total}</b></td>
                      {admin && <td>{p.draft || "—"}</td>}
                      <td>{p.assigned || "—"}</td><td>{p.processing || "—"}</td><td>{p.win || "—"}</td>
                      <td>{p.sqm ? num(p.sqm) : "—"}</td><td>{p.amount ? money(p.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </DxPage>
  );
}
