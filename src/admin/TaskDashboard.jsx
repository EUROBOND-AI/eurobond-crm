/* Task Dashboard — not how many tasks there are, but whether they are being
   finished in the time they were given.

   A task now carries three things the list cannot show at a glance: the hours
   it was allowed, the moment that ran out, and — once it is finished — how
   long it actually took. This screen reads those and answers the question a
   manager is really asking: who finishes on time, who runs late, and by how
   much. */
import { useEffect, useMemo, useState } from "react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { scopeRows, visibleUsers } from "../lib/scope.js";
import { usePager, Pager } from "../components/Pager.jsx";

const DONE = /^(completed|close|closed)$/i;
const DEAD = /^(rejected)$/i;

const hrs = (n) => (n == null ? "—" : `${Number(n).toFixed(1)} h`);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function TaskDashboard() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [person, setPerson] = useState("");
  const [applied, setApplied] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.list("task", false, { slim: true }).catch(() => ({ records: [] })),
      api.listUsers().catch(() => ({ users: [] })),
    ])
      .then(([d, uu]) => {
        setUsers(uu.users || []);
        setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })));
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  /* a task belongs to the person it was given to, not to whoever typed it in,
     so the scope is worked out on the assignee */
  const scoped = useMemo(
    () => scopeRows(rows || [], users, ["assignee", "assignedTo", "createdBy"]),
    [rows, users]
  );

  /* The day a task is counted under is the day it was handed over. Finishing
     late should not move a task into next month's figures. */
  const startedOn = (t) => String(t.startedAt || t.createdAt2 || t.createdAt || "").slice(0, 10);

  const list = useMemo(() => {
    if (!applied) return [];
    let l = scoped;
    if (applied.person) {
      const p = applied.person.toLowerCase();
      l = l.filter((t) => String(t.assignee || t.assignedTo || "").toLowerCase().includes(p));
    }
    if (applied.from) l = l.filter((t) => { const d = startedOn(t); return !d || d >= applied.from; });
    if (applied.to) l = l.filter((t) => { const d = startedOn(t); return !d || d <= applied.to; });
    return l;
  }, [scoped, applied]);

  const stats = useMemo(() => {
    const done = list.filter((t) => DONE.test(String(t.status || "")));
    const open = list.filter((t) => !DONE.test(String(t.status || "")) && !DEAD.test(String(t.status || "")));
    /* late means two different things and both matter: a finished task that
       missed its deadline, and one still running that has already passed it */
    const lateDone = done.filter((t) => t.onTime === false);
    const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now());
    const timed = done.filter((t) => Number(t.tookHours) > 0);
    const avg = timed.length ? timed.reduce((s, t) => s + Number(t.tookHours), 0) / timed.length : null;
    /* only tasks that were actually given a deadline can be judged on time */
    const judged = done.filter((t) => t.onTime === true || t.onTime === false);
    return {
      total: list.length,
      done: done.length,
      open: open.length,
      lateDone: lateDone.length,
      overdue: overdue.length,
      avg,
      onTimePct: judged.length ? pct(judged.length - lateDone.length, judged.length) : null,
      judged: judged.length,
    };
  }, [list]);

  /* One line per person: what they were given, what they finished, and how
     much of it was inside the time. */
  const perPerson = useMemo(() => {
    const map = new Map();
    list.forEach((t) => {
      /* a task can name more than one person — it counts for each of them */
      const names = Array.isArray(t.assigneeList) && t.assigneeList.length
        ? t.assigneeList
        : String(t.assignee || t.assignedTo || "").split(",");
      names.map((n) => String(n).trim()).filter(Boolean).forEach((n) => {
        const row = map.get(n) || { name: n, total: 0, done: 0, late: 0, overdue: 0, hours: 0, timed: 0 };
        row.total++;
        if (DONE.test(String(t.status || ""))) {
          row.done++;
          if (t.onTime === false) row.late++;
          if (Number(t.tookHours) > 0) { row.hours += Number(t.tookHours); row.timed++; }
        } else if (t.dueAt && new Date(t.dueAt).getTime() < Date.now() && !DEAD.test(String(t.status || ""))) {
          row.overdue++;
        }
        map.set(n, row);
      });
    });
    return [...map.values()]
      .map((r) => ({
        ...r,
        avg: r.timed ? r.hours / r.timed : null,
        onTime: r.done ? pct(r.done - r.late, r.done) : null,
      }))
      /* worst first: this screen exists to find who is slipping */
      .sort((a, b) => (b.late + b.overdue) - (a.late + a.overdue) || b.total - a.total);
  }, [list]);

  const pager = usePager(perPerson, 10, (applied && applied.person) || "");

  const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };
  const th = { padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" };
  const td = { padding: "10px 12px", fontSize: 13, borderTop: "1px solid #eef1f8" };

  const bar = (good, total) => {
    const p = total ? Math.round((good / total) * 100) : 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
        <div style={{ flex: 1, height: 7, background: "#eef1f8", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: p + "%", height: "100%", background: p >= 80 ? "#1f7a44" : p >= 50 ? "#b0640a" : "#c03636" }} />
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", minWidth: 32 }}>{total ? p + "%" : "—"}</span>
      </div>
    );
  };

  return (
    <>
      <PageHead crumb="Analytics Hub" title="Task Dashboard"
        actions={<button className="btn btn-soft" onClick={load}>↻ Refresh</button>} />

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 16px", background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={sel} /></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={sel} /></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Person</label>
          <select value={person} onChange={(e) => setPerson(e.target.value)} style={sel}>
            <option value="">All</option>
            {visibleUsers(users).map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select></div>
        <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }}
          onClick={() => setApplied({ from, to, person })}>{loading ? "Loading…" : "Show"}</button>
        {applied && <button className="btn btn-soft" onClick={() => { setApplied(null); setFrom(""); setTo(""); setPerson(""); }}>Clear</button>}
      </div>

      {!applied ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>
          Choose a period and click <b>Show</b>.
        </div>
      ) : (
        <>
          <div className="stat-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatCard label="Tasks" value={stats.total} sub="in this period" color="#4a7bff" />
            <StatCard label="Completed" value={stats.done} sub={`${pct(stats.done, stats.total)}% of all`} color="#10b981" />
            <StatCard label="Still Open" value={stats.open} sub="not finished yet" color="#f59e0b" />
            <StatCard label="Overdue Now" value={stats.overdue} sub="open, past the time" color="#ef4444" />
            <StatCard label="Finished Late" value={stats.lateDone} sub="done, but past the time" color="#c2185b" />
            <StatCard label="On Time" value={stats.onTimePct == null ? "—" : stats.onTimePct + "%"}
              sub={stats.judged ? `of ${stats.judged} with a deadline` : "no deadlines set yet"} color="#0f7a44" />
            <StatCard label="Average Time" value={stats.avg == null ? "—" : hrs(stats.avg)} sub="to finish a task" color="#5e35b1" />
          </div>

          {stats.judged === 0 && stats.total > 0 && (
            <div style={{ background: "#fff8e8", border: "1px solid #f3e2bd", color: "#7a5a12", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 14 }}>
              None of these tasks were given a time to run in, so there is nothing to judge them against yet.
              Tasks created from now on carry <b>Complete Within (hours)</b> and will appear here.
            </div>
          )}

          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f7f9ff" }}>
                <tr>{["Person", "Given", "Completed", "Finished Late", "Overdue Now", "Average Time", "On Time"]
                  .map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {perPerson.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 36, textAlign: "center", color: "var(--muted)" }}>No tasks in this period.</td></tr>
                ) : pager.slice.map((r) => (
                  <tr key={r.name}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.name}</td>
                    <td style={td}>{r.total}</td>
                    <td style={td}>{r.done}</td>
                    <td style={{ ...td, fontWeight: 800, color: r.late ? "#c03636" : "var(--muted)" }}>{r.late || "—"}</td>
                    <td style={{ ...td, fontWeight: 800, color: r.overdue ? "#b0640a" : "var(--muted)" }}>{r.overdue || "—"}</td>
                    <td style={td}>{hrs(r.avg)}</td>
                    <td style={td}>{bar(r.done - r.late, r.done)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "0 12px 12px" }}><Pager pager={pager} /></div>
          </div>
        </>
      )}
    </>
  );
}
