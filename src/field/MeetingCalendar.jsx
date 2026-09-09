/* Month calendar of upcoming customer meetings (from "Next Meeting Date"). */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MeetingCalendar() {
  const nav = useNavigate();
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [rows, setRows] = useState([]);
  const [pick, setPick] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.customers("", true)
      .then((d) => setRows(d.customers || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  /* group meetings by date */
  const byDate = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const dt = r.nextMeetingDate || r.next_meeting || "";
      if (!dt) return;
      const key = String(dt).slice(0, 10);
      (m[key] = m[key] || []).push(r);
    });
    return m;
  }, [rows]);

  const year = cur.getFullYear(), month = cur.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;                 // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const iso = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = new Date().toISOString().slice(0, 10);
  const dayList = byDate[pick] || [];
  const fmtPick = (() => {
    const d = new Date(pick);
    return isNaN(d.getTime()) ? pick : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  })();

  return (
    <>
      <div className="f-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => nav(-1)} aria-label="Back"
          style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, lineHeight: 1, cursor: "pointer", fontWeight: 800, color: "var(--navy)" }}>‹</button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Meeting Calendar</h2>
      </div>
      <div className="f-form" style={{ paddingBottom: 120 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setCur(new Date(year, month - 1, 1))} style={nav}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 14.5 }}>
            {cur.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setCur(new Date(year, month + 1, 1))} style={nav}>›</button>
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "var(--shadow)", marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
            {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "var(--muted)" }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const key = iso(d);
              const n = (byDate[key] || []).length;
              const isToday = key === todayIso, isPick = key === pick;
              return (
                <div key={i} onClick={() => setPick(key)}
                  style={{
                    height: 40, borderRadius: 9, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative",
                    background: isPick ? "var(--navy)" : isToday ? "#e8f0ff" : n ? "#f0fdf4" : "#f7f9fc",
                    color: isPick ? "#fff" : "var(--navy)",
                    border: isToday && !isPick ? "1.5px solid #9dc0ff" : "1px solid transparent",
                    fontWeight: n ? 800 : 600, fontSize: 12.5,
                  }}>
                  {d}
                  {n > 0 && <span style={{ position: "absolute", bottom: 4, width: 5, height: 5, borderRadius: 3, background: isPick ? "#fff" : "#1f9d55" }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>
          {fmtPick} · {dayList.length} meeting{dayList.length === 1 ? "" : "s"}
        </div>

        {loading ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        : dayList.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13, boxShadow: "var(--shadow)" }}>
            No meetings on this day.
          </div>
        ) : dayList.map((c, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 13, marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {[c.contactName, c.mobile, c.place].filter(Boolean).join(" · ")}
            </div>
            {c.nextMeetingRemark ? <div style={{ fontSize: 12, marginTop: 6, background: "#f4f7ff", padding: "7px 9px", borderRadius: 8 }}>📝 {c.nextMeetingRemark}</div> : null}
            {c.mobile ? <a href={`tel:${c.mobile}`} style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>📞 Call</a> : null}
          </div>
        ))}
      </div>
    </>
  );
}

const nav = { width: 34, height: 34, borderRadius: 10, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 800 };
