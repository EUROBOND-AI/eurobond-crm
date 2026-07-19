import { useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const MODULES = ["Dashboard", "Attendance", "Attendance Sheet", "Checkin", "Expense", "Leave", "Leave Approval", "Enquiry", "Customers", "Quotation", "Project Projection", "Targets", "Sales Entries", "Team Performance", "Sales to Spec", "Spec to Sales", "Task", "Holidays", "Announcement", "Notification", "Users", "App Settings", "Masters"];
const PERMS = ["Add", "Approve", "Delete", "Export", "Import", "Modify", "View"];
const STD_ROLES = ["Sales HOD", "Specs HOD", "Sales Person", "Specification Person", "Admin"];

const emptyGrid = () => Object.fromEntries(MODULES.map((m) => [m, Object.fromEntries(PERMS.map((p) => [p, false]))]));

export default function RolePermission() {
  const [roles, setRoles] = useState([]);
  const [active, setActive] = useState(null);      // {_id, name, grid}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.list("roles")
      .then((d) => {
        const rs = (d.records || []).map((r) => ({ _id: r.id, name: r.data.name, grid: r.data.grid || emptyGrid() }));
        setRoles(rs);
        setActive(rs[0] || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addRole = async () => {
    const name = prompt("New role name (e.g. Sales Executive):");
    if (!name) return;
    try {
      const res = await api.create("roles", { name, grid: emptyGrid() });
      const nr = { _id: res.id, name, grid: emptyGrid() };
      setRoles([nr, ...roles]);
      setActive(nr);
    } catch (e) { alert(e.message); }
  };

  const delRole = async () => {
    if (!active || !confirm(`Delete role "${active.name}"?`)) return;
    try { await api.remove("roles", active._id); load(); } catch (e) { alert(e.message); }
  };

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
          <>
            <button className="btn btn-soft" onClick={load}><RefreshCw size={14} /> Refresh</button>
            <button className="btn btn-primary" onClick={addRole}><Plus size={14} /> Add Role</button>
            {active && <button className="btn btn-danger" onClick={delRole}><Trash2 size={14} /> Delete Role</button>}
          </>
        }
      />

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
