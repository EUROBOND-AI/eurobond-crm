import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { MODULES as ALL_MODULES } from "./moduleConfigs.jsx";

// ALL app screens — generic modules + custom screens (Customers, Target, Attendance, etc.)
const CUSTOM_SCREENS = [
  { key: "customerForm", label: "Customer (Add Form)" },
  { key: "customers", label: "Customers" },
  { key: "nearby", label: "Near By Customers" },
  { key: "leaveApproval", label: "Leave Approval (HOD)" },
  { key: "target", label: "Target" },
  { key: "teamPerformance", label: "Team Performance (HOD)" },
  { key: "attendance", label: "Attendance" },
  { key: "siteProjectForm", label: "Site Project (Add Form)" },
];
const APP_MODULES = [
  ...Object.entries(ALL_MODULES).filter(([, c]) => c.app).map(([k, c]) => ({ key: k, label: c.appLabel || c.crumb })),
  ...CUSTOM_SCREENS,
];
const ROLES = ["HOD (Sales)", "HOD (Spec)", "Sales Person", "Spec Person", "Admin"];

/* default visibility per role (admin can override & save) */
const HOD_ONLY = ["leaveApproval", "teamPerformance"];
const SALES_ONLY = ["salesToSpec"];
const SPEC_ONLY = ["specToSales"];
const roleDefault = (role, key) => {
  const r = role.toLowerCase();
  const isAdmin = r.includes("admin");
  const isHodSales = r === "hod (sales)";
  const isHodSpec = r === "hod (spec)";
  const isSales = r === "sales person";
  const isSpec = r === "spec person";
  if (isAdmin) return true;                                  // Admin -> everything
  if (HOD_ONLY.includes(key)) return isHodSales || isHodSpec; // Leave Approval / Team Perf -> HODs
  if (SALES_ONLY.includes(key)) return isSales || isHodSales; // Sales to Spec
  if (SPEC_ONLY.includes(key)) return isSpec || isHodSpec;    // Spec to Sales
  return true;                                               // rest -> all users
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
      <PageHead crumb="Master / User & Team Access" title="User & Team Access (App Modules)" />
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
