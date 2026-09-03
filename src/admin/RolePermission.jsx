import { useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const MODULES = ["Dashboard", "Attendance", "Attendance Sheet", "Checkin", "Tour Report", "Expense", "Leave", "Enquiry", "Customers", "Quotation", "Project Projection", "Targets", "Sales to Spec", "Spec to Sales", "Task", "Holidays", "Areas", "Products", "Announcement", "Notification", "App Users", "Admin Users", "Role & Permission"];
const PERMS = ["Add", "Approve", "Delete", "Export", "Import", "Modify", "View"];
/* Fixed roles — same as User creation (no add/delete) */
/* Admin is not listed — Admin always has full access to everything (no toggles needed).
   These are the roles whose permissions the admin configures. */
const STD_ROLES = ["HOD (Sales)", "HOD (Specs)", "Sub HOD (Sales)", "Sub HOD (Specs)", "Sales Person", "Specs Person", "Sales Collection"];

const emptyGrid = () => Object.fromEntries(MODULES.map((m) => [m, Object.fromEntries(PERMS.map((p) => [p, false]))]));
const adminGrid = () => Object.fromEntries(MODULES.map((m) => [m, Object.fromEntries(PERMS.map((p) => [p, true]))]));

export default function RolePermission() {
  const [roles, setRoles] = useState([]);
  const [active, setActive] = useState(null);      // {_id, name, grid}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.list("roles");
      let rs = (d.records || []).map((r) => ({ _id: r.id, name: r.data.name, grid: r.data.grid || emptyGrid() }));
      /* seed any missing role with an empty grid — admin ticks what each role can see */
      for (const name of STD_ROLES) {
        if (!rs.find((r) => r.name === name)) {
          try { const res = await api.create("roles", { name, grid: emptyGrid() }); rs.push({ _id: res.id, name, grid: emptyGrid() }); } catch {}
        }
      }
      /* keep only the configured roles, in fixed order (Admin excluded — always full access) */
      rs = STD_ROLES.map((name) => rs.find((r) => r.name === name)).filter(Boolean);
      setRoles(rs);
      setActive((cur) => rs.find((r) => cur && r._id === cur._id) || rs[0] || null);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cell = (m, p) => (active.grid[m] && active.grid[m][p]) || false;
  const toggle = (m, p) => setActive({ ...active, grid: { ...active.grid, [m]: { ...(active.grid[m] || {}), [p]: !cell(m, p) } } });
  const toggleCol = (p) => {
    const allOn = MODULES.every((m) => cell(m, p));
    const grid = { ...active.grid };
    MODULES.forEach((m) => { grid[m] = { ...(grid[m] || {}), [p]: !allOn }; });
    setActive({ ...active, grid });
  };
  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await api.update("roles", active._id, { name: active.name, grid: active.grid });
      setRoles(roles.map((r) => (r._id === active._id ? active : r)));
      alert("Permissions saved");
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <>
      <PageHead
        crumb="Masters / Role & Permission"
        title="Role & Permission"
        actions={
          <button className="btn btn-soft" onClick={load}><RefreshCw size={14} /> Refresh</button>
        }
      />

      <div style={{ background: "#eef2ff", border: "1px solid #dbe3ff", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: "#3a4468" }}>
        <b>Admin</b> always has full access to every module — no configuration needed. Set below what each other role can see.
      </div>

      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : roles.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>
          <h3 style={{ marginBottom: 8 }}>No roles yet</h3>
          <p style={{ fontSize: 13.5, marginBottom: 16 }}>Create the standard roles, then set what each can access.</p>
          <button className="btn btn-primary" onClick={async () => {
            for (const name of STD_ROLES) { try { await api.create("roles", { name, grid: emptyGrid() }); } catch {} }
            load();
          }}>➕ Create 5 Standard Roles</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {roles.map((r) => (
              <button key={r._id} onClick={() => setActive(r)}
                className={"btn " + (active && active._id === r._id ? "btn-primary" : "btn-ghost")}>
                {r.name}
              </button>
            ))}
          </div>

          {active && (
            <div className="chart-card card-pad" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Permissions — {active.name}</h4>
                <button className="btn" style={{ background: "#d7f5ea", color: "#00885f" }} disabled={saving} onClick={save}>
                  <Save size={14} /> {saving ? "Saving…" : "Update"}
                </button>
              </div>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Module</th>
                    {PERMS.map((p) => (
                      <th key={p} style={{ textAlign: "center", cursor: "pointer" }} onClick={() => toggleCol(p)} title="Toggle all">{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m}>
                      <td style={{ fontWeight: 700 }}>{m}</td>
                      {PERMS.map((p) => (
                        <td key={p} style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={cell(m, p)} onChange={() => toggle(m, p)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
