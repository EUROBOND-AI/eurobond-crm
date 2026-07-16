import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapPin, X } from "lucide-react";
import { PageHead, Pill } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { fmtKm, haversineKm } from "../lib/geo.js";

/* reverse geocode with cache (road, area, city) */
const geoCache = {};
async function placeName(lat, lng) {
  const key = lat.toFixed(4) + "," + lng.toFixed(4);
  if (geoCache[key]) return geoCache[key];
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17`, { headers: { "Accept-Language": "en" } });
    const j = await r.json();
    const a = j.address || {};
    const name = [a.road || a.pedestrian || "", a.neighbourhood || a.suburb || "", a.city || a.town || a.village || ""].filter(Boolean).join(", ")
      || j.display_name?.split(",").slice(0, 3).join(",") || "Unknown location";
    geoCache[key] = name;
    return name;
  } catch { return "—"; }
}

export default function CheckinPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [sessions, setSessions] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [routeOf, setRouteOf] = useState(null);          // session being viewed
  const [timeline, setTimeline] = useState([]);           // [{name, time, cumKm, lat, lng}]
  const [tlLoading, setTlLoading] = useState(false);
  const [showList, setShowList] = useState("");           // "in" | "pending" | ""
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.attList(date), api.listUsers()])
      .then(([d, u]) => { setSessions(d.sessions || []); setAllUsers((u.users || []).filter((x) => x.status == 1 && x.role === "FIELD")); })
      .catch(() => {})
      .finally(() => setLoading(false));
    setRouteOf(null); setTimeline([]);
  }, [date]);

  /* init map once — default full India view */
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    mapObj.current = L.map(mapRef.current).setView([21.5, 79.5], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(mapObj.current);
    layerRef.current = L.layerGroup().addTo(mapObj.current);
    setTimeout(() => mapObj.current?.invalidateSize(), 100);
    return () => { mapObj.current?.remove(); mapObj.current = null; };
  }, []);

  /* View → plot that person's route + build timeline */
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();
    setTimeline([]);
    if (!routeOf) { mapObj.current?.setView([21.5, 79.5], 5); return; }

    setTlLoading(true);
    api.attTrack(routeOf.id).then(async (d) => {
      const raw = (d.points || []).map((p) => ({
        lat: Number(p.lat), lng: Number(p.lng),
        accuracy: p.accuracy != null ? Number(p.accuracy) : null,
        time: p.recorded_at ? new Date(p.recorded_at).getTime() : 0,
      })).filter((p) => p.accuracy == null || p.accuracy <= 35);
      if (!raw.length) { setTlLoading(false); return; }

      const latlngs = raw.map((p) => [p.lat, p.lng]);
      L.polyline(latlngs, { color: "#4b5cf0", weight: 4 }).addTo(layerRef.current);
      L.circleMarker(latlngs[0], { radius: 6, fillColor: "#20bf6b", color: "#fff", weight: 2, fillOpacity: 1 }).bindPopup("Start").addTo(layerRef.current);
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, fillColor: "#eb3b5a", color: "#fff", weight: 2, fillOpacity: 1 }).bindPopup(routeOf.name).addTo(layerRef.current);
      mapObj.current.fitBounds(latlngs, { padding: [30, 30] });

      /* spaced timeline points with cumulative km */
      const spaced = [];
      let cum = 0, last = null, lastKept = null;
      raw.forEach((p, i) => {
        if (last) { const dk = haversineKm(last, p); if (dk * 1000 >= 8 && dk < 0.5) cum += dk; }
        const far = !lastKept || haversineKm(lastKept, p) * 1000 >= 150;
        if (far || i === 0 || i === raw.length - 1) { spaced.push({ ...p, cumKm: cum }); lastKept = p; }
        last = p;
      });
      const top = spaced.slice(-12).reverse();
      setTimeline(top.map((p) => ({ ...p, name: "" })));
      for (let i = 0; i < top.length; i++) {
        const nm = await placeName(top[i].lat, top[i].lng);
        setTimeline((t) => t.map((x, idx) => (idx === i ? { ...x, name: nm } : x)));
        await new Promise((r) => setTimeout(r, 1100));
      }
      setTlLoading(false);
    }).catch(() => setTlLoading(false));
  }, [routeOf]);

  const visible = sessions.filter((s) => (!zone || s.zone === zone) && (!city || s.city === city));
  const checkedIds = new Set(visible.map((s) => s.user_id));
  const usersInScope = allUsers.filter((u) => (!zone || u.zone === zone) && (!city || u.city === city));
  const pendingUsers = usersInScope.filter((u) => !checkedIds.has(u.id));

  const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };

  return (
    <>
      <PageHead crumb="SFA / Check-in" title="Check-in & Live Tracking" />

      <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={sel} />
        <select value={zone} onChange={(e) => { setZone(e.target.value); setRouteOf(null); }} style={sel}>
          <option value="">All Zones</option>
          {[...new Set(allUsers.map((u) => u.zone).filter(Boolean))].map((z) => <option key={z}>{z}</option>)}
        </select>
        <select value={city} onChange={(e) => { setCity(e.target.value); setRouteOf(null); }} style={sel}>
          <option value="">All Cities</option>
          {[...new Set(allUsers.map((u) => u.city).filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
        </select>
        {routeOf && <button className="btn btn-soft" onClick={() => setRouteOf(null)}>← Clear map</button>}
      </div>

      {/* summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setShowList(showList === "in" ? "" : "in")} className="chart-card card-pad" style={{ cursor: "pointer", border: showList === "in" ? "2px solid #20bf6b" : "1px solid var(--line)", minWidth: 150, textAlign: "left" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Checked-in</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#20bf6b" }}>{checkedIds.size}</div>
        </button>
        <button onClick={() => setShowList(showList === "pending" ? "" : "pending")} className="chart-card card-pad" style={{ cursor: "pointer", border: showList === "pending" ? "2px solid #eb3b5a" : "1px solid var(--line)", minWidth: 150, textAlign: "left" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Pending</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#eb3b5a" }}>{pendingUsers.length}</div>
        </button>
        <div className="chart-card card-pad" style={{ minWidth: 150 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>Total Field Users</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>{usersInScope.length}</div>
        </div>
      </div>

      {showList === "pending" && (
        <div className="chart-card card-pad" style={{ marginBottom: 14 }}>
          <h4>Pending (not checked-in) — {pendingUsers.length}</h4>
          {pendingUsers.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Everyone has checked in 🎉</p> :
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pendingUsers.map((u) => <span key={u.id} className="pill" style={{ background: "#fdecec", color: "#c03636" }}>{u.name} ({u.city || "—"})</span>)}
            </div>}
        </div>
      )}
      {showList === "in" && (
        <div className="chart-card card-pad" style={{ marginBottom: 14 }}>
          <h4>Checked-in — {checkedIds.size}</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {visible.map((s) => <span key={s.id} className="pill" style={{ background: "#e8f7ee", color: "#1f9d55" }}>{s.name} ({fmtKm(Number(s.distance_km) || 0)})</span>)}
          </div>
        </div>
      )}

      <div className="chart-card" style={{ marginBottom: 16, overflow: "hidden" }}>
        <div ref={mapRef} style={{ height: 420, width: "100%" }} />
      </div>

      {/* timeline for viewed person */}
      {routeOf && (
        <div className="chart-card card-pad" style={{ marginBottom: 16 }}>
          <h4>{routeOf.name} — Timeline ({fmtKm(Number(routeOf.distance_km) || 0)})</h4>
          {tlLoading && timeline.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading route…</p> :
            timeline.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderBottom: "1px solid var(--line)", padding: "9px 0", fontSize: 13 }}>
                <MapPin size={15} color="var(--accent)" style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <b>{p.name || "Finding location…"}</b>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>{fmtKm(p.cumKm || 0)} from start</div>
                </div>
                <span style={{ color: "var(--muted)", fontWeight: 700 }}>{p.time ? new Date(p.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
            ))}
        </div>
      )}

      <div className="chart-card card-pad">
        <h4>Team attendance — {date}</h4>
        {loading ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</p>
        : visible.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>No check-ins for the selected filters.</p>
        : (
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Name</th><th>Zone</th><th>City</th><th>Start</th><th>End</th><th>Distance</th><th>Points</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td>{s.zone || "—"}</td>
                  <td>{s.city || "—"}</td>
                  <td>{s.start_time ? new Date(s.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td>{s.end_time ? new Date(s.end_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Running"}</td>
                  <td>{fmtKm(Number(s.distance_km) || 0)}</td>
                  <td>{s.points_count}</td>
                  <td><Pill status={s.status === "DONE" ? "Completed" : "In Progress"} /></td>
                  <td><button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => { setRouteOf(s); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
