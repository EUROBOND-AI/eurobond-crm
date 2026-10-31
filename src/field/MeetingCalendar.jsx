/* Month calendar of upcoming customer meetings (from "Next Meeting Date"). */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../lib/api.js";
import ScreenHead from "../components/ScreenHead.jsx";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* an appointment may be saved as 2026-09-25 or 25-09-2026 depending on where it
   was entered; the calendar groups by YYYY-MM-DD, so normalise first */
function toIso(v) {
  const t = String(v || "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MeetingCalendar() {
  const nav = useNavigate();
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [rows, setRows] = useState([]);
  const [pick, setPick] = useState(() => {
    const x = new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);

  const loadMeetings = () => {
    Promise.all([
      api.customers("", true).catch(() => ({ customers: [] })),
      api.list("biltrax", false).catch(() => ({ records: [] })),
      api.list("enquiry", false).catch(() => ({ records: [] })),
      api.list("task", false, { slim: true }).catch(() => ({ records: [] })),
    ])
      .then(([c, b, e, t]) => {
        const me = (auth.user || {}).name;
        /* Biltrax appointments show here too, alongside customer meetings */
        const appts = (b.records || [])
          .map((r) => ({ _id: r.id, ...r.data }))
          .filter((r) => r.biltraxType === "Appointment" && r.appointmentDate)
          .filter((r) => !me || r.assignPerson === me || r.createdBy === me || r.hod === me)
          .map((r) => ({
            name: r.projectName || "Biltrax project",
            contactName: r.professional1 || "",
            mobile: (String(r.professional1 || "").match(/\d{10}/) || [""])[0],
            place: r.landmark || r.address || "",
            nextMeetingDate: toIso(r.appointmentDate),
            nextMeetingTime: r.appointmentTime || "",
            nextMeetingRemark: r.latestSubStatus || "",
            isBiltrax: true,
          }));
        /* Biltrax call-backs and visits planned from a follow-up remark */
        const bfu = (b.records || [])
          .map((r) => ({ _id: r.id, ...r.data }))
          .filter((r) => r.nextFollowDate && String(r.status || "").toLowerCase() !== "win")
          .filter((r) => !me || r.assignPerson === me || r.createdBy === me)
          .map((r) => ({
            name: r.projectName || "Biltrax project",
            contactName: r.professional1 || "",
            mobile: (String(r.professional1 || "").match(/\d{10}/) || [""])[0],
            place: r.landmark || r.address || "",
            nextMeetingDate: toIso(r.nextFollowDate),
            nextMeetingTime: r.nextFollowTime || "",
            nextMeetingRemark: `${r.nextFollowType || "Call"} · ${r.nextFollowNote || r.lastRemark || ""}`,
            isBiltrax: true,
          }));
        /* enquiry call-backs and visits planned from a remark */
        const enq = (e.records || [])
          .map((r) => ({ _id: r.id, ...r.data }))
          .filter((r) => r.nextFollowDate && (!me || r.assignedTo === me || r.passto === me))
          .filter((r) => !["win", "spam"].includes(String(r.status || "").toLowerCase()))
          .map((r) => ({
            name: r.company || r.customer || "Enquiry",
            contactName: r.contactPerson || "",
            mobile: r.contact || r.phone || "",
            place: r.area || r.city || "",
            nextMeetingDate: toIso(r.nextFollowDate),
            nextMeetingTime: r.nextFollowTime || "",
            nextMeetingRemark: `${r.nextFollowType || "Call"} · ${r.lastRemark || ""}`,
            isEnquiry: true,
          }));
        /* Tasks with a deadline belong on the calendar too.

           A task given to somebody for "tomorrow 8:00 AM" is an appointment
           with a piece of work, and it was the one thing with a time on it
           that this screen did not know about — so a day could look empty
           while three tasks were due on it. Anything already finished drops
           out; the day it lands on is the deadline's own day and time. */
        const tasks = (t.records || [])
          .map((r) => ({ _id: r.id, ...r.data }))
          .filter((r) => r.dueAt)
          .filter((r) => !/^(completed|close|closed|rejected)$/i.test(String(r.status || "")))
          .filter((r) => {
            if (!me) return true;
            const names = Array.isArray(r.assigneeList) && r.assigneeList.length
              ? r.assigneeList
              : String(r.assignee || r.assignedTo || "").split(",");
            return names.map((x) => String(x).trim().toLowerCase()).includes(String(me).toLowerCase())
              || r.createdBy === me;
          })
          .map((r) => {
            const d = new Date(r.dueAt);
            const two = (n) => String(n).padStart(2, "0");
            return {
              name: r.title || r.task || "Task",
              contactName: r.assignee || r.assignedTo || "",
              mobile: "",
              place: r.priority ? `${r.priority} priority` : "",
              nextMeetingDate: isNaN(d) ? "" : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`,
              nextMeetingTime: isNaN(d) ? "" : `${two(d.getHours())}:${two(d.getMinutes())}`,
              nextMeetingRemark: `Task due · ${r.createdBy ? "from " + r.createdBy : ""}`.trim(),
              isTask: true,
              taskId: r._id,
            };
          })
          .filter((x) => x.nextMeetingDate);
        setRows([...(c.customers || []), ...appts, ...bfu, ...enq, ...tasks]);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadMeetings(); /* eslint-disable-next-line */ }, []);
  /* Refresh brings the calendar back with it */
  useEffect(() => {
    const h = () => { setLoading(true); loadMeetings(); };
    window.addEventListener("eb-app-resumed", h);
    return () => window.removeEventListener("eb-app-resumed", h);
    // eslint-disable-next-line
  }, []);

  /* today's date as it reads on the phone (toISOString() would give UTC, which
     is a day behind in India during the early hours) */
  const todayLocal = (() => {
    const x = new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  })();

  /* Group meetings by date, keeping only what is still ahead. A day that has
     gone by drops out, and so does a meeting earlier today whose time has
     already passed — it was still listed in full, which made the screen
     disagree with the count on the home page. A meeting with no time on it
     stays until that day is over. */
  const byDate = useMemo(() => {
    const now = Date.now();
    const m = {};
    rows.forEach((r) => {
      const key = toIso(r.nextMeetingDate || r.next_meeting || "");
      if (!key || key < todayLocal) return;
      if (key === todayLocal) {
        const time = String(r.nextMeetingTime || "").trim();
        if (/^\d{1,2}:\d{2}/.test(time)) {
          const when = new Date(`${key}T${time.slice(0, 5)}:00`);
          if (!isNaN(when.getTime()) && when.getTime() < now) return;
        }
      }
      (m[key] = m[key] || []).push(r);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const year = cur.getFullYear(), month = cur.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;                 // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const iso = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = todayLocal;
  /* earliest meeting first; those without a time go last */
  const dayList = (byDate[pick] || []).slice().sort((a, b) =>
    String(a.nextMeetingTime || "99:99").localeCompare(String(b.nextMeetingTime || "99:99")));
  const fmtPick = (() => {
    const d = new Date(pick);
    return isNaN(d.getTime()) ? pick : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  })();

  return (
    <>
      <ScreenHead title="Meeting Calendar" />
      <div className="f-form" style={{ paddingBottom: 120 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setCur(new Date(year, month - 1, 1))} style={navBtn}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 14.5 }}>
            {cur.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </div>
          <button onClick={() => setCur(new Date(year, month + 1, 1))} style={navBtn}>›</button>
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

        {loading ? <div className="eb-loading"><div className="eb-spin" /></div>
        : dayList.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13, boxShadow: "var(--shadow)" }}>
            No meetings on this day.
          </div>
        ) : dayList.map((c, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 13, marginBottom: 8, boxShadow: "var(--shadow)" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>
              {c.name}
              {c.isBiltrax && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: "#fff4e5", color: "#ad6800", padding: "2px 7px", borderRadius: 999 }}>Biltrax</span>}
              {c.isEnquiry && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: "#f3efff", color: "#6c5ce7", padding: "2px 7px", borderRadius: 999 }}>Enquiry</span>}
              {c.isTask && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: "#e8f1ff", color: "#1f5fa9", padding: "2px 7px", borderRadius: 999 }}>Task</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              {[c.contactName, c.mobile, c.place].filter(Boolean).join(" · ")}
            </div>
            {c.nextMeetingTime ? (
              <div style={{ fontSize: 12, marginTop: 5, fontWeight: 800, color: "var(--navy)" }}>🕐 {(() => {
                const [h, m] = String(c.nextMeetingTime).split(":").map(Number);
                return isNaN(h) ? c.nextMeetingTime : `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
              })()}</div>
            ) : null}
            {c.nextMeetingRemark ? <div style={{ fontSize: 12, marginTop: 6, background: "#f4f7ff", padding: "7px 9px", borderRadius: 8 }}>📝 {c.nextMeetingRemark}</div> : null}
            {c.mobile ? <a href={`tel:${c.mobile}`} style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>📞 Call</a> : null}
          </div>
        ))}
      </div>
    </>
  );
}

const navBtn = { width: 34, height: 34, borderRadius: 10, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, cursor: "pointer", fontWeight: 800 };
