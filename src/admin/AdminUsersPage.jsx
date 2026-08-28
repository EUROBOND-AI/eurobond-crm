import { useEffect, useState } from "react";
import { UserPlus, Trash2, X, ShieldCheck } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

/* Admin Users — people who can log into the BACKEND panel (password login).
   Separate from App Users (field staff, OTP login). Role decides which admin
   modules they see (via Role & Permission). */
const ROLES = ["Admin", "HOD (Sales)", "HOD (Specs)", "Sub HOD (Sales)", "Sub HOD (Specs)", "Sales Person", "Specs Person", "Sales Collection"];
const empty = { name: "", username: "", email: "", role: "Admin", password: "" };

export default function AdminUsersPage() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.list("adminUser", false)
    .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))))
    .catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.username || (!form.password && !(form.id || form._id))) { alert("Full name, username and password are required."); return; }
    setBusy(true);
    try {
      if (form.id || form._id) {
        const { _id, id, ...data } = form;
        if (!data.password) delete data.password;   // keep existing password if blank on edit
        await api.update("adminUser", form._id || form.id, data);
      } else {
        await api.create("adminUser", { name: form.name, username: form.username.trim(), email: form.email || "", role: form.role, password: form.password, createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
      }
      setForm(null); load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const del = async (r) => {
    if (!window.confirm(`Remove admin user ${r.name}? They will lose backend access.`)) return;
    try { await api.remove("adminUser", r._id); load(); } catch (e) { alert(e.message); }
  };

  return (
    <>
      <PageHead crumb="Masters / Admin Users" title="Admin Users (Backend Access)" actions={
        <button className="btn btn-primary" onClick={() => setForm({ ...empty })}><UserPlus size={14} /> Add Admin User</button>
      } />

      <div style={{ background: "#eef2ff", border: "1px solid #dbe3ff", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 12.5, color: "#3a4468", display: "flex", gap: 8, alignItems: "center" }}>
        <ShieldCheck size={16} /> Only users added here can log into the <b>Backend panel</b> using their <b>username + password</b> (completely separate from the app's mobile + OTP login). Their role decides which admin modules they see.
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f4f6fc", textAlign: "left" }}>
              {["Full Name", "Username", "Email ID", "Role", "Action"].map((h) => <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No admin users yet. Add one to grant backend access.</td></tr>
              ) : rows.map((r) => (
                <tr key={r._id} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: "11px 14px", fontWeight: 700 }}>{r.username}</td>
                  <td style={{ padding: "11px 14px" }}>{r.email || "—"}</td>
                  <td style={{ padding: "11px 14px" }}><span style={{ fontSize: 11, background: "#eef2ff", color: "#4f46e5", fontWeight: 700, padding: "2px 9px", borderRadius: 7 }}>{r.role}</span></td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setForm({ ...r, password: "" })}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => del(r)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="modal-mask" onClick={() => setForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>{form._id || form.id ? "Edit Admin User" : "Add Admin User"}</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setForm(null)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div><label style={fl}>Full Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={fi} /></div>
              <div><label style={fl}>Username *</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })} placeholder="e.g. karthik.g" autoCapitalize="none" style={fi} /></div>
              <div><label style={fl}>Email ID</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={fi} /></div>
              <div><label style={fl}>Role *</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={fi}>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div><label style={fl}>Password *</label><input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form._id || form.id ? "Enter to change password" : "Set a password"} style={fi} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const fl = { display: "block", fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 5 };
const fi = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 14, boxSizing: "border-box" };
