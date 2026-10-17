/* Enquiry Dashboard.

   The stages here are the ones the Enquiry list itself uses, worked out the
   same way: not given to anyone yet, given but nothing heard back, being
   worked (a remark, a next call or a chat reply), won, and spam. The old
   screen counted "Review Pending", "Inprocess" and "Close", which no enquiry
   is ever saved as, so most of its boxes sat at zero. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import { scopeRows, userByName } from "../lib/scope.js";
import {
  DxPage, KpiCard, Panel, WeekBars, HalfDonut, Pipeline, RankBars, RowList, WordPill, ShowGate, RefreshBtn,
  usePlaceFilter, useDateRange, readDate, monthBars, countBy, money, num, pct, fmtInt, ORD, useNow, TodayClock, NightList,
} from "../components/dash.jsx";

const low = (x) => String(x || "").trim().toLowerCase();

const heardBack = (r) => {
  if (String(r.lastRemark || "").trim()) return true;
  if (Array.isArray(r.remarks) && r.remarks.length) return true;
  if (r.nextFollowDate || r.nextDate) return true;
  const c = Array.isArray(r.chat) ? r.chat : [];
  return c.some((m) => m && !m.admin);
};
const whoOf = (r) => r.passto || r.assignedTo || "";
export const ago = (d, now = Date.now()) => {
  if (!d) return "—";
  const m = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (m < 60) return m + "m ago";
  if (m < 1440) return Math.round(m / 60) + "h ago";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};
export function enquiryStage(r) {
  const st = low(r.status || "pending");
  if (st === "spam") return "spam";
  if (st === "win") return "win";
  if (!whoOf(r)) return "new";
  if (st === "processing" || heardBack(r)) return "working";
  return "waiting";
}
const STAGE = {
  new: { word: "Not assigned", tone: "warn" },
  waiting: { word: "No reply yet", tone: "bad" },
  working: { word: "Processing", tone: "info" },
  win: { word: "Win", tone: "good" },
  spam: { word: "Spam", tone: "mute" },
};

export default function EnquiryDashboard() {
  const [all, setAll] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const load = () => {
    setShown(true); setBusy(true); setErr("");
    Promise.all([api.list("enquiry", false, { slim: true }), api.listUsers().catch(() => ({ users: [] }))])
      .then(([d, uu]) => {
        setUsers(uu.users || []);
        setAll(scopeRows(
          (d.records || []).map((r) => ({ ...(r.data || {}), _id: r.id, _by: r.created_by_name || "", _at: r.created_at })),
          uu.users || [], ["createdBy", "_by", "passto", "assignedTo", "hod"]));
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  return <EnquiryDashboardView rows={all} users={users} busy={busy} err={err} shown={shown} onShow={load} />;
}

export function EnquiryDashboardView({ rows, users, busy, err, shown, onShow }) {
  const nav = useNavigate();
  const now = useNow(60000);
  const pf = usePlaceFilter(users);
  const dr = useDateRange();
  const [src, setSrc] = useState("");

  const dateOf = (r) => readDate(r._at) || readDate(r.date) || readDate(r.createdAt);

  const list = useMemo(() => (rows || []).filter((r) => {
    if (r.isDuplicate) return false;
    if (src && (r.leadFrom || r.leadSource || "") !== src) return false;
    if (!dr.inRange(dateOf(r))) return false;
    if (pf.any) {
      const own = pf.matchAny([whoOf(r)]);
      const onlyState = pf.state && !pf.zone && !pf.hod && !pf.person;
      if (!own && !(onlyState && low(r.state) === low(pf.state))) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, src, dr.from, dr.to, pf.zone, pf.state, pf.hod, pf.person, users]);

  const S = useMemo(() => {
    const by = { new: [], waiting: [], working: [], win: [], spam: [] };
    list.forEach((r) => by[enquiryStage(r)].push(r));
    const real = list.length - by.spam.length;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRows = list.filter((r) => { const d = dateOf(r); return d && d >= today; });
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      by, real,
      today: todayRows.length,
      assignedToday: todayRows.filter((r) => whoOf(r)).length,
      winMonth: by.win.filter((r) => { const d = readDate(r.winDate) || dateOf(r); return d && d >= monthStart; }).length,
      winAmt: by.win.reduce((s, r) => s + (Number(r.winAmount) || 0), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, Math.floor(now / 3600000)]);

  const months = useMemo(() => monthBars(list, dateOf, 12), [list]);
  const sources = useMemo(() => [...new Set((rows || []).map((r) => r.leadFrom || r.leadSource).filter(Boolean))].sort(), [rows]);

  const people = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const n = whoOf(r);
      if (!n) return;
      const x = m.get(n) || { name: n, total: 0, waiting: 0, working: 0, win: 0, amt: 0 };
      x.total++;
      const st = enquiryStage(r);
      if (x[st] != null) x[st]++;
      if (st === "win") x.amt += Number(r.winAmount) || 0;
      m.set(n, x);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [list]);

  const recent = useMemo(() => [...list].sort((a, b) => (dateOf(b) || 0) - (dateOf(a) || 0)).slice(0, 7), [list]);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";
  const goList = () => nav("/admin/sfa/enquiry");
  const anyFilter = pf.any || dr.any || src;

  return (
    <DxPage title="Enquiry Dashboard" sub="Where every enquiry stands"
      actions={shown && <><RefreshBtn onClick={onShow} busy={busy} /><button className="dx-btn dx-btn-p" onClick={goList}><ExternalLink size={15} /> Open Enquiries</button></>}>
      <div className="dx-filters">
        {pf.fields}
        <div><label>Lead from</label>
          <select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select></div>
        {dr.fields}
        {anyFilter && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={() => { pf.clear(); dr.clear(); setSrc(""); }}>Clear</button>}
      </div>

      {!shown || (busy && !rows) ? <ShowGate onShow={onShow} busy={busy} what="enquiries" />
      : err ? <div className="dx-card dx-empty" style={{ color: "var(--dx-bad)" }}>{err}</div>
      : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Total Enquiries" value={fmtInt(S.real)} chip={S.today} sub="came in today" onClick={goList} />
            <KpiCard label="Not Assigned" value={fmtInt(S.by.new.length)} chip={S.assignedToday} sub="given out today" onClick={goList} />
            <KpiCard label="No Reply Yet" value={fmtInt(S.by.waiting.length)} sub={S.by.waiting.length ? "given out, nothing heard back" : "everyone has responded"} onClick={goList} />
            <KpiCard label="Win" value={fmtInt(S.by.win.length)} chip={pct(S.by.win.length, S.real) + "%"} sub="of all enquiries won" onClick={goList} />
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Enquiries by month" sub="Last 12 months · this month in deep blue">
              <WeekBars days={months} unit="enquiries" height={250} />
            </Panel>
            <Panel title="Where they stand" sub="Every enquiry, by stage">
              <HalfDonut size={260} center={pct(S.by.working.length + S.by.win.length, S.real) + "%"} centerLabel="being worked or won"
                segments={[
                  { label: "Win", value: S.by.win.length, color: ORD[0] },
                  { label: "Processing", value: S.by.working.length, color: ORD[1] },
                  { label: "No reply", value: S.by.waiting.length, color: ORD[2] },
                  { label: "Not assigned", value: S.by.new.length, color: ORD[3] },
                ]} />
            </Panel>
            <Panel night title="Today" sub="Live, as enquiries come in">
              <TodayClock />
              <div className="dx-stat-mini">
                <div><b>{num(S.today)}</b><span>New today</span></div>
                <div><b>{num(S.assignedToday)}</b><span>Assigned</span></div>
                <div><b>{num(S.winMonth)}</b><span>Won this month</span></div>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: "rgba(233,240,255,.7)" }}>
                Won value so far <b style={{ color: "#fff", fontSize: 15, marginLeft: 6 }}>{money(S.winAmt)}</b>
              </div>
              <NightList title="Just came in" empty="No enquiries yet."
                rows={recent.slice(0, 4).map((r) => ({ label: r.company || r.customer || "Enquiry", sub: (whoOf(r) || "Not assigned") + " · " + (r.state || "—"), value: ago(dateOf(r), now) }))} />
            </Panel>
          </div>

          <Panel title="Pipeline" sub="How far enquiries get — the share under each stage is out of all enquiries" style={{ marginBottom: 16 }}>
            <Pipeline steps={[
              { label: "All enquiries", value: S.real },
              { label: "Assigned", value: S.real - S.by.new.length },
              { label: "Processing or won", value: S.by.working.length + S.by.win.length },
              { label: "Win", value: S.by.win.length },
            ]} />
          </Panel>

          <div className="dx-grid dx-row-even" style={{ marginBottom: 16 }}>
            <Panel title="Most enquiries handled" sub="Given to each person">
              <RankBars items={people.map((p) => ({ label: p.name, value: p.total, note: p.win ? `${p.win} won` : "" }))} photoOf={photoOf} />
            </Panel>
            <Panel title="Lead source" sub="Where enquiries come from">
              <RankBars items={countBy(list, (r) => r.leadFrom || r.leadSource)} />
            </Panel>
            <Panel title="Top states" sub="By the enquiry's own state">
              <RankBars items={countBy(list, (r) => r.state)} />
            </Panel>
          </div>

          <div className="dx-grid dx-row-4">
            <Panel title="Latest enquiries" sub="Newest first">
              <RowList rows={recent.map((r) => {
                const st = STAGE[enquiryStage(r)];
                const d = dateOf(r);
                return {
                  key: r._id, title: r.company || r.customer || "Enquiry", avatar: whoOf(r) || r.company, photo: photoOf(whoOf(r)),
                  meta: <>{whoOf(r) || "Not assigned"} · {r.state || "—"}{d ? " · " + d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</>,
                  right: <WordPill text={st.word} tone={st.tone} />,
                };
              })} />
            </Panel>
            <Panel title="Performance by person" sub="Enquiries given, and what became of them">
              <div style={{ overflowX: "auto" }}>
                <table className="dx-table">
                  <thead><tr>{["Person", "Given", "No reply", "Processing", "Win", "Win %", "Win value"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {people.length === 0 ? <tr><td colSpan={7} className="dx-empty">No enquiries for these filters.</td></tr>
                    : people.slice(0, 25).map((p) => (
                      <tr key={p.name}>
                        <td><b>{p.name}</b></td>
                        <td>{p.total}</td>
                        <td style={{ color: p.waiting ? "var(--dx-bad)" : undefined, fontWeight: p.waiting ? 700 : 400 }}>{p.waiting || "—"}</td>
                        <td>{p.working || "—"}</td>
                        <td>{p.win || "—"}</td>
                        <td>{pct(p.win, p.total)}%</td>
                        <td>{p.amt ? money(p.amt) : "—"}</td>
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
