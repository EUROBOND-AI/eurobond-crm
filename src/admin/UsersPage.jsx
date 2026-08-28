import { useEffect, useState } from "react";
import { UserPlus, KeyRound, Trash2, Search, Download, Upload } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const ROLES = ["Admin", "HOD (Sales)", "HOD (Specs)", "Sub HOD (Sales)", "Sub HOD (Specs)", "Sales Person", "Specs Person", "Sales Collection"];
const GRADES = ["S1", "S2", "S3", "S4", "S5", "M1", "M2", "M3"];
const empty = { name: "", mobile: "", code: "", email: "", role: "Sales Person", grade: "", designation: "", doj: "", dob: "", state: "", zone: "", city: "", manager: "", password: "", nearby_range_m: 500 };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statesList, setStatesList] = useState([]);
  const [stateCities, setStateCities] = useState([]);   // cities/areas for selected state
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);   // null = closed; object = editing/creating
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.listUsers().then((d) => setUsers(d.users || [])).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { api.areaStates().then((d) => setStatesList(d.states || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!form || !form.state) { setStateCities([]); return; }
    api.areasByState(form.state).then((d) => setStateCities(d.areas || [])).catch(() => setStateCities([]));
  }, [form?.state]);

  const IMPORT_COLS = ["name", "mobile", "code", "email", "role", "grade", "designation", "doj", "dob", "state", "zone", "city", "manager", "password"];

  const exportUsers = () => {
    const head = IMPORT_COLS;
    const rows = users.map((u) => head.map((k) => u[k] ?? ""));
    const csv = [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "users.csv"; a.click();
  };

  const importUsers = async (file) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { alert("CSV empty or has no data rows."); return; }
    const parseLine = (l) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === "," && !q) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur); return out;
    };
    const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
    let ok = 0, fail = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      const rec = {};
      header.forEach((h, idx) => { rec[h] = (vals[idx] || "").trim(); });
      if (!rec.name || !rec.mobile) { fail++; continue; }
      if (!rec.password) rec.password = rec.mobile;   // default password = mobile
      if (!rec.role) rec.role = "Sales Person";
      try { await api.createUser(rec); ok++; } catch { fail++; }
    }
    alert(`Import done: ${ok} added, ${fail} skipped.`);
    load();
  };


  const save = async () => {
    setBusy(true);
    try {
      if (form.id) {
        const { id, password, ...rest } = form;
        await api.updateUser(id, rest);
      } else {
        await api.createUser({ ...form, password: form.password || form.mobile || "eurobond123" });
      }
      setForm(null); load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const resetPass = async (u) => {
    const np = prompt(`New password for ${u.name}:`);
    if (!np) return;
    try { await api.resetUserPass(u.id, np); alert("Password updated"); } catch (e) { alert(e.message); }
  };

  const del = async (u) => {
    if (!confirm(`Deactivate ${u.name}?`)) return;
    try { await api.deleteUser(u.id); load(); } catch (e) { alert(e.message); }
  };

  const zoneOpts = [...new Set(users.map((u) => u.zone).filter(Boolean))];
  const cityOpts = form && form.state && stateCities.length
    ? stateCities
    : [...new Set(users.map((u) => u.city).filter(Boolean))];
  const stateOpts = [...new Set([...statesList, ...users.map((u) => u.state).filter(Boolean)])];
  /* Reporting managers: for a Sub HOD → only HODs; for a normal user → HODs + Sub HODs + Admin */
  const isSubHodForm = form && (form.isSubHod || /^Sub HOD/.test(form.role || ""));
  const managerOpts = [...new Set(
    users.filter((u) => {
      const r = (u.role || "").toLowerCase();
      if (isSubHodForm) return /^hod /.test(r) || r.includes("admin");   // sub hod reports to a HOD
      return r.includes("hod") || r.includes("admin");                    // normal user → HOD/Sub HOD/Admin
    }).map((u) => u.name).filter(Boolean)
  )];

  const filtered = users.filter((u) =>
    !q || (u.name + u.mobile + (u.code || "") + (u.city || "")).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <PageHead
        crumb="Masters / App Users"
        title="App Users & Team"
        actions={<div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={exportUsers}><Download size={14} /> Export</button>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}><Upload size={14} /> Import
            <input type="file" accept=".csv" hidden onChange={(e) => importUsers(e.target.files[0])} />
          </label>
          <button className="btn btn-ghost" onClick={() => setForm({ ...empty, role: "HOD (Sales)", isHod: true })}><UserPlus size={14} /> Add HOD</button>
          <button className="btn btn-ghost" onClick={() => setForm({ ...empty, role: "Sub HOD (Sales)", isSubHod: true })}><UserPlus size={14} /> Add Sub HOD</button>
          <button className="btn btn-primary" onClick={() => setForm({ ...empty })}><UserPlus size={14} /> Add User</button>
        </div>}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", maxWidth: 320, marginBottom: 14 }}>
        <Search size={15} color="var(--muted)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile, city" style={{ border: "none", outline: "none", width: "100%", fontSize: 13 }} />
      </div>

      {loading ? <div style={{ padding: 30, color: "var(--muted)" }}>Loading…</div>
        : err ? <div style={{ padding: 20, background: "#fdecec", color: "#c03636", borderRadius: 10 }}>{err}</div>
        : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th>Name</th><th>Mobile</th><th>Code</th><th>Email</th><th>Role</th><th>Designation</th><th>Grade</th><th>State</th><th>Zone</th><th>City</th><th>Manager</th><th>DOJ</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>{u.name}</td>
                  <td>{u.mobile}</td>
                  <td>{u.code || "—"}</td>
                  <td>{u.email || "—"}</td>
                  <td><span className="pill">{u.role}</span></td>
                  <td>{u.designation || "—"}</td>
                  <td>{u.grade || "—"}</td>
                  <td>{u.state || "—"}</td>
                  <td>{u.zone || "—"}</td>
                  <td>{u.city || "—"}</td>
                  <td>{u.manager || "—"}</td>
                  <td>{u.doj || "—"}</td>
                  <td>
                    {/* Active/Inactive toggle — click to switch */}
                    <button
                      onClick={async () => {
                        try { await api.setUserStatus(u.id, u.status == 1 ? 0 : 1); load(); } catch (e) { alert(e.message); }
                      }}
                      title="Click to toggle"
                      style={{
                        border: "none", cursor: "pointer", fontWeight: 800, fontSize: 11.5, padding: "4px 12px", borderRadius: 9,
                        background: u.status == 1 ? "#e8f7ee" : "#fdecec", color: u.status == 1 ? "#1f7a44" : "#c03636",
                      }}>
                      {u.status == 1 ? "● Active" : "○ Inactive"}
                    </button>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" title="Edit" onClick={() => setForm({ ...empty, ...u, password: "" })}>Edit</button>
                    <button className="btn btn-danger" title="Delete permanently"
                      onClick={async () => {
                        if (!window.confirm(`Permanently DELETE ${u.name}? This removes the user and their attendance data. This cannot be undone.`)) return;
                        try { await api.deleteUserHard(u.id); load(); } catch (e) { alert(e.message); }
                      }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No users</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-mask" onClick={() => setForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{form.id ? "Edit User" : form.isHod ? "Add HOD" : form.isSubHod ? "Add Sub HOD" : "Add User"}</h3>
            <div className="form-grid">
              <Field label="Full Name" req val={form.name} on={(v) => setForm({ ...form, name: v })} />
              <Field label="Mobile (login id)" req val={form.mobile} on={(v) => setForm({ ...form, mobile: v.replace(/\D/g, "") })} />
              <Field label="Employee Code" val={form.code} on={(v) => setForm({ ...form, code: v })} />
              <Field label="Email" val={form.email} on={(v) => setForm({ ...form, email: v })} />
              <div className="field">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {(form.isHod ? ["HOD (Sales)", "HOD (Specs)"] : form.isSubHod ? ["Sub HOD (Sales)", "Sub HOD (Specs)"] : ROLES).map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Grade</label>
                <select value={form.grade || ""} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                  <option value="">— Select —</option>
                  {GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <Field label="Designation" val={form.designation} on={(v) => setForm({ ...form, designation: v })} />
              <Field label="Date of Joining" type="date" val={form.doj || ""} on={(v) => setForm({ ...form, doj: v })} />
              <Field label="Date of Birth" type="date" val={form.dob || ""} on={(v) => setForm({ ...form, dob: v })} />
              <SelectOrAdd label="State" val={form.state} on={(v) => setForm({ ...form, state: v })} options={stateOpts} />
              <SelectOrAdd label="Zone" val={form.zone} on={(v) => setForm({ ...form, zone: v })} options={zoneOpts} />
              <SelectOrAdd label="City" val={form.city} on={(v) => setForm({ ...form, city: v })} options={cityOpts} />
              <Field label="Near-by Range (meters)" type="number" val={form.nearby_range_m ?? 500} on={(v) => setForm({ ...form, nearby_range_m: v })} />
              {!form.isHod && !(/^HOD /.test(form.role || "")) && (
                <SelectOrAdd label={form.isSubHod || /^Sub HOD/.test(form.role || "") ? "Reporting HOD" : "Reporting Manager"} val={form.manager} on={(v) => setForm({ ...form, manager: v })} options={managerOpts} />
              )}
            </div>
            {form.id && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Use the key icon on the list to reset password.</p>}
            <div className="modal-foot">
              <button className="btn btn-danger" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SelectOrAdd({ label, val, on, options }) {
  const [adding, setAdding] = useState(false);
  const isNew = val && !options.includes(val);
  return (
    <div className="field">
      <label>{label}</label>
      {adding || isNew ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={val} onChange={(e) => on(e.target.value)} placeholder={"New " + label} style={{ flex: 1 }} autoFocus />
          <button type="button" className="btn btn-primary" title="Save new value" style={{ padding: "0 12px", fontWeight: 800 }}
            onClick={() => setAdding(false)} disabled={!val}>✓ Save</button>
          <button type="button" className="btn btn-ghost" style={{ padding: "0 10px" }} onClick={() => { on(""); setAdding(false); }}>✕</button>
        </div>
      ) : (
        <select value={val} onChange={(e) => { if (e.target.value === "__add__") { on(""); setAdding(true); } else on(e.target.value); }}>
          <option value="">Select {label}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__add__">➕ Add New…</option>
        </select>
      )}
    </div>
  );
}

function Field({ label, val, on, req, type = "text" }) {
  return (
    <div className="field">
      <label>{label} {req && <b>*</b>}</label>
      <input type={type} value={val ?? ""} onChange={(e) => on(e.target.value)} placeholder={label} />
    </div>
  );
}
