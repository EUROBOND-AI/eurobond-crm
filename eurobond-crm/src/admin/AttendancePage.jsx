import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { FileText, X } from "lucide-react";
import { PageHead, Pill } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { fmtKm } from "../lib/geo.js";

export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [user, setUser] = useState("");
  const [viewSess, setViewSess] = useState(null);   // session being viewed on map
  const mapRef = useRef(null);
  const mapObj = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.attList(date, dateTo).then((d) => setSessions(d.sessions || [])).catch(() => setSessions([])).finally(() => setLoading(false));
  }, [date, dateTo]);

  const zones = useMemo(() => [...new Set(sessions.map((s) => s.zone).filter(Boolean))], [sessions]);
  const cities = useMemo(() => [...new Set(sessions.map((s) => s.city).filter(Boolean))], [sessions]);
  const users = useMemo(() => [...new Set(sessions.map((s) => s.name).filter(Boolean))], [sessions]);

  const filtered = sessions.filter((s) =>
    (!zone || s.zone === zone) && (!city || s.city === city) && (!user || s.name === user)
  );

  const exportCsv = () => {
    const head = '"Name","Code","Zone","City","Date","Start","End","Distance (km)","GPS Points","Status"';
    const lines = filtered.map((s) => [
      s.name, s.code || "", s.zone || "", s.city || "", s.work_date,
      s.start_time ? new Date(s.start_time).toLocaleTimeString("en-IN") : "",
      s.end_time ? new Date(s.end_time).toLocaleTimeString("en-IN") : "Running",
      Number(s.distance_km || 0).toFixed(2), s.points_count,
      s.status === "DONE" ? "Completed" : "Running",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${date}.csv`;
    a.click();
  };

  /* map modal for one session */
  useEffect(() => {
    if (!viewSess || !mapRef.current) return;
    const m = L.map(mapRef.current).setView([20.59, 78.96], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(m);
    mapObj.current = m;
    api.attTrack(viewSess.id).then((d) => {
      const pts = (d.points || []).filter((p) => p.accuracy == null || Number(p.accuracy) <= 35).map((p) => [Number(p.lat), Number(p.lng)]);
      if (pts.length) {
        L.polyline(pts, { color: "#4b5cf0", weight: 4 }).addTo(m);
        L.circleMarker(pts[0], { radius: 6, fillColor: "#20bf6b", color: "#fff", weight: 2, fillOpacity: 1 }).bindPopup("Start").addTo(m);
        L.circleMarker(pts[pts.length - 1], { radius: 7, fillColor: "#eb3b5a", color: "#fff", weight: 2, fillOpacity: 1 }).bindPopup("Last point").addTo(m);
        m.fitBounds(pts, { padding: [30, 30] });
      }
    }).catch(() => {});
    setTimeout(() => m.invalidateSize(), 100);
    return () => { m.remove(); mapObj.current = null; };
  }, [viewSess]);

  const sel = { padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };

  return (
    <>
      <PageHead
        crumb="SFA / Attendance"
        title="Attendance Report"
        actions={<button className="btn btn-soft" onClick={exportCsv}><FileText size={14} /> Export</button>}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>From</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={sel} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={sel} />
        </span>
        <select value={zone} onChange={(e) => setZone(e.target.value)} style={sel}>
          <option value="">All Zones</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)} style={sel}>
          <option value="">All Cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={user} onChange={(e) => setUser(e.target.value)} style={sel}>
          <option value="">All Users</option>
          {users.map((u) => <option key={u}>{u}</option>)}
        </select>
      </div>

      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : filtered.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No attendance found for the selected filters.</div>
      : (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th>Date</th><th>Name</th><th>Visit</th><th>Zone</th><th>City</th><th>Start</th><th>End</th><th>Distance</th><th>Photos</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.work_date}</td>
                <td style={{ fontWeight: 700 }}>{s.name}</td>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{s.visit_type || "Local"}{s.transport ? ` · ${s.transport}` : ""}</div>
                  {s.visit_name && <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.visit_name}</div>}
                </td>
                <td>{s.zone || "—"}</td>
                <td>{s.city || "—"}</td>
                <td>{s.start_time ? new Date(s.start_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td>{s.end_time ? new Date(s.end_time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Running"}</td>
                <td>{fmtKm(Number(s.distance_km) || 0)}</td>
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[["S", s.start_selfie, "Start selfie"], ["R", s.start_reading, "Start reading"], ["ES", s.end_selfie, "End selfie"], ["ER", s.end_reading, "End reading"]]
                      .filter(([, u]) => u)
                      .map(([t, u, tip]) => (
                        <a key={t} href={u} target="_blank" rel="noreferrer" title={tip}>
                          <img src={u} alt={t} style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, border: "1px solid #dfe4f0" }} />
                        </a>
                      ))}
                    {!s.start_selfie && !s.start_reading && !s.end_selfie && !s.end_reading && <span style={{ color: "var(--muted)" }}>—</span>}
                  </div>
                </td>
                <td><Pill status={s.status === "DONE" ? "Completed" : "In Progress"} /></td>
                <td><button className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setViewSess(s)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {viewSess && (
        <div className="modal-mask" onClick={() => setViewSess(null)}>
          <div className="modal" style={{ maxWidth: 720, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>{viewSess.name} — route ({fmtKm(Number(viewSess.distance_km) || 0)})</h3>
              <button className="btn btn-ghost" onClick={() => setViewSess(null)}><X size={14} /></button>
            </div>
            {(viewSess.start_address || viewSess.end_address) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10, fontSize: 12 }}>
                {viewSess.start_address && <div style={{ background: "#eef4ff", borderRadius: 9, padding: "8px 10px" }}><b>Start:</b> {viewSess.start_address}</div>}
                {viewSess.end_address && <div style={{ background: "#f3fbf6", borderRadius: 9, padding: "8px 10px" }}><b>End:</b> {viewSess.end_address}</div>}
              </div>
            )}
            {(viewSess.start_selfie || viewSess.start_reading || viewSess.end_selfie || viewSess.end_reading) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                {[["Start selfie", viewSess.start_selfie], ["Start reading", viewSess.start_reading], ["End selfie", viewSess.end_selfie], ["End reading", viewSess.end_reading]]
                  .filter(([, u]) => u)
                  .map(([label, u]) => (
                    <a key={label} href={u} target="_blank" rel="noreferrer" style={{ textAlign: "center", fontSize: 10.5, color: "var(--muted)", textDecoration: "none" }}>
                      <img src={u} alt={label} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid #dfe4f0", display: "block", marginBottom: 3 }} />
                      {label}
                    </a>
                  ))}
              </div>
            )}
            <div ref={mapRef} style={{ height: 420, width: "100%", borderRadius: 12, overflow: "hidden" }} />
          </div>
        </div>
      )}
    </>
  );
}
