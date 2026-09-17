/* Biltrax projects assigned to this person. Read-only detail view — the field
   team sees the project information they need on site, nothing else. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../lib/api.js";

const CU = () => auth.user || {};
const card = { background: "#fff", borderRadius: 13, padding: 13, marginBottom: 9, boxShadow: "var(--shadow)" };
const line = (k, v) => v ? (
  <div key={k} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f2f4fa", fontSize: 12.5 }}>
    <div style={{ width: 132, color: "var(--muted)", fontWeight: 700 }}>{k}</div>
    <div style={{ flex: 1 }}>{v}</div>
  </div>
) : null;

export default function BiltraxList() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("All");
  const [view, setView] = useState(null);

  useEffect(() => {
    api.list("biltrax", false).then((d) => {
      const me = CU().name;
      setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))
        .filter((r) => r.assignPerson === me));
    }).catch(() => setRows([]));
  }, []);

  const list = useMemo(() => {
    if (!rows) return null;
    if (tab === "All") return rows;
    return rows.filter((r) => (r.biltraxType || "Requested") === tab);
  }, [rows, tab]);

  return (
    <>
      <div className="f-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => nav(-1)} aria-label="Back"
          style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, lineHeight: 1, cursor: "pointer", fontWeight: 800, color: "var(--navy)" }}>‹</button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Biltrax</h2>
      </div>

      <div className="f-seg" style={{ margin: "12px 18px" }}>
        {["All", "Requested", "Appointment"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="f-list-pad">
        {!list ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        : list.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No Biltrax projects assigned to you.
          </div>
        ) : list.map((r) => (
          <div key={r._id} style={card} onClick={() => setView(r)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{r.projectName || "Project"}</div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
                background: r.biltraxType === "Appointment" ? "#fff4e5" : "#eef2ff",
                color: r.biltraxType === "Appointment" ? "#ad6800" : "#4f46e5" }}>
                {r.biltraxType || "Requested"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
              {[r.landmark, r.address].filter(Boolean).join(" · ")}
            </div>
            {r.biltraxType === "Appointment" && r.appointmentDate && (
              <div style={{ fontSize: 11.5, color: "#ad6800", fontWeight: 700, marginTop: 4 }}>📅 {r.appointmentDate}</div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 700, marginTop: 6 }}>View details →</div>
          </div>
        ))}
      </div>

      {view && (
        <div onClick={() => setView(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.55)", zIndex: 300, display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 18, maxHeight: "86vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>{view.projectName || "Biltrax Project"}</h3>
            {line("Type", view.biltraxType || "Requested")}
            {line("Latest Sub Status", view.latestSubStatus)}
            {line("Landmark", view.landmark)}
            {line("Address", view.address)}
            {line("Associated Companies", view.associatedCompanies)}
            {line("Building Use", view.buildingUse)}
            {line("Professional Detail 1", view.professional1)}
            {line("Professional Detail 2", view.professional2)}
            {line("Professional Detail 3", view.professional3)}
            {line("Professional Detail 4", view.professional4)}
            {view.biltraxType === "Appointment" && line("Appointment Date", view.appointmentDate)}
            {Array.isArray(view.chat) && view.chat.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>💬 Messages</div>
                {view.chat.map((m, i) => (
                  <div key={i} style={{ background: "#f4f7ff", borderRadius: 9, padding: "8px 10px", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--navy)" }}>{m.by}</div>
                    <div style={{ fontSize: 12.5 }}>{m.text}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{m.at}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="f-submit" style={{ width: "100%", marginTop: 14 }} onClick={() => setView(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
