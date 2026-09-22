/* Month calendar of upcoming customer meetings (from "Next Meeting Date"). */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../lib/api.js";

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
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function MeetingCalendar() {
  const nav = useNavigate();
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [rows, setRows] = useState([]);
  const [pick, setPick] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.customers("", true).catch(() => ({ customers: [] })),
      api.list("biltrax", false).catch(() => ({ records: [] })),
      api.list("enquiry", false).catch(() => ({ records: [] })),
    ])
      .then(([c, b, e]) => {
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
        setRows([...(c.customers || []), ...appts, ...enq]);
      })
      .finally(() => setLoading(false));
  }, []);

  /* group meetings by date */
  const byDate = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const key = toIso(r.nextMeetingDate || r.next_meeting || "");
      if (!key) return;
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
  /* earliest meeting first; those without a time go last */
  const dayList = (byDate[pick] || []).slice().sort((a, b) =>
    String(a.nextMeetingTime || "99:99").localeCompare(String(b.nextMeetingTime || "99:99")));
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

        {loading ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
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
