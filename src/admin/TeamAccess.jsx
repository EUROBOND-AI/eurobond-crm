import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { MODULES as ALL_MODULES } from "./moduleConfigs.jsx";

// Actual app screens (must match the app's module grid exactly)
const APP_MODULES = [
  { key: "customers", label: "Customers" },
  { key: "nearby", label: "Near By Customers" },
  { key: "enquiry", label: "Enquiry" },
  { key: "quotation", label: "Quotation" },
  { key: "projectProjection", label: "Project Projection" },
  { key: "salesToSpec", label: "Sales to Spec" },
  { key: "specToSales", label: "Spec to Sales" },
  { key: "expense", label: "Expense" },
  { key: "leave", label: "Leave" },
  { key: "target", label: "Target" },
  { key: "teamPerformance", label: "Team Performance" },
  { key: "teamTracking", label: "Team Tracking" },
  { key: "teamCustomers", label: "Team Customers Tracking" },
  { key: "leaveApproval", label: "Leave Approval" },
  { key: "attendance", label: "Attendance" },
  { key: "siteProjectForm", label: "Site Project" },
  { key: "task", label: "Task" },
];
/* Admin excluded — Admin always sees all app modules. These are the roles admin configures. */
const ROLES = ["HOD (Sales)", "HOD (Specs)", "Sub HOD (Sales)", "Sub HOD (Specs)", "Sales Person", "Specs Person", "Sales Collection"];

/* default visibility per role (admin can override & save) */
const HOD_ONLY = ["leaveApproval", "teamPerformance", "teamTracking", "teamCustomers"];
const SALES_ONLY = ["salesToSpec"];
const SPEC_ONLY = ["specToSales"];
const roleDefault = (role, key) => {
  /* Everything starts OFF — the admin ticks exactly what each role can see. No auto-defaults. */
  return false;
};
const emptyMap = () => Object.fromEntries(ROLES.map((r) => [r, Object.fromEntries(APP_MODULES.map((m) => [m.key, roleDefault(r, m.key)]))]));

export default function TeamAccess() {
  const [map, setMap] = useState(emptyMap());
  const [recId, setRecId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.list("teamAccess").then((d) => {
      const rec = (d.records || [])[0];
      if (rec) { setRecId(rec.id); setMap({ ...emptyMap(), ...(rec.data.map || {}) }); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = (role, mod) => {
    setMap((m) => ({ ...m, [role]: { ...(m[role] || {}), [mod]: !(m[role] && m[role][mod]) } }));
    setSaved(false);
  };

  const save = async () => {
    try {
      if (recId) await api.update("teamAccess", recId, { map });
      else { const r = await api.create("teamAccess", { map }); setRecId(r.id); }
      setSaved(true);
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <PageHead crumb="Master / App user & Team Access" title="App user & Team Access (App Modules)" />
      <div style={{ background: "#eef2ff", border: "1px solid #dbe3ff", borderRadius: 12, padding: "10px 14px", margin: "0 0 14px", fontSize: 12.5, color: "#3a4468" }}>
        <b>Admin</b> always sees all app modules. Tick below what each other role can see in the app.
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 14 }}>
        Choose which app modules each role can see in the mobile app. Sales, Specification and HOD roles can each have a different set.
      </p>
      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div> : (
        <div className="chart-card" style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 12 }}>App Module</th>
                {ROLES.map((r) => <th key={r} style={{ padding: 12, textAlign: "center", fontSize: 12.5 }}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {APP_MODULES.map((m) => (
                <tr key={m.key} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 12, fontWeight: 600, fontSize: 13 }}>{m.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} style={{ textAlign: "center", padding: 12 }}>
                      <input type="checkbox" checked={!!(map[r] && map[r][m.key])} onChange={() => toggle(r, m.key)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={save}>Save Access</button>
        {saved && <span style={{ color: "#1f9d55", fontSize: 13, fontWeight: 700 }}>✓ Saved</span>}
      </div>
    </>
  );
}
