import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { visibleUsers, visibleNameSet, isUnderHod } from "../lib/scope.js";
import { Avatar } from "../lib/avatar.jsx";

/* Live check-in overview — 4 cards (Total Users, Login, Pending, Leave).
   Click a card → that list below. No map, no per-row view. */
export default function CheckinPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [stateF, setStateF] = useState("");
  const [hodF, setHodF] = useState("");     // #7 — cascade HOD step
  const [userF, setUserF] = useState("");   // #7 — cascade User step
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
        /* a HOD sees only their own team here as well */
        const allowed = visibleUsers(u.users || []);
        const allow = new Set(allowed.map((x) => x.name));
        setSessions((d.sessions || []).filter((s2) => allow.has(s2.name)));
        setAllUsers(allowed.filter((x) => Number(x.status) !== 0 && x.role !== "Admin"));
        setLeaves((l.records || []).map((r) => r.data));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  /* #7 — the filter dropdowns must look the same before and after Show, so the
     user list is fetched once on mount (not only when Show is pressed). */
  useEffect(() => {
    api.listUsers().then((u) => {
      const allowed = visibleUsers(u.users || []);
      setAllUsers(allowed.filter((x) => Number(x.status) !== 0 && x.role !== "Admin"));
    }).catch(() => {});
  }, []);

  const inScope = allUsers.filter((u) =>
    (!zone || u.zone === zone)
    && (!stateF || [u.state, ...String(u.states || "").split(",")].map((x) => String(x || "").trim().toLowerCase()).includes(stateF.trim().toLowerCase()))
    && (!hodF || isUnderHod(allUsers, u.name, hodF))
    && (!userF || u.name === userF)
    && (!city || u.city === city));
  const checkedIds = new Set(sessions.map((s) => String(s.user_id)));
  const loginUsers = inScope.filter((u) => checkedIds.has(String(u.id)));
  /* A HOD reading this screen sees their own team everywhere else on it —
     Total, Login and Pending all come from the scoped user list — but the
     leave rows came straight from the module, unscoped, so the Leave card
     counted the whole company. */
  const seeable = visibleNameSet(allUsers.length ? allUsers : []);
  const leaveOwner = (l) => String(l.createdBy || l.appliedBy || l.user || "").trim().toLowerCase();
  const onLeave = leaves.filter((l) => (l.status || "").toLowerCase() === "approved"
    && String(l.from || "").slice(0, 10) <= date && date <= String(l.to || l.from || "").slice(0, 10)
    && (!seeable.size || seeable.has(leaveOwner(l))));
  /* Somebody on approved leave has not failed to check in — they were not due
     to. Pending counted everybody without a session for the day, so an
     approved leave showed the same person under both Leave and Pending, and
     Pending read as a list of people to chase. */
  const leaveNames = new Set(onLeave.map(leaveOwner).filter(Boolean));
  const pendingUsers = inScope.filter((u) =>
    !checkedIds.has(String(u.id)) && !leaveNames.has(String(u.name || "").trim().toLowerCase())
  );

  const sel = { padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };

  const cards = [
    { key: "total", label: "Total Users", value: inScope.length, color: "#4a7bff" },
    { key: "login", label: "Login", value: loginUsers.length, color: "#10b981" },
    { key: "pending", label: "Pending", value: pendingUsers.length, color: "#ef4444", note: leaveNames.size ? "leave excluded" : "" },
    { key: "leave", label: "Leave", value: onLeave.length, color: "#f59e0b" },
  ];

  const listFor = () => {
    const photoOf = (nm) => { const u = (allUsers || []).find((x) => String(x.name).trim().toLowerCase() === String(nm).trim().toLowerCase()); return u ? u.photo : ""; };
    if (show === "login") return loginUsers.map((u) => ({ name: u.name, sub: sessionInfo(u.id), photo: u.photo }));
    if (show === "pending") return pendingUsers.map((u) => ({ name: u.name, sub: u.city || "—", photo: u.photo }));
    if (show === "leave") return onLeave.map((l) => { const nm = l.createdBy || l.appliedBy || l.user || "—"; return { name: nm, sub: `${l.from} → ${l.to || l.from}`, photo: photoOf(nm) }; });
    return inScope.map((u) => ({ name: u.name, sub: checkedIds.has(String(u.id)) ? "Logged in" : "Not logged in", photo: u.photo }));
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
        {/* #7 — Zone → State → HOD → User cascade (users-based), same as every module */}
        {(() => {
          const low = (x) => String(x || "").trim().toLowerCase();
          const uniq = (a) => [...new Set(a.map((x) => String(x || "").trim()).filter(Boolean))].sort();
          const inZone = zone ? allUsers.filter((u) => low(u.zone) === low(zone)) : allUsers;
          const inState = stateF ? inZone.filter((u) => [u.state, ...String(u.states || "").split(",")].map(low).includes(low(stateF))) : inZone;
          const inHod = hodF ? inState.filter((u) => isUnderHod(allUsers, u.name, hodF)) : inState;
          const zones = uniq(allUsers.map((u) => u.zone));
          const states = uniq(inZone.flatMap((u) => [u.state, ...String(u.states || "").split(",")]));
          const hods = uniq(inState.filter((u) => /hod/i.test(u.role || "")).map((u) => u.name));
          const usersL = uniq(inHod.map((u) => u.name));
          return (
            <>
              {zones.length > 0 && <select value={zone} onChange={(e) => { setZone(e.target.value); setStateF(""); setHodF(""); setUserF(""); }} style={sel}><option value="">All Zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>}
              <select value={stateF} onChange={(e) => { setStateF(e.target.value); setHodF(""); setUserF(""); }} style={sel}><option value="">All States</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
              {hods.length > 0 && <select value={hodF} onChange={(e) => { setHodF(e.target.value); setUserF(""); }} style={sel}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>}
              <select value={userF} onChange={(e) => setUserF(e.target.value)} style={sel}><option value="">All Users</option>{usersL.map((u) => <option key={u}>{u}</option>)}</select>
              <select value={city} onChange={(e) => setCity(e.target.value)} style={sel}><option value="">All Cities</option>{uniq(inHod.map((u) => u.city)).map((c) => <option key={c}>{c}</option>)}</select>
            </>
          );
        })()}
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
            {c.note ? <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, marginTop: 1 }}>{c.note}</div> : null}
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
                  <Avatar name={r.name} photo={r.photo} size={34} />
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
