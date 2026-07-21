import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, RefreshCw } from "lucide-react";
import { api } from "../lib/api.js";

/* ---------------------------------------------------------------------------
   Attendance Sheet — mee Excel sheet laga month grid.
   Codes: P = Local · T = Tour (Ex/Outstation) · WFH = Work From Home
          L = Leave (approved) · HO = Holiday · S = Sunday/Weekly off · blank = Absent
--------------------------------------------------------------------------- */

const CODE_STYLE = {
  P:   { bg: "#e8f7ee", color: "#1f7a44" },
  T:   { bg: "#eef1ff", color: "#3949ab" },
  WFH: { bg: "#fff7e0", color: "#9a7500" },
  L:   { bg: "#fdecec", color: "#c03636" },
  HO:  { bg: "#e0f0ff", color: "#1565c0" },
  S:   { bg: "#f1f3f8", color: "#8a93a8" },
};

export default function AttendanceSheet() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [zoneF, setZoneF] = useState("All Zones");
  const [cityF, setCityF] = useState("All Cities");
  const [userF, setUserF] = useState("All Users");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [users, setUsers] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [busy, setBusy] = useState(false);

  const [Y, M] = month.split("-").map(Number);
  const daysInMonth = new Date(Y, M, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const load = () => {
    setBusy(true);
    Promise.all([api.listUsers(), api.attList(from, to), api.list("leave", false), api.list("holidays", false)])
      .then(([u, a, l, h]) => {
        setUsers((u.users || []).filter((x) => Number(x.status) !== 0));
        setSessions(a.sessions || []);
        setLeaves((l.records || []).map((r) => r.data));
        setHolidays((h.records || []).map((r) => r.data));
      })
      .catch(() => { setUsers([]); })
      .finally(() => setBusy(false));
  };
  useEffect(load, [month]);

  /* date -> holiday? */
  const holidaySet = useMemo(() => {
    const s = new Set();
    holidays.forEach((h) => { const d = h.date || h.from; if (d && d.startsWith(month)) s.add(d.slice(0, 10)); });
    return s;
  }, [holidays, month]);

  /* user_id + date -> session */
  const sessMap = useMemo(() => {
    const m = {};
    sessions.forEach((s) => { m[`${s.user_id}|${s.work_date}`] = s; });
    return m;
  }, [sessions]);

  /* user name/code -> approved leave dates */
  const leaveMap = useMemo(() => {
    const m = {};
    leaves.forEach((l) => {
      if ((l.status || "").toLowerCase() !== "approved") return;
      const who = l.createdBy || l.appliedBy || l.user || "";
      const a = new Date(l.from), b = new Date(l.to || l.from);
      for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
        const key = `${who}|${d.toISOString().slice(0, 10)}`;
        m[key] = true;
      }
    });
    return m;
  }, [leaves]);

  const codeFor = (u, dateStr, dow) => {
    const s = sessMap[`${u.id}|${dateStr}`];
    if (s) {
      const vt = (s.visit_type || "").toLowerCase();
      if (vt === "wfh") return "WFH";
      if (vt === "exstation" || vt === "outstation") return "T";
      return "P";
    }
    if (leaveMap[`${u.name}|${dateStr}`] || leaveMap[`${u.code}|${dateStr}`]) return "L";
    if (holidaySet.has(dateStr)) return "HO";
    const off = (u.weekly_off || "Sunday").slice(0, 3).toLowerCase();
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dow];
    if (dayName === off) return "S";
    return "";
  };

  const zones = useMemo(() => ["All Zones", ...[...new Set((users || []).map((u) => u.zone).filter(Boolean))].sort()], [users]);
  const cities = useMemo(() => ["All Cities", ...[...new Set((users || []).map((u) => u.city).filter(Boolean))].sort()], [users]);
  const userNames = useMemo(() => ["All Users", ...(users || []).map((u) => u.name).sort()], [users]);

  /* From/To range: month lopala day columns limit */
  const dayRange = useMemo(() => {
    let a = 1, b = daysInMonth;
    if (dFrom && dFrom.startsWith(month)) a = Number(dFrom.slice(8, 10));
    if (dTo && dTo.startsWith(month)) b = Number(dTo.slice(8, 10));
    return [Math.min(a, b), Math.max(a, b)];
  }, [dFrom, dTo, month, daysInMonth]);

  const grid = useMemo(() => {
    if (!users) return null;
    let filtered = users;
    if (zoneF !== "All Zones") filtered = filtered.filter((u) => u.zone === zoneF);
    if (cityF !== "All Cities") filtered = filtered.filter((u) => u.city === cityF);
    if (userF !== "All Users") filtered = filtered.filter((u) => u.name === userF);
    return filtered.map((u) => {
      const cells = [];
      let p = 0, t = 0, wfh = 0, l = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${month}-${String(d).padStart(2, "0")}`;
        const dow = new Date(Y, M - 1, d).getDay();
        const c = codeFor(u, dateStr, dow);
        if (c === "P") p++; if (c === "T") t++; if (c === "WFH") wfh++; if (c === "L") l++;
        cells.push(c);
      }
      return { u, cells, totals: { p, t, wfh, l, present: p + t + wfh } };
    });
  }, [users, sessMap, leaveMap, holidaySet, month, zoneF, cityF, userF]);

  const exportCsv = () => {
    if (!grid) return;
    const head = ["Name", "Code", "Zone", "City", ...Array.from({ length: daysInMonth }, (_, i) => i + 1), "Local", "Tour", "WFH", "Leave"];
    const rows = grid.map(({ u, cells, totals }) =>
      [u.name, u.code || "", u.zone || "", u.city || "", ...cells, totals.present, totals.t, totals.wfh, totals.l]);
    const csv = [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `attendance-${month}.csv`;
    a.click();
  };

  const dayHead = Array.from({ length: dayRange[1] - dayRange[0] + 1 }, (_, i) => {
    const d = dayRange[0] + i;
    const dow = new Date(Y, M - 1, d).getDay();
    return { d, w: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][dow], sun: dow === 0 };
  });

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>SFA</div>
          <h2 style={{ fontFamily: "Bricolage Grotesque", fontSize: 22, fontWeight: 800, margin: "2px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={20} /> Attendance Sheet
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={selS} />
          <input type="date" value={dFrom} onChange={(e) => setDFrom(e.target.value)} title="From date" style={selS} />
          <input type="date" value={dTo} onChange={(e) => setDTo(e.target.value)} title="To date" style={selS} />
          <select value={zoneF} onChange={(e) => setZoneF(e.target.value)} style={selS}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
          <select value={cityF} onChange={(e) => setCityF(e.target.value)} style={selS}>{cities.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={userF} onChange={(e) => setUserF(e.target.value)} style={selS}>{userNames.map((n) => <option key={n}>{n}</option>)}</select>
          <button className="btn btn-ghost" onClick={load} disabled={busy} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <RefreshCw size={14} className={busy ? "spin" : ""} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={exportCsv} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries({ P: "Local", T: "Tour", WFH: "Work From Home", L: "Leave", HO: "Holiday", S: "Weekly Off" }).map(([k, label]) => (
          <span key={k} style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: CODE_STYLE[k].bg, color: CODE_STYLE[k].color }}>
            {k} — {label}
          </span>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 900 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
              <tr style={{ background: "#f4f6fc" }}>
                <th style={{ ...th, position: "sticky", left: 0, background: "#f4f6fc", zIndex: 6, minWidth: 160, textAlign: "left" }}>Sales Person</th>
                {dayHead.map((d) => (
                  <th key={d.d} style={{ ...th, minWidth: 30, background: d.sun ? "#e9edf6" : "#f4f6fc" }}>
                    <div>{d.d}</div><div style={{ fontSize: 9, color: "#8a93a8" }}>{d.w}</div>
                  </th>
                ))}
                {["P", "T", "WFH", "L"].map((k) => <th key={k} style={{ ...th, background: CODE_STYLE[k].bg, color: CODE_STYLE[k].color }}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid === null ? (
                <tr><td colSpan={daysInMonth + 5} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : grid.length === 0 ? (
                <tr><td colSpan={daysInMonth + 5} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No users</td></tr>
              ) : grid.map(({ u, cells, totals }) => (
                <tr key={u.id} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "7px 12px", fontWeight: 700, position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap", zIndex: 2 }}>
                    {u.name}
                    <div style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 600 }}>{[u.code, u.city].filter(Boolean).join(" · ")}</div>
                  </td>
                  {cells.slice(dayRange[0] - 1, dayRange[1]).map((c, i) => (
                    <td key={i} style={{
                      padding: "6px 3px", textAlign: "center", fontWeight: 800, fontSize: 10.5,
                      background: c ? CODE_STYLE[c].bg : (dayHead[i].sun ? "#fafbfd" : "#fff"),
                      color: c ? CODE_STYLE[c].color : "#c3cad8",
                    }}>{c || "·"}</td>
                  ))}
                  <td style={tot}>{totals.p}</td>
                  <td style={tot}>{totals.t}</td>
                  <td style={tot}>{totals.wfh}</td>
                  <td style={tot}>{totals.l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const selS = { padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 12.5, background: "#fff" };
const th = { padding: "7px 5px", fontWeight: 800, fontSize: 10.5, color: "#4a5578", textAlign: "center", whiteSpace: "nowrap" };
const tot = { padding: "6px 8px", textAlign: "center", fontWeight: 800, fontSize: 11 };
