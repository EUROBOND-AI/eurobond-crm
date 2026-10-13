/* Business Dashboard — the whole company on one screen.

   Nothing is fetched until Show is pressed, as before: this screen reads
   seven lists and opening the panel should not cost everyone that. Once it
   is loaded, every filter applies straight away.

   Each figure is limited to what this login may see, and then to the people
   the Zone / State / HOD / Person filters pick out. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { scopeRows, visibleUsers, userByName } from "../lib/scope.js";
import {
  DxPage, KpiCard, Panel, WeekBars, HalfDonut, RankBars, RowList, WordPill, ShowGate, RefreshBtn, TodayClock,
  usePlaceFilter, NightList, readDate, monthBars, countBy, money, num, pct, fmtInt, ORD,
} from "../components/dash.jsx";
import { enquiryStage } from "./EnquiryDashboard.jsx";
import { projStatus } from "./ProjectDashboard.jsx";
import { periodKey } from "./TargetDashboard.jsx";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const OWN = ["createdBy", "by", "user", "passto", "assignedTo", "salesPerson"];
const ownerNames = (r) => OWN.map((k) => r[k]).filter(Boolean);

export default function HomeDashboard() {
  const [d, setD] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((x) => setUsers(x.users || [])).catch(() => {}); }, []);

  const load = async () => {
    setShown(true); setBusy(true);
    const safe = (p) => p.then((r) => r).catch(() => ({ records: [] }));
    const uu = await safe(api.listUsers()).then((r) => r.users || []).catch(() => []);
    const today = ymd(new Date());
    const [enq, cust, exp, leave, target, proj, att] = await Promise.all([
      safe(api.list("enquiry")), safe(api.list("followup")), safe(api.list("expense")),
      safe(api.list("leave")), safe(api.list("target")), safe(api.list("projectProjection")),
      safe(api.attList ? api.attList(today, today) : Promise.resolve({ sessions: [] })),
    ]);
    const rd = (x) => (x.records || []).map((r) => ({ _id: r.id, _at: r.created_at, ...(r.data || r) }));
    const allow = new Set(visibleUsers(uu).map((x) => x.name));
    setUsers(uu);
    setD({
      enq: scopeRows(rd(enq), uu, OWN), cust: scopeRows(rd(cust), uu, OWN), exp: scopeRows(rd(exp), uu, OWN),
      leave: scopeRows(rd(leave), uu, OWN), target: scopeRows(rd(target), uu, OWN), proj: scopeRows(rd(proj), uu, OWN),
      sessions: (att.sessions || []).filter((s) => allow.has(s.name)),
    });
    setBusy(false);
  };

  return <HomeDashboardView d={d} users={users} busy={busy} shown={shown} onShow={load} />;
}

export function HomeDashboardView({ d, users, busy, shown, onShow }) {
  const nav = useNavigate();
  const pf = usePlaceFilter(users);
  const f = (arr) => (arr || []).filter((r) => !pf.any || pf.matchAny(ownerNames(r)));

  const X = useMemo(() => {
    if (!d) return null;
    const enq = f(d.enq).filter((r) => !r.isDuplicate);
    const cust = f(d.cust), exp = f(d.exp), leave = f(d.leave), proj = f(d.proj);
    const sessions = d.sessions.filter((s) => !pf.any || pf.match(s.name));
    const es = { new: 0, waiting: 0, working: 0, win: 0, spam: 0 };
    enq.forEach((r) => { es[enquiryStage(r)]++; });
    const ps = { running: 0, hold: 0, win: 0, loss: 0 };
    proj.forEach((r) => { ps[projStatus(r)]++; });
    const expPend = exp.filter((r) => (r.status || "") === "Submitted");
    const leavePend = leave.filter((r) => (r.status || "") === "Pending");

    /* sales target for the latest period on record */
    const sales = f(d.target).filter((r) => String(r.targetType || "Sales").toLowerCase() === "sales");
    const latest = sales.reduce((m, r) => Math.max(m, periodKey(r.period) ?? -1), -1);
    const cur = latest >= 0 ? sales.filter((r) => periodKey(r.period) === latest) : sales;
    const tgt = cur.reduce((s, r) => s + (Number(r.target) || 0), 0);
    const ach = cur.reduce((s, r) => s + (Number(r.achieved) || 0), 0);

    return {
      enq, es, enqReal: enq.length - es.spam, cust: cust.length, proj: proj.length, ps,
      expTotal: exp.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      expPendAmt: expPend.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      expPend: expPend.length, leavePend,
      expCat: countBy(exp, (r) => r.category || "Other", (r) => Number(r.amount) || 0),
      present: sessions.filter((s) => s.status === "RUNNING" || s.status === "DONE").length,
      running: sessions.filter((s) => s.status === "RUNNING").length,
      onDuty: sessions.filter((s) => s.status === "RUNNING"),
      km: sessions.reduce((s, x) => s + (Number(x.distance_km) || 0), 0),
      topKm: [...sessions].sort((a, b) => (Number(b.distance_km) || 0) - (Number(a.distance_km) || 0)).map((s) => ({ label: s.name, value: Number(s.distance_km) || 0 })),
      tgt, ach, period: cur[0] && cur[0].period,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, pf.zone, pf.state, pf.hod, pf.person, users]);

  const months = useMemo(() => (X ? monthBars(X.enq, (r) => readDate(r._at) || readDate(r.date), 12) : []), [X]);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";

  return (
    <DxPage title="Business Dashboard" sub="Eurobond at a glance"
      actions={shown && <><RefreshBtn onClick={onShow} busy={busy} /><button className="dx-btn no-print" onClick={() => window.print()}>Print / PDF</button></>}>
      <div className="print-title">Eurobond CRM — Business Dashboard · {new Date().toLocaleDateString("en-IN")}</div>
      <div className="dx-filters no-print">
        {pf.fields}
        {pf.any && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={pf.clear}>Clear</button>}
      </div>

      {!shown || (busy && !d) || !X ? <ShowGate onShow={onShow} busy={busy} what="the business dashboard" /> : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Total Enquiries" value={fmtInt(X.enqReal)} chip={pct(X.es.win, X.enqReal) + "%"} sub="win rate" onClick={() => nav("/admin/sfa/enquiry")} />
            <KpiCard label="Customers" value={fmtInt(X.cust)} sub="customer visits on record" onClick={() => nav("/admin/sfa/customers")} />
            <KpiCard label="Projects" value={fmtInt(X.proj)} chip={X.ps.running} sub="running right now" onClick={() => nav("/admin/sfa/project-projection")} />
            <KpiCard label="Expenses" value={money(X.expTotal)} chip={X.expPend} sub={`claims waiting · ${money(X.expPendAmt)}`} onClick={() => nav("/admin/sfa/expense")} />
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Enquiries by month" sub="Last 12 months · this month in deep blue">
              <WeekBars days={months} unit="enquiries" height={250} />
            </Panel>
            <Panel title="Enquiry stages" sub="Where every enquiry stands">
              <HalfDonut size={260} center={pct(X.es.win, X.enqReal) + "%"} centerLabel="won"
                segments={[
                  { label: "Win", value: X.es.win, color: ORD[0] },
                  { label: "Processing", value: X.es.working, color: ORD[1] },
                  { label: "No reply", value: X.es.waiting, color: ORD[2] },
                  { label: "Not assigned", value: X.es.new, color: ORD[3] },
                ]} />
            </Panel>
            <Panel night title="Field team today" sub="Attendance, live">
              <TodayClock />
              <div className="dx-stat-mini">
                <div><b>{num(X.present)}</b><span>Present</span></div>
                <div><b>{num(X.running)}</b><span>On duty now</span></div>
                <div><b>{X.km.toFixed(0)}</b><span>KM today</span></div>
              </div>
              <NightList title="On duty now" empty="No one is on duty right now."
                rows={X.onDuty.slice(0, 5).map((s) => ({ label: s.name, sub: s.city || s.state || "", value: (Number(s.distance_km) || 0).toFixed(1) + " km" }))} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-even" style={{ marginBottom: 16 }}>
            <Panel title="Waiting for approval" sub="Open these to decide">
              <RowList rows={[
                { key: "l", title: "Leave requests", avatar: "L", meta: X.leavePend.slice(0, 3).map((r) => r.createdBy || r.by).filter(Boolean).join(", ") || "None waiting",
                  right: <button className="dx-btn" style={{ padding: "5px 12px" }} onClick={() => nav("/admin/sfa/leave")}>{X.leavePend.length} open</button> },
                { key: "e", title: "Expense claims", avatar: "E", meta: money(X.expPendAmt) + " submitted",
                  right: <button className="dx-btn" style={{ padding: "5px 12px" }} onClick={() => nav("/admin/sfa/expense")}>{X.expPend} open</button> },
                { key: "u", title: "Enquiries not assigned", avatar: "N", meta: "No one is on these yet",
                  right: <button className="dx-btn" style={{ padding: "5px 12px" }} onClick={() => nav("/admin/sfa/enquiry")}>{X.es.new} open</button> },
                { key: "w", title: "Enquiries with no reply", avatar: "R", meta: "Given out, nothing heard back",
                  right: X.es.waiting ? <WordPill text={`${X.es.waiting} waiting`} tone="bad" /> : <WordPill text="All clear" tone="good" /> },
              ]} />
            </Panel>
            <Panel title="Sales target" sub={X.period ? `Period: ${X.period}` : "Latest period"}>
              <HalfDonut size={240} fmt={money} center={pct(X.ach, X.tgt) + "%"} centerLabel="of target achieved"
                segments={[
                  { label: "Achieved", value: Math.min(X.ach, X.tgt || X.ach), color: ORD[0] },
                  { label: "Remaining", value: Math.max(0, X.tgt - X.ach), color: ORD[3] },
                ]} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5, color: "var(--dx-ink-2)" }}>
                <span>Target <b style={{ color: "var(--dx-ink)" }}>{money(X.tgt)}</b></span>
                <span>Achieved <b style={{ color: "var(--dx-ink)" }}>{money(X.ach)}</b></span>
              </div>
            </Panel>
            <Panel title="Projects by status" sub="Project projections">
              <HalfDonut size={240} center={num(X.proj)} centerLabel="projects"
                segments={[
                  { label: "Win", value: X.ps.win, color: ORD[0] },
                  { label: "Running", value: X.ps.running, color: ORD[1] },
                  { label: "Hold", value: X.ps.hold, color: ORD[2] },
                  { label: "Loss", value: X.ps.loss, color: ORD[3] },
                ]} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-half">
            <Panel title="Expense by category" sub="All claims, by amount">
              <RankBars items={X.expCat} fmt={money} />
            </Panel>
            <Panel title="Most KM today" sub="From today's attendance">
              <RankBars items={X.topKm} fmt={(v) => Number(v).toFixed(1) + " km"} photoOf={photoOf} empty="No one has started today yet." />
            </Panel>
          </div>
        </>
      )}
    </DxPage>
  );
}
