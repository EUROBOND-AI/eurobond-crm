/* Customers Dashboard — who the team is meeting, how often, and where.

   A customer seen once is "new"; seen more than once is "repeat". The person
   on the record is whoever met them, and Zone / HOD are worked out from that
   person; State falls back to the customer's own state. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { scopeRows, userByName } from "../lib/scope.js";
import {
  DxPage, KpiCard, Panel, WeekBars, HalfDonut, RankBars, RowList, WordPill, ShowGate, RefreshBtn, TodayClock, NightList,
  usePlaceFilter, useDateRange, readDate, monthBars, countBy, num, pct, fmtInt, ORD,
} from "../components/dash.jsx";

const low = (x) => String(x || "").trim().toLowerCase();

export default function CustomersDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const load = () => {
    setShown(true); setBusy(true);
    Promise.all([api.customers(), api.listUsers().catch(() => ({ users: [] }))])
      .then(([d, uu]) => {
        const all = uu.users || [];
        setUsers(all);
        setRows(scopeRows(d.customers || d.rows || [], all));
      })
      .catch(() => setRows([]))
      .finally(() => setBusy(false));
  };

  return <CustomersDashboardView rows={rows} users={users} busy={busy} shown={shown} onShow={load} />;
}

export function CustomersDashboardView({ rows, users, busy, shown, onShow }) {
  const nav = useNavigate();
  const pf = usePlaceFilter(users);
  const dr = useDateRange();
  const dateOf = (r) => readDate(r.last_followup);

  const list = useMemo(() => (rows || []).filter((r) => {
    if (!dr.inRange(dateOf(r))) return false;
    if (pf.any) {
      const own = pf.matchAny([r.by]);
      const onlyState = pf.state && !pf.zone && !pf.hod && !pf.person;
      if (!own && !(onlyState && low(r.state) === low(pf.state))) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, dr.from, dr.to, pf.zone, pf.state, pf.hod, pf.person, users]);

  const S = useMemo(() => {
    const visits = (r) => Number(r.followups) || 1;
    const newC = list.filter((r) => visits(r) <= 1).length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const week = new Date(today); week.setDate(today.getDate() - 6);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const seen = (from) => list.filter((r) => { const d = dateOf(r); return d && d >= from; }).length;
    return {
      total: list.length, newC, repeat: list.length - newC,
      entries: list.reduce((s, r) => s + visits(r), 0),
      today: seen(today), week: seen(week), month: seen(month),
    };
  }, [list]);

  const months = useMemo(() => monthBars(list, dateOf, 12), [list]);
  const people = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const n = r.by || "—";
      const x = m.get(n) || { name: n, total: 0, newC: 0, repeat: 0, entries: 0, last: null };
      const v = Number(r.followups) || 1;
      x.total++; x.entries += v;
      if (v <= 1) x.newC++; else x.repeat++;
      const d = dateOf(r);
      if (d && (!x.last || d > x.last)) x.last = d;
      m.set(n, x);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [list]);
  const recent = useMemo(() => [...list].sort((a, b) => (dateOf(b) || 0) - (dateOf(a) || 0)).slice(0, 7), [list]);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";
  const goList = () => nav("/admin/sfa/customers");
  const short = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");

  return (
    <DxPage title="Customers Dashboard" sub="Who the team is meeting"
      actions={shown && <><RefreshBtn onClick={onShow} busy={busy} /><button className="dx-btn dx-btn-p" onClick={goList}><ExternalLink size={15} /> Open Customers</button></>}>
      <div className="dx-filters">
        {pf.fields}
        {dr.fields}
        {(pf.any || dr.any) && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={() => { pf.clear(); dr.clear(); }}>Clear</button>}
      </div>

      {!shown || (busy && !rows) ? <ShowGate onShow={onShow} busy={busy} what="customers" /> : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Total Customers" value={fmtInt(S.total)} chip={S.month} sub="met this month" onClick={goList} />
            <KpiCard label="New Customers" value={fmtInt(S.newC)} chip={pct(S.newC, S.total) + "%"} sub="met once so far" onClick={goList} />
            <KpiCard label="Repeat / Follow-up" value={fmtInt(S.repeat)} chip={pct(S.repeat, S.total) + "%"} sub="met more than once" onClick={goList} />
            <KpiCard label="Total Visits" value={fmtInt(S.entries)} chip={S.total ? (S.entries / S.total).toFixed(1) : "0"} sub="visits per customer" onClick={goList} />
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Customers met, by month" sub="By the latest visit · this month in deep blue">
              <WeekBars days={months} unit="customers" height={250} />
            </Panel>
            <Panel title="New vs repeat" sub="How many are coming back">
              <HalfDonut size={260} center={pct(S.repeat, S.total) + "%"} centerLabel="are repeat customers"
                segments={[
                  { label: "Repeat", value: S.repeat, color: ORD[0] },
                  { label: "New", value: S.newC, color: ORD[2] },
                ]} />
            </Panel>
            <Panel night title="Today" sub="Customers met, live">
              <TodayClock />
              <div className="dx-stat-mini">
                <div><b>{num(S.today)}</b><span>Today</span></div>
                <div><b>{num(S.week)}</b><span>Last 7 days</span></div>
                <div><b>{num(S.month)}</b><span>This month</span></div>
              </div>
              <NightList title="Latest visits" empty="No visits yet."
                rows={recent.slice(0, 4).map((r) => ({ label: r.name || "Customer", sub: r.by || "—", value: short(dateOf(r)) }))} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-even" style={{ marginBottom: 16 }}>
            <Panel title="Most customers" sub="Per person">
              <RankBars items={people.map((p) => ({ label: p.name, value: p.total, note: p.repeat ? `${p.repeat} repeat` : "" }))} photoOf={photoOf} />
            </Panel>
            <Panel title="Category" sub="Kind of customer">
              <RankBars items={countBy(list, (r) => r.category)} />
            </Panel>
            <Panel title="Top states" sub="Where they are">
              <RankBars items={countBy(list, (r) => r.state)} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-4">
            <Panel title="Latest visits" sub="Most recent first">
              <RowList rows={recent.map((r, i) => {
                const v = Number(r.followups) || 1;
                return {
                  key: (r.mobile || "") + i, title: r.name || r.contactName || "Customer", avatar: r.by || r.name, photo: photoOf(r.by),
                  meta: <>{r.by || "—"} · {r.place || r.state || "—"} · {short(dateOf(r))}</>,
                  right: v > 1 ? <WordPill text={`${v} visits`} tone="info" /> : <WordPill text="New" tone="good" />,
                };
              })} />
            </Panel>
            <Panel title="By person" sub="Customers each person looks after">
              <div style={{ overflowX: "auto" }}>
                <table className="dx-table">
                  <thead><tr>{["Person", "Customers", "New", "Repeat", "Visits", "Last visit"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {people.length === 0 ? <tr><td colSpan={6} className="dx-empty">No customers for these filters.</td></tr>
                    : people.slice(0, 25).map((p) => (
                      <tr key={p.name}>
                        <td><b>{p.name}</b></td><td>{p.total}</td><td>{p.newC}</td><td>{p.repeat}</td><td>{p.entries}</td><td>{short(p.last)}</td>
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
