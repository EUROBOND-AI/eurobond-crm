import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

/* Live check-in overview — 4 cards (Total Users, Login, Pending, Leave).
   Click a card → that list below. No map, no per-row view. */
export default function CheckinPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [stateF, setStateF] = useState("");
  const [sessions, setSessions] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState("login");   // login | pending | leave | total
  const [loaded, setLoaded] = useState(false);

  const loadData = () => {
    setLoaded(true);
    setLoading(true);
    Promise.all([api.attList(date), api.listUsers(), api.list("leave", false)])
      .then(([d, u, l]) => {
        setSessions(d.sessions || []);
        setAllUsers((u.users || []).filter((x) => Number(x.status) !== 0 && x.role !== "Admin"));
        setLeaves((l.records || []).map((r) => r.data));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const inScope = allUsers.filter((u) => (!zone || u.zone === zone) && (!stateF || u.state === stateF) && (!city || u.city === city));
  const checkedIds = new Set(sessions.map((s) => String(s.user_id)));
  const loginUsers = inScope.filter((u) => checkedIds.has(String(u.id)));
  const pendingUsers = inScope.filter((u) => !checkedIds.has(String(u.id)));
  const onLeave = leaves.filter((l) => (l.status || "").toLowerCase() === "approved"
    && String(l.from || "").slice(0, 10) <= date && date <= String(l.to || l.from || "").slice(0, 10));

  const sel = { padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };

  const cards = [
    { key: "total", label: "Total Users", value: inScope.length, color: "#4a7bff" },
    { key: "login", label: "Login", value: loginUsers.length, color: "#10b981" },
    { key: "pending", label: "Pending", value: pendingUsers.length, color: "#ef4444" },
    { key: "leave", label: "Leave", value: onLeave.length, color: "#f59e0b" },
  ];

  const listFor = () => {
    if (show === "login") return loginUsers.map((u) => ({ name: u.name, sub: sessionInfo(u.id) }));
    if (show === "pending") return pendingUsers.map((u) => ({ name: u.name, sub: u.city || "—" }));
    if (show === "leave") return onLeave.map((l) => ({ name: l.createdBy || l.appliedBy || l.user || "—", sub: `${l.from} → ${l.to || l.from}` }));
    return inScope.map((u) => ({ name: u.name, sub: checkedIds.has(String(u.id)) ? "Logged in" : "Not logged in" }));
  };
  const sessionInfo = (uid) => {
    const s = sessions.find((x) => String(x.user_id) === String(uid));
    if (!s) return "";
    return `${s.visit_type || "Local"}${s.visit_name ? " · " + s.visit_name : ""}`;
  };

  return (
    <div>
      <PageHead crumb="SFA" title="Live Check-in" />

      <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={sel} />
        <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={loadData} disabled={loading}>{loading ? "Loading…" : "Show"}</button>
        <select value={zone} onChange={(e) => setZone(e.target.value)} style={sel}>
          <option value="">All Zones</option>
          {[...new Set(allUsers.map((u) => u.zone).filter(Boolean))].map((z) => <option key={z}>{z}</option>)}
        </select>
        <select value={stateF} onChange={(e) => setStateF(e.target.value)} style={sel}>
          <option value="">All States</option>
          {[...new Set(allUsers.map((u) => u.state).filter(Boolean))].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)} style={sel}>
          <option value="">All Cities</option>
          {[...new Set(allUsers.map((u) => u.city).filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {!loaded ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 50, textAlign: "center", color: "var(--muted)", boxShadow: "var(--shadow-3d)" }}>
          Select date and filters, then click <b>Show</b> to load check-in data.
        </div>
      ) : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
        {cards.map((c) => (
          <button key={c.key} onClick={() => setShow(c.key)}
            style={{
              background: "#fff", borderRadius: 16, padding: "18px 20px", textAlign: "left", cursor: "pointer",
              border: show === c.key ? `2.5px solid ${c.color}` : "1px solid var(--line)",
              boxShadow: show === c.key ? `0 10px 24px ${c.color}33` : "0 6px 16px rgba(40,50,100,.08)",
              borderTop: `4px solid ${c.color}`, transition: "all .16s",
            }}>
            <div style={{ fontSize: 11.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>{c.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-3d)" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, textTransform: "capitalize" }}>{show} — {listFor().length}</h3>
        {loading ? <div style={{ color: "var(--muted)", padding: 20 }}>Loading…</div> :
          listFor().length === 0 ? <div style={{ color: "var(--muted)", padding: 20, textAlign: "center" }}>No records.</div> :
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {listFor().map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f6f8fd", borderRadius: 11, padding: "11px 13px" }}>
                  <span style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#5a78ff,#8b5cf6)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{(r.name || "?")[0]}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.sub}</div>
                  </div>
                </div>
              ))}
            </div>}
      </div>
      </>
      )}
    </div>
  );
}
