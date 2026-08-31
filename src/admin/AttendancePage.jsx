import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { FileText, X } from "lucide-react";
import { PageHead, Pill } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { fmtKm } from "../lib/geo.js";

const rawTime = (dt) => {
  if (!dt) return null;
  const m = String(dt).match(/(\d{2}):(\d{2})/);
  if (!m) return null;
  let h = +m[1]; const min = m[2]; const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ap}`;
};

/* ---- session download: Excel (CSV) + PDF (print window) ---- */
function downloadSessionExcel(s, points, visits) {
  const rows = [
    ["EUROBOND — Attendance Session"],
    ["Date", s.work_date], ["Name", s.name], ["Emp Code", s.code || ""],
    ["Type", s.visit_type || "Local"], ["Area", s.visit_name || ""], ["HOD", s.manager || ""],
    ["Zone", s.zone || ""], ["City", s.city || ""],
    ["Login Time", rawTime(s.start_time) || ""], ["Logout Time", rawTime(s.end_time) || ""],
    ["Distance (km)", (Number(s.distance_km) || 0).toFixed(2)],
    ["Start Address", s.start_address || ""], ["End Address", s.end_address || ""],
    [], ["Customer Visits"],
    ["#", "Customer", "Address", "Type"],
    ...(visits || []).map((v, i) => [i + 1, v.partyName || v.customer || "", v.address || "", v.type || v.category || ""]),
    [], ["GPS Timeline"],
    ["#", "Time", "Location"],
    ...(points || []).map((p, i) => [i + 1, p.recorded_at ? String(p.recorded_at).slice(11, 16) : "", p.address || `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_${s.name}_${s.work_date}.csv`;
  a.click();
}

function downloadSessionPdf(s, visits, points) {
  const w = window.open("", "_blank");
  const visitRows = (visits || []).map((v, i) => `<tr><td>${i + 1}</td><td>${v.partyName || v.customer || ""}</td><td>${v.address || ""}</td></tr>`).join("");
  const pointRows = (points || []).map((p, i) => `<tr><td>${i + 1}</td><td>${p.recorded_at ? String(p.recorded_at).slice(11, 16) : ""}</td><td>${p.address || (Number(p.lat).toFixed(5) + ", " + Number(p.lng).toFixed(5))}</td></tr>`).join("");
  w.document.write(`
    <html><head><title>Attendance ${s.name} ${s.work_date}</title>
    <style>body{font-family:Arial;padding:24px;color:#1c2340}h2{color:#0b3c8c}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border:1px solid #ccc;padding:7px;text-align:left;font-size:12px}th{background:#eef1ff}.kv{margin:4px 0}</style>
    </head><body>
    <h2>EUROBOND — Attendance Report</h2>
    <div class="kv"><b>Name:</b> ${s.name} (${s.code || "—"})</div>
    <div class="kv"><b>Date:</b> ${s.work_date} &nbsp; <b>Type:</b> ${s.visit_type || "Local"} &nbsp; <b>Area:</b> ${s.visit_name || "—"}</div>
    <div class="kv"><b>HOD:</b> ${s.manager || "—"} &nbsp; <b>Zone:</b> ${s.zone || "—"} &nbsp; <b>City:</b> ${s.city || "—"}</div>
    <div class="kv"><b>Login:</b> ${rawTime(s.start_time) || "—"} &nbsp; <b>Logout:</b> ${rawTime(s.end_time) || "—"} &nbsp; <b>Distance:</b> ${(Number(s.distance_km) || 0).toFixed(2)} km</div>
    <div class="kv"><b>Start:</b> ${s.start_address || "—"}</div>
    <div class="kv"><b>End:</b> ${s.end_address || "—"}</div>
    <h3>Customer Visits (${(visits || []).length})</h3>
    <table><tr><th>#</th><th>Customer</th><th>Address</th></tr>${visitRows || '<tr><td colspan="3">None</td></tr>'}</table>
    <h3>GPS Timeline (${(points || []).length} points)</h3>
    <table><tr><th>#</th><th>Time</th><th>Location</th></tr>${pointRows || '<tr><td colspan="3">None</td></tr>'}</table>
    <p style="margin-top:20px;color:#888;font-size:11px">Generated ${new Date().toLocaleString("en-IN")}</p>
    </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [user, setUser] = useState("");
  const [viewSess, setViewSess] = useState(null);   // session being viewed on map
  const [photoView, setPhotoView] = useState(null); // {url, label} same-page photo popup
  const [absentFor, setAbsentFor] = useState(null); // session to mark absent
  const thumb = { width: 38, height: 38, objectFit: "cover", borderRadius: 8, border: "1px solid #dfe4f0", cursor: "pointer" };

  const markAbsent = async (s, remark) => {
    try {
      await api.attMarkAbsent(s.id, remark);
      setSessions((x) => x.map((y) => (y.id === s.id ? { ...y, marked_absent: 1, absent_remark: remark } : y)));
      setAbsentFor(null);
    } catch (e) { alert(e.message); }
  };
  const unmarkAbsent = async (s) => {
    if (!confirm(`Remove absent mark for ${s.name}?`)) return;
    try {
      await api.attUnmarkAbsent(s.id);
      setSessions((x) => x.map((y) => (y.id === s.id ? { ...y, marked_absent: 0 } : y)));
    } catch (e) { alert(e.message); }
  };
  const mapRef = useRef(null);
  const mapObj = useRef(null);

  const [shown, setShown] = useState(false);
  const loadData = () => {
    setShown(true);
    setLoading(true);
    api.attList(date, dateTo).then((d) => setSessions(d.sessions || [])).catch(() => setSessions([])).finally(() => setLoading(false));
  };

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

  /* map modal for one session — Login/In-Between/Logout markers + travel points panel */
  const [routePoints, setRoutePoints] = useState([]);
  const [ptAddr, setPtAddr] = useState({});
  /* reverse-geocode each timeline point to a full address (cached by lat,lng) */
  useEffect(() => {
    let stop = false;
    (async () => {
      for (const p of routePoints.slice(0, 100)) {
        if (stop) break;
        const key = `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
        /* geocode if we don't have a browser address yet AND the stored one looks coarse
           (no street/road/society — e.g. only "Mumbai Zone 4, R/C Ward" from a fallback) */
        const stored = p.address || "";
        const looksCoarse = !stored || /zone \d|ward|district|suburban/i.test(stored) && stored.split(",").length <= 4;
        if (ptAddr[key] || (stored && !looksCoarse)) continue;
        let full = "";
        /* 1) Nominatim — has real street/road/society detail */
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&addressdetails=1`, { headers: { "Accept-Language": "en" } });
          if (r.ok) {
            const j = await r.json();
            const a = j.address || {};
            if (a && Object.keys(a).length) {
              const place = a.amenity || a.building || a.shop || a.office || a.hospital || a.school || a.college || "";
              const road = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(" ");
              const locality = [a.neighbourhood, a.suburb, a.quarter, a.residential, a.city_district].filter((x, i, arr) => x && arr.indexOf(x) === i);
              const parts = [place, road, ...locality, a.city || a.town || a.village, a.state].filter(Boolean);
              full = (parts.join(", ") + (a.postcode ? " " + a.postcode : "")).trim();
              if (!full && j.display_name) full = j.display_name.replace(/, India$/, "");
            }
          }
        } catch {}
        /* 2) fallback: BigDataCloud (coarser but never blocked) */
        if (!full) {
          try {
            const r2 = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.lat}&longitude=${p.lng}&localityLanguage=en`);
            const j2 = await r2.json();
            const parts = [j2.locality, j2.city && j2.city !== j2.locality ? j2.city : "", j2.principalSubdivision, j2.postcode].filter(Boolean);
            full = parts.join(", ").trim();
          } catch {}
        }
        if (full && !stop) setPtAddr((m) => ({ ...m, [key]: full }));
        await new Promise((res) => setTimeout(res, 1100));   // Nominatim ~1 req/sec
      }
    })();
    return () => { stop = true; };
  }, [routePoints]);
  const [custVisits, setCustVisits] = useState([]);
  useEffect(() => {
    if (!viewSess || !mapRef.current) return;
    setRoutePoints([]);
    const m = L.map(mapRef.current, { attributionControl: true }).setView([20.59, 78.96], 5);
    m.attributionControl.setPrefix("Gonti");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© Gonti", maxZoom: 19 }).addTo(m);
    mapObj.current = m;
    const pinIcon = (color, label) => L.divIcon({
      className: "route-pin",
      html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,.4);display:grid;place-items:center;border:2px solid #fff"><span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:800">${label}</span></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26],
    });
    /* kick off a server-side address fill for any points missing one (non-blocking,
       a few at a time) so PDF/Excel and future opens have addresses ready */
    try { api.attGeocode(viewSess.id).catch(() => {}); } catch {}
    api.attTrack(viewSess.id).then((d) => {
      /* show ALL uploaded points — don't drop weak-accuracy ones (phones often report
         ±60-100m indoors, and dropping them made the admin timeline look empty) */
      const raw = (d.points || []);
      setRoutePoints(raw);
      const pts = raw.map((p) => [Number(p.lat), Number(p.lng)]);
      if (pts.length) {
        if (pts.length > 1) {
          const poly = L.polyline(pts, { color: "#e8422e", weight: 4, opacity: 0.85 }).addTo(m);
          /* snap the line to roads via OSRM so it follows streets, same as the app map */
          (async () => {
            try {
              const coords = pts.map((p) => `${p[1]},${p[0]}`).join(";");
              const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
              const j = await r.json();
              const line = j.routes && j.routes[0] && j.routes[0].geometry && j.routes[0].geometry.coordinates;
              if (line && line.length) poly.setLatLngs(line.map(([lng, lat]) => [lat, lng]));
            } catch {}
          })();
        }
        L.marker(pts[0], { icon: pinIcon("#20bf6b", "S") }).addTo(m).bindPopup("Start");
        const running = String(viewSess.status || "").toUpperCase() === "RUNNING" || !viewSess.end_time;
        if (pts.length > 1 || !running) {
          L.marker(pts[pts.length - 1], { icon: pinIcon(running ? "#2f6fed" : "#e8422e", running ? "L" : "E") })
            .addTo(m).bindPopup(running ? "Live location" : "End");
        }
        m.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
      }
    }).catch(() => {});

    /* CUSTOMER VISIT POINTS (violet "In Between") — sales person aa roju add chesina
       customers (follow-up locations) route meeda violet markers ga. */
    api.list("followup").then((d) => {
      const visits = (d.records || [])
        .filter((r) => (r.created_by_name === viewSess.name) &&
          (String(r.created_at || "").slice(0, 10) === String(viewSess.work_date).slice(0, 10)))
        .map((r) => r.data || r)
        .filter((v) => v.lat && v.lng);
      setCustVisits(visits);
      visits.forEach((v, i) => {
        L.marker([Number(v.lat), Number(v.lng)], { icon: pinIcon("#8b5cf6", i + 1) }).addTo(m)
          .bindPopup(`<b>${v.partyName || v.customer || "Customer"}</b><br>${v.address || ""}`);
      });
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
          <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent", marginLeft: 4 }} onClick={loadData}>{loading ? "Loading…" : "Show"}</button>
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

      {!shown ? <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>Select date range and filters, then click <b>Show</b> to load attendance.</div>
      : loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : filtered.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No attendance found for the selected filters.</div>
      : (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th>Date</th><th>Zone</th><th>City</th><th>HOD</th><th>Emp Code</th><th>Emp Name</th><th>Type</th><th>Area</th><th>Login Time</th><th>Logout Time</th><th>Distance</th><th>Login Photo</th><th>Logout Photo</th><th>Reading In</th><th>Reading Out</th><th>GPS Status</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} style={s.marked_absent ? { background: "#fff5f5" } : undefined}>
                <td>{s.work_date}</td>
                <td>{s.zone || "—"}</td>
                <td>{s.city || "—"}</td>
                <td>{s.manager || "—"}</td>
                <td>{s.code || "—"}</td>
                <td style={{ fontWeight: 700 }}>{s.name}</td>
                <td><span style={{ fontWeight: 700, fontSize: 12 }}>{s.visit_type || "Local"}{s.transport ? ` · ${s.transport}` : ""}</span></td>
                <td>{s.visit_name || "—"}</td>
                <td>{rawTime(s.start_time) || "—"}</td>
                <td>{rawTime(s.end_time) || "Running"}</td>
                <td>{fmtKm(Number(s.distance_km) || 0)}</td>
                <td>{s.start_selfie ? <img src={s.start_selfie} alt="Login" onClick={() => setPhotoView({ url: s.start_selfie, label: "Login Photo" })} style={thumb} /> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td>{s.end_selfie ? <img src={s.end_selfie} alt="Logout" onClick={() => setPhotoView({ url: s.end_selfie, label: "Logout Photo" })} style={thumb} /> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td>{s.start_reading ? <img src={s.start_reading} alt="Reading In" onClick={() => setPhotoView({ url: s.start_reading, label: "Reading In (Odometer)" })} style={thumb} /> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td>{s.end_reading ? <img src={s.end_reading} alt="Reading Out" onClick={() => setPhotoView({ url: s.end_reading, label: "Reading Out (Odometer)" })} style={thumb} /> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                <td>
                  {(() => {
                    const on = s.app_status === "Live";
                    const closed = s.app_status === "GPS Off" || s.app_status === "App Closed";
                    return (
                      <span title={on ? "GPS ON (live)" : closed ? "GPS OFF" : "Completed"} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          width: 34, height: 19, borderRadius: 12, background: on ? "#20bf6b" : "#cbd2e0",
                          position: "relative", display: "inline-block", transition: "background .2s",
                        }}>
                          <span style={{
                            position: "absolute", top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: "50%",
                            background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
                          }} />
                        </span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: on ? "#1f7a44" : "#8a93a8" }}>{on ? "ON" : "OFF"}</span>
                      </span>
                    );
                  })()}
                </td>
                <td>{s.marked_absent ? <Pill status="Absent" /> : <Pill status={s.status === "DONE" ? "Completed" : "In Progress"} />}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setViewSess(s)}>View</button>
                    {s.marked_absent
                      ? <button className="btn" style={{ padding: "5px 10px", fontSize: 12, background: "#e2f8f1", color: "#00b894" }} onClick={() => unmarkAbsent(s)}>Un-absent</button>
                      : <button className="btn btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setAbsentFor(s)}>Absent</button>}
                  </div>
                </td>
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
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-soft" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => downloadSessionExcel(viewSess, routePoints.map((p) => ({ ...p, address: p.address || ptAddr[`${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`] || "" })), custVisits)}>⬇ Excel</button>
                <button className="btn btn-pink" style={{ padding: "6px 11px", fontSize: 12 }} onClick={() => downloadSessionPdf(viewSess, custVisits, routePoints.map((p) => ({ ...p, address: p.address || ptAddr[`${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`] || "" })))}>⬇ PDF</button>
                <button className="btn btn-ghost" onClick={() => setViewSess(null)}><X size={14} /></button>
              </div>
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
                    <div key={label} onClick={() => window.dispatchEvent(new CustomEvent("crm-lightbox", { detail: u }))} style={{ textAlign: "center", fontSize: 10.5, color: "var(--muted)", cursor: "pointer" }}>
                      <img src={u} alt={label} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid #dfe4f0", display: "block", marginBottom: 3 }} />
                      {label}
                    </div>
                  ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 }}>
              <div ref={mapRef} style={{ height: 440, width: "100%", borderRadius: 12, overflow: "hidden" }} />
              <div style={{ height: 440, overflowY: "auto", background: "#f8f9ff", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: "#8b5cf6", marginBottom: 8 }}>Customer Visits ({custVisits.length})</div>
                {custVisits.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>No customer visits recorded this day.</div>}
                {custVisits.map((v, i) => (
                  <div key={i} style={{ borderLeft: "3px solid #8b5cf6", background: "#fff", borderRadius: 8, padding: "8px 10px", marginBottom: 7, boxShadow: "var(--shadow)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#8b5cf6", background: "#f1ebff", padding: "1px 7px", borderRadius: 6 }}>Visit {i + 1}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{v.partyName || v.customer || "Customer"}</span>
                    </div>
                    {v.address && <div style={{ fontSize: 11.5, color: "var(--ink)", marginBottom: 2 }}>{v.address}</div>}
                    {(v.type || v.category) && <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{v.category || ""} {v.type ? "· " + v.type : ""}</div>}
                  </div>
                ))}
                <div style={{ fontWeight: 800, fontSize: 12.5, color: "var(--muted)", margin: "14px 0 8px" }}>Timeline ({routePoints.length} points)</div>
                {(() => {
                  /* cumulative distance up to each point (ignore <60m drift, skip >5km jumps) */
                  const hav = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
                  let cum = 0, prev = null;
                  return routePoints.slice(0, 100).map((p, i) => {
                  const pt = { lat: Number(p.lat), lng: Number(p.lng) };
                  if (prev) { const d = hav(prev, pt); if (d * 1000 >= 60 && d < 5) cum += d; }
                  prev = pt;
                  const running = String(viewSess.status || "").toUpperCase() === "RUNNING" || !viewSess.end_time;
                  const isLast = i === routePoints.length - 1;
                  const label = i === 0 ? "Start" : (isLast ? (running ? "Live" : "End") : "Point " + (i + 1));
                  const geoAddr = ptAddr[`${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`];
                  const addr = geoAddr || p.address;
                  return (
                  <div key={i} style={{ borderLeft: `3px solid ${i === 0 ? "#20bf6b" : (isLast && !running) ? "#e8422e" : isLast ? "#2f6fed" : "#c5cae0"}`, background: "#fff", borderRadius: 8, padding: "7px 10px", marginBottom: 6, boxShadow: "var(--shadow)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? "#20bf6b" : (isLast && !running) ? "#e8422e" : isLast ? "#2f6fed" : "var(--muted)" }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>{cum.toFixed(2)} km</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 3, fontWeight: 600, lineHeight: 1.4 }}>{addr || "Finding address…"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>🔋 {p.battery != null ? p.battery + "%" : "NA"}</span>
                      <span>{p.online === 1 || p.online === true ? "🟢 Online" : p.online === 0 || p.online === false ? "🔴 Offline" : "📶 NA"}</span>
                      <span>🕐 {p.recorded_at ? String(p.recorded_at).slice(11, 16) : ""}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>📍 {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}</div>
                  </div>
                  );
                });
                })()}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 16, fontSize: 12.5, fontWeight: 700 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: 4, background: "#20bf6b" }} /> Login</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: 4, background: "#8b5cf6" }} /> Customer Visit</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: 4, background: "#e8422e" }} /> Logout</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy)" }}>Total KM Traveled: <span style={{ color: "var(--accent)" }}>{(Number(viewSess.distance_km) || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      )}

      {photoView && (
        <div className="modal-mask" onClick={() => setPhotoView(null)} style={{ zIndex: 300 }}>
          <div className="modal" style={{ maxWidth: 480, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{photoView.label}</h3>
              <button className="btn btn-ghost" onClick={() => setPhotoView(null)}><X size={16} /></button>
            </div>
            <img src={photoView.url} alt={photoView.label} style={{ width: "100%", borderRadius: 12 }} />
          </div>
        </div>
      )}

      {absentFor && (
        <AbsentModal session={absentFor} onClose={() => setAbsentFor(null)} onSave={(remark) => markAbsent(absentFor, remark)} />
      )}
    </>
  );
}

function AbsentModal({ session, onClose, onSave }) {
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-mask" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Mark Absent — {session.name}</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
          This marks the person absent for {session.work_date} even though they logged in. They will get a notification with your remark.
        </p>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Remark (required)</label>
        <textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Did not visit market, wasted time near office…"
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", marginTop: 6, marginBottom: 14 }} />
        <button className="btn btn-danger" style={{ width: "100%" }} disabled={!remark.trim() || busy}
          onClick={async () => { setBusy(true); await onSave(remark.trim()); setBusy(false); }}>
          {busy ? "Marking…" : "Mark Absent & Notify"}
        </button>
      </div>
    </div>
  );
}
