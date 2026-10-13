/* Task Dashboard — live.

   Opens straight onto the numbers and keeps them moving: the deadline clock
   ticks every second, the "left" figures every second with it, and the rows
   are read again from the server every minute while the screen is on show.
   Filters apply as they are changed; there is no Show button to press on a
   screen whose whole point is to be current.

   Split in two on purpose: TaskDashboard fetches, TaskDashboardView only
   draws from what it is given. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, ExternalLink } from "lucide-react";
import { api } from "../lib/api.js";
import {
  visibleUsers, visibleNameSet, isPanelAdmin, taskPeople, taskMatchesPlace,
  hodNamesOf, userByName,
} from "../lib/scope.js";
import { useVisiblePoll } from "../lib/poll.js";
import { Avatar } from "../lib/avatar.jsx";
import {
  KpiCard, Panel, StatusPill, WeekBars, HalfDonut, LiveClock, useNow, useWeek, fmtInt, ShowGate,
} from "../components/dash.jsx";

const DONE = /^(completed|close|closed)$/i;
const DEAD = /^rejected$/i;
const PROG = /^in ?progress$/i;
const H = 3600000;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dueText = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    + " · " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};
const hrs = (n) => (n == null ? "—" : Number(n) < 1 ? `${Math.round(Number(n) * 60)} min` : `${Number(n).toFixed(1)} h`);

/* One word for where a task stands, the same everywhere on the screen. */
export function taskState(t, now) {
  const st = String(t.status || "");
  if (DEAD.test(st)) return "rejected";
  if (DONE.test(st)) return t.onTime === false ? "late" : t.onTime === true ? "ontime" : "done";
  if (!t.dueAt) return "none";
  const left = new Date(t.dueAt).getTime() - now;
  if (left < 0) return "overdue";
  if (left < 24 * H) return "soon";
  return "open";
}

export default function TaskDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  /* nothing is fetched until Show is pressed, like every other dashboard */
  const [shown, setShown] = useState(false);

  const load = () => {
    setShown(true);
    setBusy(true);
    return Promise.all([
      api.list("task", false, { slim: true }).catch(() => ({ records: [] })),
      api.listUsers().catch(() => ({ users: [] })),
    ])
      .then(([d, uu]) => {
        setUsers(uu.users || []);
        setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })));
      })
      .finally(() => setBusy(false));
  };
  useEffect(() => { api.listUsers().then((uu) => setUsers(uu.users || [])).catch(() => {}); }, []);
  /* once shown: fresh rows every minute while the tab is being looked at */
  useVisiblePoll(() => { if (shown) load(); }, 60000);

  return <TaskDashboardView rows={shown ? rows : null} users={users} busy={busy} onRefresh={load} shown={shown} />;
}

export function TaskDashboardView({ rows, users, busy = false, onRefresh, shown = true }) {
  const nav = useNavigate();
  const now = useNow(1000);
  const week = useWeek(new Date(now));

  const [zone, setZone] = useState("");
  const [state, setState] = useState("");
  const [hod, setHod] = useState("");
  const [person, setPerson] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const vis = useMemo(() => visibleUsers(users || []), [users]);

  /* what this login may see: everything for the office team; for anyone
     else, tasks given to or raised by somebody in their team */
  const scoped = useMemo(() => {
    const list = rows || [];
    if (isPanelAdmin()) return list;
    const names = visibleNameSet(users || []);
    return list.filter((t) =>
      taskPeople(t).some((n) => names.has(n.toLowerCase())) || names.has(String(t.createdBy || "").toLowerCase()));
  }, [rows, users]);

  const startedOn = (t) => String(t.startedAt || t.createdAt || "").slice(0, 10);
  const list = useMemo(() => scoped.filter((t) => {
    if (!taskMatchesPlace(t, users || [], { zone, state, hod })) return false;
    if (person && !taskPeople(t).some((n) => n.toLowerCase() === person.toLowerCase())) return false;
    const d = startedOn(t);
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    return true;
  }), [scoped, users, zone, state, hod, person, from, to]);

  /* ---- the figures ---- */
  const S = useMemo(() => {
    const live = list.filter((t) => !DEAD.test(String(t.status || "")));
    const done = live.filter((t) => DONE.test(String(t.status || "")));
    const open = live.filter((t) => !DONE.test(String(t.status || "")));
    const inProg = open.filter((t) => PROG.test(String(t.status || "")));
    const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now);
    const soon = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() >= now && new Date(t.dueAt).getTime() - now < 24 * H);
    const judged = done.filter((t) => t.onTime === true || t.onTime === false);
    const late = judged.filter((t) => t.onTime === false);
    const timed = done.filter((t) => Number(t.tookHours) > 0);
    return {
      total: live.length, done, open, inProg, overdue, soon, judged, late,
      onTimePct: judged.length ? Math.round(((judged.length - late.length) / judged.length) * 100) : null,
      avg: timed.length ? timed.reduce((s, t) => s + Number(t.tookHours), 0) / timed.length : null,
    };
    // `now` moves every second; the minute is enough for these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, Math.floor(now / 60000)]);

  /* finished per day, for the week ending today */
  const weekDays = useMemo(() => week.map((d, i) => {
    const key = ymd(d);
    const n = S.done.filter((t) => t.completedAt && ymd(new Date(t.completedAt)) === key).length;
    return {
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      full: d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" }),
      value: n, isToday: i === week.length - 1,
    };
  }), [week, S.done]);

  /* everything still running, soonest first */
  const upcoming = useMemo(() => S.open
    .filter((t) => t.dueAt)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)), [S.open]);
  const next = upcoming.find((t) => new Date(t.dueAt).getTime() >= now) || upcoming[0] || null;

  const recentDone = useMemo(() => S.done
    .filter((t) => t.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 6), [S.done]);

  /* per person — worst first, because this screen exists to find who is slipping */
  const people = useMemo(() => {
    const m = new Map();
    list.forEach((t) => {
      if (DEAD.test(String(t.status || ""))) return;
      taskPeople(t).forEach((n) => {
        const r = m.get(n) || { name: n, total: 0, done: 0, late: 0, overdue: 0, hours: 0, timed: 0, current: null };
        r.total++;
        if (DONE.test(String(t.status || ""))) {
          r.done++;
          if (t.onTime === false) r.late++;
          if (Number(t.tookHours) > 0) { r.hours += Number(t.tookHours); r.timed++; }
        } else {
          if (t.dueAt && new Date(t.dueAt).getTime() < now) r.overdue++;
          if (!r.current || (t.dueAt && (!r.current.dueAt || new Date(t.dueAt) < new Date(r.current.dueAt)))) r.current = t;
        }
        m.set(n, r);
      });
    });
    return [...m.values()]
      .map((r) => ({ ...r, avg: r.timed ? r.hours / r.timed : null, onTime: r.done ? Math.round(((r.done - r.late) / r.done) * 100) : null }))
      .sort((a, b) => (b.overdue + b.late) - (a.overdue + a.late) || b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, Math.floor(now / 60000)]);

  const zones = useMemo(() => [...new Set(vis.map((u) => u.zone).filter(Boolean))].sort(), [vis]);
  const states = useMemo(() => [...new Set(vis.flatMap((u) => [u.state, ...String(u.states || "").split(",")]).map((x) => String(x || "").trim()).filter(Boolean))].sort(), [vis]);
  const hods = useMemo(() => hodNamesOf(vis), [vis]);
  const photoOf = (n) => (userByName(users || [], n) || {}).photo || "";

  const anyFilter = zone || state || hod || person || from || to;
  const clear = () => { setZone(""); setState(""); setHod(""); setPerson(""); setFrom(""); setTo(""); };
  const goList = () => nav("/admin/sfa/task");

  const pctDone = S.total ? Math.round((S.done.length / S.total) * 100) : 0;

  return (
    <div className="dx dx-plane">
      {/* ---- head ---- */}
      <div className="dx-head">
        <div>
          <div className="dx-title">Task Dashboard</div>
          <div className="dx-sub">Every task your team is running, live — {new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {shown && <button className="dx-btn" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={15} style={busy ? { animation: "ebspin .8s linear infinite" } : undefined} /> Refresh
          </button>}
          <button className="dx-btn dx-btn-p" onClick={goList}><Plus size={15} /> Add Task</button>
        </div>
      </div>

      {/* ---- filters: one row, applied as they change ---- */}
      <div className="dx-filters">
        <div><label>Zone</label>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">All zones</option>{zones.map((z) => <option key={z}>{z}</option>)}
          </select></div>
        <div><label>State</label>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All states</option>{states.map((z) => <option key={z}>{z}</option>)}
          </select></div>
        <div><label>HOD</label>
          <select value={hod} onChange={(e) => setHod(e.target.value)}>
            <option value="">All HODs</option>{hods.map((z) => <option key={z}>{z}</option>)}
          </select></div>
        <div><label>Person</label>
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>{vis.map((u) => <option key={u.id || u.name} value={u.name}>{u.name}</option>)}
          </select></div>
        <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {anyFilter && <button className="dx-btn" onClick={clear} style={{ alignSelf: "flex-end" }}>Clear</button>}
      </div>

      {rows === null ? (
        <ShowGate onShow={onRefresh} busy={busy} what="tasks" />
      ) : (
        <>
          {/* ---- KPI row ---- */}
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Total Tasks" value={fmtInt(S.total)} chip={S.inProg.length}
              sub="in progress right now" onClick={goList} />
            <KpiCard label="Completed" value={fmtInt(S.done.length)} chip={S.onTimePct == null ? "—" : S.onTimePct + "%"}
              sub="finished on time" onClick={goList} />
            <KpiCard label="Still Open" value={fmtInt(S.open.length)} chip={S.soon.length}
              sub="due in the next 24 hours" onClick={goList} />
            <KpiCard label="Overdue Now" value={fmtInt(S.overdue.length)}
              sub={S.overdue.length ? "past their deadline — need attention" : "nothing past its deadline"} onClick={goList} />
          </div>

          {/* ---- row 2 ---- */}
          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Completed this week" sub="Tasks finished each day · today in deep blue">
              <WeekBars days={weekDays} unit="done" height={262} />
            </Panel>

            <Panel title="Next deadline">
              {next ? (
                <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 210 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: "var(--dx-accent-ink)" }}>
                    {next.title || next.task || "Task"}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--dx-mute)", marginTop: 8 }}>Due : {dueText(next.dueAt)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
                    {taskPeople(next).slice(0, 3).map((n) => <Avatar key={n} name={n} photo={photoOf(n)} size={28} ring="var(--dx-card)" />)}
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--dx-ink-2)" }}>{taskPeople(next).join(", ")}</span>
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <StatusPill kind={taskState(next, now)} text={leftText(next.dueAt, now)} />
                    {next.priority && <span className="dx-pill mute">{next.priority} priority</span>}
                  </div>
                  {next.desc && String(next.desc).trim() && (
                    <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.55, color: "var(--dx-ink-2)",
                      display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {next.desc}
                    </div>
                  )}
                  {next.createdBy && <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--dx-mute)" }}>Assigned by <b style={{ color: "var(--dx-ink-2)" }}>{next.createdBy}</b></div>}
                  <div style={{ flex: 1 }} />
                  <button className="dx-btn dx-btn-p" style={{ justifyContent: "center", marginTop: 16, width: "100%" }} onClick={goList}>
                    <ExternalLink size={15} /> Open Task
                  </button>
                </div>
              ) : <div className="dx-empty">No task with a deadline is open.</div>}
            </Panel>

            <Panel title="Upcoming deadlines" action={<button className="dx-btn" style={{ padding: "6px 12px" }} onClick={goList}><Plus size={14} /> New</button>}>
              {upcoming.length === 0 ? <div className="dx-empty">Nothing waiting.</div> : upcoming.slice(0, 6).map((t) => (
                <div key={t._id} className="dx-list-row">
                  <Avatar name={taskPeople(t)[0] || t.title} photo={photoOf(taskPeople(t)[0])} size={30} />
                  <div className="dx-list-main">
                    <div className="dx-list-name">{t.title || t.task || "Task"}</div>
                    <div className="dx-list-meta">Due: {dueText(t.dueAt)}</div>
                  </div>
                  {taskState(t, now) === "overdue" && <StatusPill kind="overdue" />}
                </div>
              ))}
            </Panel>
          </div>

          {/* ---- row 3 ---- */}
          <div className="dx-grid dx-row-2" style={{ marginBottom: 16 }}>
            <Panel title="Team" sub="Who is on what, worst first">
              {people.length === 0 ? <div className="dx-empty">No one has a task here.</div> : people.slice(0, 6).map((p) => {
                const kind = p.overdue ? "overdue" : p.late ? "late" : p.current ? "open" : "done";
                return (
                  <div key={p.name} className="dx-list-row">
                    <Avatar name={p.name} photo={photoOf(p.name)} size={34} />
                    <div className="dx-list-main">
                      <div className="dx-list-name">{p.name}</div>
                      <div className="dx-list-meta">
                        {p.current ? <>Working on <b>{p.current.title || p.current.task || "a task"}</b></> : <>All {p.done} finished</>}
                      </div>
                    </div>
                    <StatusPill kind={kind} text={kind === "overdue" ? `${p.overdue} overdue` : kind === "late" ? `${p.late} late` : undefined} />
                  </div>
                );
              })}
            </Panel>

            <Panel title="Task progress" sub="Every live task, by where it stands">
              <HalfDonut
                size={280}
                center={pctDone + "%"}
                centerLabel="Tasks completed"
                segments={[
                  { label: "Completed", value: S.done.length, color: "#184f95" },
                  { label: "In progress", value: S.inProg.length, color: "#3987e5" },
                  { label: "Pending", value: S.open.length - S.inProg.length, color: "#86b6ef" },
                ]} />
            </Panel>

            <Panel night title="Time tracker" sub={next ? (new Date(next.dueAt).getTime() < now ? "Past its deadline by" : "Until the next deadline") : "No deadline running"}>
              <div style={{ minHeight: 168, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ marginTop: 6 }}><LiveClock target={next && next.dueAt} now={now} /></div>
                {next && <TimeUsed task={next} now={now} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {next ? (next.title || next.task || "Task") : "—"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(233,240,255,.65)", marginTop: 3 }}>
                    {next ? `${taskPeople(next).join(", ") || "Unassigned"} · ${dueText(next.dueAt)}` : "Set a Complete By time on a task to start the clock"}
                  </div>
                </div>
              </div>
              {upcoming.filter((t) => t !== next).length > 0 && (
                <div className="dx-also">
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(233,240,255,.5)", marginBottom: 2 }}>Also running</div>
                  {upcoming.filter((t) => t !== next).slice(0, 4).map((t) => {
                    const late = new Date(t.dueAt).getTime() < now;
                    return (
                      <div key={t._id} className="dx-also-row">
                        <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                          <b>{t.title || t.task || "Task"}</b>
                          <span style={{ fontSize: 11 }}>{taskPeople(t).join(", ") || "Unassigned"}</span>
                        </span>
                        <span className={"t" + (late ? " late" : "")}>{late ? "⏱ " : ""}{leftText(t.dueAt, now)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* ---- row 4: what finished, and the table view ---- */}
          <div className="dx-grid dx-row-4">
            <Panel title="Recently finished" sub="How long each one took">
              {recentDone.length === 0 ? <div className="dx-empty">Nothing finished yet.</div> : recentDone.map((t) => (
                <div key={t._id} className="dx-list-row">
                  <Avatar name={taskPeople(t)[0] || t.title} photo={photoOf(taskPeople(t)[0])} size={30} />
                  <div className="dx-list-main">
                    <div className="dx-list-name">{t.title || t.task || "Task"}</div>
                    <div className="dx-list-meta">Took <b>{hrs(t.tookHours)}</b> · {new Date(t.completedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                  </div>
                  <StatusPill kind={taskState(t, now)} />
                </div>
              ))}
            </Panel>

            <Panel title="Performance by person" sub={S.judged.length ? `On time is judged on ${S.judged.length} finished task(s) that had a deadline` : "Tasks created from now on carry a Complete By time and will be judged here"}>
              <div style={{ overflowX: "auto" }}>
                <table className="dx-table">
                  <thead><tr>{["Person", "Given", "Done", "Late", "Overdue", "Avg time", "On time"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {people.length === 0 ? (
                      <tr><td colSpan={7} className="dx-empty">No tasks for these filters.</td></tr>
                    ) : people.map((p) => (
                      <tr key={p.name}>
                        <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                          <Avatar name={p.name} photo={photoOf(p.name)} size={26} />{p.name}</span></td>
                        <td>{p.total}</td>
                        <td>{p.done}</td>
                        <td style={{ color: p.late ? "var(--dx-bad)" : "var(--dx-mute)", fontWeight: 800 }}>{p.late || "—"}</td>
                        <td style={{ color: p.overdue ? "var(--dx-warn)" : "var(--dx-mute)", fontWeight: 800 }}>{p.overdue || "—"}</td>
                        <td>{hrs(p.avg)}</td>
                        <td style={{ minWidth: 150 }}><Meter pct={p.onTime} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/* "1h 24m left" / "overdue 3h" — the same words the list and the app use */
function leftText(iso, now) {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return undefined;
  const ms = t - now;
  const a = Math.abs(ms);
  const d = Math.floor(a / 86400000), h = Math.floor((a % 86400000) / H), m = Math.floor((a % H) / 60000);
  const txt = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? `Overdue ${txt}` : `${txt} left`;
}

/* How much of the time it was given has already gone.

   The clock above says how long is left; this says how that compares with
   the whole window, which is what tells you whether "3 hours" is relaxed or
   tight. It fills as the seconds go, and turns amber in the last tenth. */
function TimeUsed({ task, now }) {
  const start = new Date(task.startedAt || task.createdAt || 0).getTime();
  const end = new Date(task.dueAt).getTime();
  if (!start || !end || isNaN(start) || isNaN(end) || end <= start) return null;
  const used = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const late = now > end;
  const fmt = (ms) => new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div style={{ margin: "14px 0 16px" }}>
      <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
        <div style={{ width: (used * 100).toFixed(2) + "%", height: "100%", borderRadius: 99,
          background: late ? "#ff8a8a" : used > 0.9 ? "#ffc163" : "#86b6ef", transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(233,240,255,.6)", marginTop: 6, gap: 8 }}>
        <span>Given {fmt(start)}</span>
        <span style={{ fontWeight: 800, color: "rgba(233,240,255,.9)" }}>{Math.round(used * 100)}% of the time used</span>
        <span>Due {fmt(end)}</span>
      </div>
    </div>
  );
}

/* the fill carries how good it is; the track is a lighter step of the same
   blue, so the empty part still reads as part of the bar */
function Meter({ pct }) {
  if (pct == null) return <span style={{ color: "var(--dx-mute)" }}>—</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: "var(--dx-100)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: "var(--dx-600)" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--dx-ink)", minWidth: 36, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}
