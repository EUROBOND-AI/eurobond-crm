import { useEffect, useState } from "react";
import { UserPlus, KeyRound, Trash2, Search, Download, Upload } from "lucide-react";
import { PageHead } from "../components/ui.jsx";
import { ButtonLoader } from "../components/Loaders.jsx";
import { api } from "../lib/api.js";
import { Avatar, fileUrl } from "../lib/avatar.jsx";
import { visibleUsers } from "../lib/scope.js";

const ROLES = ["Admin", "HOD (Sales)", "HOD (Specs)", "Sub HOD (Sales)", "Sub HOD (Specs)", "Sales Person", "Specs Person", "Sales Collection"];
const GRADES = ["S1", "S2", "S3", "S4", "S5", "M1", "M2", "M3"];
const empty = { name: "", mobile: "", code: "", email: "", role: "Sales Person", grade: "", designation: "", doj: "", dob: "", state: "", zone: "", city: "", manager: "", password: "", photo: "", qr: "", states: "", nearby_range_m: 500 };

const selStyle = { background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "9px 11px", fontSize: 13 };

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
    api.listUsers().then((d) => { setUsers(visibleUsers(d.users || [])); setPicked(new Set()); }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
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
    setImporting(true);
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
      const raw = {};
      header.forEach((h, idx) => { raw[h] = (vals[idx] || "").trim(); });
      /* accept the friendly headers used in the downloaded format */
      const map = {
        "full name": "name", "name": "name",
        "mobile": "mobile", "mobile (login id)": "mobile",
        "employee code": "code", "code": "code",
        "email": "email", "role": "role", "grade": "grade",
        "designation": "designation",
        "date of joining": "doj", "doj": "doj",
        "date of birth": "dob", "dob": "dob",
        "state": "state", "zone": "zone", "depo": "depo", "city": "city",
        "near-by range (meters)": "nearby_range_m", "nearby range": "nearby_range_m",
        "reporting manager": "manager", "manager": "manager",
      };
      /* the sheet has dates as DD-MM-YYYY, but the database wants YYYY-MM-DD —
         without this both Date of Joining and Date of Birth were dropped */
      const toIsoDate = (v) => {
        const t = String(v || "").trim();
        if (!t) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
        const m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        if (!m) return t;
        let [, d, mo, y] = m;
        if (y.length === 2) y = "20" + y;
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      };
      const rec = {};
      Object.keys(raw).forEach((h) => {
        const k = map[h] || h;
        if (raw[h] === "") return;
        rec[k] = (k === "doj" || k === "dob") ? toIsoDate(raw[h]) : raw[h];
      });
      if (!rec.name || !rec.mobile) { fail++; continue; }
      if (!rec.password) rec.password = rec.mobile;   // default password = mobile
      if (!rec.role) rec.role = "Sales Person";
      try { await api.createUser(rec); ok++; } catch { fail++; }
    }
    setImporting(false);
    alert(`Import done: ${ok} added, ${fail} skipped.`);
    load();
  };


  /* a mobile number is the login id, so it must be unique — flag a clash the
     moment it is typed and block the save */
  const dupMobile = !!(form && String(form.mobile || "").trim() &&
    users.some((u) => String(u.mobile || "").trim() === String(form.mobile).trim() && u.id !== form.id));

  const save = async () => {
    if (dupMobile) { alert("This mobile number is already used by another user. Please enter a different number."); return; }
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
  const depoOpts = [...new Set(users.map((u) => u.depo).filter(Boolean))];
  /* City belongs to a State — until a State is picked there is nothing to choose,
     so a city can never be saved (or added) under the wrong state. */
  const cityOpts = !form || !form.state ? [] : [...stateCities].filter(Boolean);
  /* State and City come from the Area Master and nowhere else.

     They used to be the master's list joined with whatever text happened to be
     sitting on existing user rows, and the dropdown carried an "Add New" entry
     that typed a fresh value straight onto the user. Between them, a spelling
     nobody meant — "Telangana ", "TELANGANA", a city under the wrong state —
     became a permanent option that the next person picked in good faith, and
     the State filter then split one state into three. A place is added in Area
     Master now, and every screen reads the same list. */
  const stateOpts = [...statesList].filter(Boolean);
  /* Reporting managers: for a Sub HOD → only HODs; for a normal user → HODs + Sub HODs + Admin */
  const isSubHodForm = form && (form.isSubHod || /^Sub HOD/.test(form.role || ""));
  const managerOpts = [...new Set(
    users.filter((u) => {
      const r = (u.role || "").toLowerCase();
      if (isSubHodForm) return /^hod /.test(r) || r.includes("admin");   // sub hod reports to a HOD
      return r.includes("hod") || r.includes("admin");                    // normal user → HOD/Sub HOD/Admin
    }).map((u) => u.name).filter(Boolean)
  )];

  const [fRole, setFRole] = useState("");
  const [fZone, setFZone] = useState("");   // #7 — cascade Zone
  const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState("");     // #7 — cascade HOD
  const [fStatus, setFStatus] = useState("");
  const [shown, setShown] = useState(false);
  /* #7/#8 — app-version config: minimum allowed build + Play Store link */
  const [appCfg, setAppCfg] = useState({ minVersionCode: 0, latestVersion: "", playUrl: "" });
  const [verOpen, setVerOpen] = useState(false);
  useEffect(() => { api.appInfo().then((c) => setAppCfg(c || {})).catch(() => {}); }, []);
  const minCode = Number(appCfg.minVersionCode) || 0;
  const [importing, setImporting] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const lowU = (x) => String(x || "").trim().toLowerCase();
  const filtered = !shown ? [] : users.filter((u) =>
    (!q || (u.name + u.mobile + (u.code || "") + (u.city || "")).toLowerCase().includes(q.toLowerCase()))
    && (!fRole || u.role === fRole)
    && (!fZone || lowU(u.zone) === lowU(fZone))
    && (!fState || [u.state, ...String(u.states || "").split(",")].map(lowU).includes(lowU(fState)))
    && (!fHod || lowU(u.manager) === lowU(fHod))
    && (!fStatus || (fStatus === "active" ? (u.status == 1) : (u.status != 1)))
  );

  return (
    <>
      <PageHead
        crumb="Masters / App Users"
        title="App Users & Team"
        actions={<div style={{ display: "flex", gap: 8 }}>
          {/* #8 — set the minimum app build; phones below it are forced to update */}
          <button className="btn btn-ghost" onClick={() => setVerOpen(true)}>⬆️ Update Settings</button>
          <button className="btn btn-ghost" onClick={exportUsers}><Download size={14} /> Export</button>
          <button className="btn btn-ghost" onClick={() => {
            /* every field on the Add User form, in the same order */
            const head = ["Full Name", "Mobile", "Employee Code", "Email", "Role", "Grade",
              "Designation", "Date of Joining", "Date of Birth", "State", "Zone", "Depo",
              "City", "Near-by Range (meters)", "Reporting Manager"];
            const sample = ["John Doe", "9876543210", "EMP001", "john@example.com", "Sales Person", "S1",
              "Sales Executive", "2026-01-15", "1995-06-20", "Telangana", "South", "Hyderabad Depo",
              "Hyderabad", "500", "HOD Name"];
            const csv = [head, sample].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
            const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "app-users-format.csv"; a.click();
          }}><Download size={14} /> Download Format</button>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}><Upload size={14} /> {importing ? "Importing…" : "Import"}
            <input type="file" accept=".csv" hidden onChange={(e) => importUsers(e.target.files[0])} />
          </label>
          <button className="btn btn-ghost" onClick={() => setForm({ ...empty, role: "HOD (Sales)", isHod: true })}><UserPlus size={14} /> Add HOD</button>
          <button className="btn btn-ghost" onClick={() => setForm({ ...empty, role: "Sub HOD (Sales)", isSubHod: true })}><UserPlus size={14} /> Add Sub HOD</button>
          <button className="btn btn-primary" onClick={() => setForm({ ...empty })}><UserPlus size={14} /> Add User</button>
        </div>}
      />

      {/* search + filters on one row, no empty panel below */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", width: 260 }}>
          <Search size={15} color="var(--muted)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, mobile, city" style={{ border: "none", outline: "none", width: "100%", fontSize: 13 }} />
        </div>
        <select value={fRole} onChange={(e) => setFRole(e.target.value)} style={selStyle}>
          <option value="">All Roles</option>
          {[...new Set(users.map((u) => u.role).filter(Boolean))].sort().map((r) => <option key={r}>{r}</option>)}
        </select>
        {/* #7 — Zone → State → HOD cascade (these rows are the users themselves) */}
        {(() => {
          const inZone = fZone ? users.filter((u) => lowU(u.zone) === lowU(fZone)) : users;
          const inState = fState ? inZone.filter((u) => [u.state, ...String(u.states || "").split(",")].map(lowU).includes(lowU(fState))) : inZone;
          const uniq = (a) => [...new Set(a.map((x) => String(x || "").trim()).filter(Boolean))].sort();
          const zones = uniq(users.map((u) => u.zone));
          const states = uniq(inZone.flatMap((u) => [u.state, ...String(u.states || "").split(",")]));
          const hods = uniq(inState.filter((u) => /hod/i.test(u.role || "")).map((u) => u.name));
          return (
            <>
              {zones.length > 0 && <select value={fZone} onChange={(e) => { setFZone(e.target.value); setFState(""); setFHod(""); }} style={selStyle}><option value="">All Zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>}
              <select value={fState} onChange={(e) => { setFState(e.target.value); setFHod(""); }} style={selStyle}><option value="">All States</option>{states.map((r) => <option key={r}>{r}</option>)}</select>
              {hods.length > 0 && <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={selStyle}><option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>}
            </>
          );
        })()}
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selStyle}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="btn btn-primary" style={{ padding: "8px 20px", fontWeight: 700 }} onClick={() => setShown(true)}>Show</button>
        {shown && <button className="btn btn-ghost" onClick={() => { setShown(false); setQ(""); setFRole(""); setFZone(""); setFState(""); setFHod(""); setFStatus(""); setPicked(new Set()); }}>Clear</button>}
        {picked.size > 0 && (
          <button className="btn btn-danger" onClick={async () => {
            if (!window.confirm(`Permanently delete ${picked.size} user(s) and their attendance history? This cannot be undone.`)) return;
            let ok = 0, fail = 0;
            for (const id of picked) {
              /* hard delete — the soft one only set status = 0, so the rows came
                 back as Inactive on the next refresh */
              try { await api.deleteUserHard(id); ok++; } catch { fail++; }
            }
            setPicked(new Set());
            load();
            alert(`Deleted ${ok} user(s)${fail ? `, ${fail} failed` : ""}.`);
          }}>🗑 Delete Selected ({picked.size})</button>
        )}
      </div>

      {loading ? <div style={{ padding: 16 }}><SkeletonList rows={6} /></div>
        : err ? <div style={{ padding: 20, background: "#fdecec", color: "#c03636", borderRadius: 10 }}>{err}</div>
        : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={filtered.length > 0 && filtered.every((u) => picked.has(u.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(filtered.map((u) => u.id)) : new Set())} />
                </th>
                <th>S.No</th><th>Photo</th><th>Name</th><th>Mobile</th><th>Code</th><th>Email</th><th>Role</th><th>Designation</th><th>Grade</th><th>State</th><th>Zone</th><th>Depo</th><th>City</th><th>Manager</th><th>DOJ</th><th>App Version</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {!shown ? (
                <tr><td colSpan={18} style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
                  Set your filters and click <b>Show</b> to load the list.
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={18} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No users match these filters.</td></tr>
              ) : filtered.map((u, idx) => (
                <tr key={u.id} style={{ background: picked.has(u.id) ? "#f2f6ff" : "transparent" }}>
                  <td>
                    <input type="checkbox" checked={picked.has(u.id)}
                      onChange={(e) => setPicked((p) => { const n = new Set(p); e.target.checked ? n.add(u.id) : n.delete(u.id); return n; })} />
                  </td>
                  <td style={{ color: "var(--muted)", fontWeight: 700 }}>{idx + 1}</td>
                  <td><Avatar name={u.name} photo={u.photo} size={34} /></td>
                  <td style={{ fontWeight: 700 }}>{u.name}</td>
                  <td>{u.mobile}</td>
                  <td>{u.code || "—"}</td>
                  <td>{u.email || "—"}</td>
                  <td><span className="pill">{u.role}</span></td>
                  <td>{u.designation || "—"}</td>
                  <td>{u.grade || "—"}</td>
                  <td>{u.state || "—"}</td>
                  <td>{u.zone || "—"}</td>
                  <td>{u.depo || "—"}</td>
                  <td>{u.city || "—"}</td>
                  <td>{u.manager || "—"}</td>
                  <td>{u.doj ? String(u.doj).slice(0, 10) : "—"}</td>
                  {/* #7 — which app build this person is on (red if behind the min) */}
                  <td style={{ whiteSpace: "nowrap" }}>
                    {u.app_version
                      ? <span style={{ fontWeight: 700, color: (minCode && Number(u.app_version_code) && Number(u.app_version_code) < minCode) ? "#c0392b" : "#1f7a44" }}>
                          v{u.app_version}{u.app_version_code ? ` (${u.app_version_code})` : ""}
                        </span>
                      : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td>
                    {/* Active/Inactive toggle — click to switch */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const next = u.status == 1 ? 0 : 1;
                        /* show the change straight away, then confirm with the server */
                        setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
                        try { await api.setUserStatus(u.id, next); load(); }
                        catch (err) { alert(err.message); load(); }
                      }}
                      title="Click to toggle"
                      style={{
                        border: "none", cursor: "pointer", fontWeight: 800, fontSize: 11.5, padding: "4px 12px", borderRadius: 9,
                        background: u.status == 1 ? "#e8f7ee" : "#fdecec", color: u.status == 1 ? "#1f7a44" : "#c03636",
                      }}>
                      {u.status == 1 ? "● Active" : "○ Inactive"}
                    </button>
                    {/* #6 — Resign: stays able to sign in (status 1) but the app
                        hides every module except Attendance. Click to toggle. */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const next = Number(u.resigned) === 1 ? 0 : 1;
                        /* change on screen at once and keep it — no full reload,
                           so marking resign is instant and never "takes too long" */
                        setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, resigned: next } : x)));
                        try { await api.updateUser(u.id, { resigned: next }); }
                        catch (err) {
                          alert(err.message);
                          setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, resigned: Number(u.resigned) === 1 ? 1 : 0 } : x)));
                        }
                      }}
                      title="Mark this employee as resigned / rejoined"
                      style={{
                        marginLeft: 6, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 11.5, padding: "4px 12px", borderRadius: 9,
                        background: Number(u.resigned) === 1 ? "#fff1e6" : "#eef1f8", color: Number(u.resigned) === 1 ? "#c2651a" : "#6b7280",
                      }}>
                      {Number(u.resigned) === 1 ? "⚑ Resigned" : "Mark Resign"}
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
              <PhotoField form={form} setForm={setForm} />
              <QrField form={form} setForm={setForm} />
              <Field label="Full Name" req val={form.name} on={(v) => setForm({ ...form, name: v })} />
              <div className="field">
                <label>Mobile (login id) <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
                  style={dupMobile ? { borderColor: "#ef4444", background: "#fff5f5", color: "#b91c1c" } : undefined} />
                {dupMobile && <div style={{ color: "#ef4444", fontSize: 11.5, fontWeight: 800, marginTop: 3 }}>⚠ This number already exists — used by another user</div>}
              </div>
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
              <PickOne label="State" val={form.state} on={(v) => setForm({ ...form, state: v, city: "" })} options={stateOpts}
                empty="No states in Area Master yet" />
              <ExtraStates form={form} setForm={setForm} options={stateOpts} />
              <PickOne label="Zone" val={form.zone} on={(v) => setForm({ ...form, zone: v })} options={zoneOpts} />
              <PickOne label="Depo" val={form.depo} on={(v) => setForm({ ...form, depo: v })} options={depoOpts} />
              {form.state
                ? <PickOne label="City" val={form.city} on={(v) => setForm({ ...form, city: v })} options={cityOpts}
                    empty={`No areas under ${form.state} in Area Master`} />
                : <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>City</label>
                    <div style={{ padding: "9px 12px", borderRadius: 9, border: "1px dashed #dde2ef", fontSize: 12.5, color: "var(--muted)", background: "#f7f9ff" }}>Select a State first</div>
                  </div>}
              <Field label="Near-by Range (meters)" type="number" val={form.nearby_range_m ?? 500} on={(v) => setForm({ ...form, nearby_range_m: v })} />
              {!form.isHod && !(/^HOD /.test(form.role || "")) && (
                <PickOne label={form.isSubHod || /^Sub HOD/.test(form.role || "") ? "Reporting HOD" : "Reporting Manager"} val={form.manager} on={(v) => setForm({ ...form, manager: v })} options={managerOpts} />
              )}
            </div>
            {form.id && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Use the key icon on the list to reset password.</p>}
            <div className="modal-foot">
              <button className="btn btn-danger" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || dupMobile} onClick={save}>{busy ? <ButtonLoader label="Saving…" /> : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* #8 — Force-update settings */}
      {verOpen && (
        <div className="modal-mask" onClick={() => setVerOpen(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>App Update Settings</h3>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>
              Phones on a build <b>below</b> the minimum are forced to update before they can use the app.
              Set this to the new build's <b>versionCode</b> when you publish an update to the Play Store.
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 700 }}>Minimum allowed versionCode</label>
            <input type="number" value={appCfg.minVersionCode || ""} onChange={(e) => setAppCfg({ ...appCfg, minVersionCode: e.target.value })}
              placeholder="e.g. 10811" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
            <label style={{ fontSize: 12.5, fontWeight: 700 }}>Latest version name (shown to users)</label>
            <input value={appCfg.latestVersion || ""} onChange={(e) => setAppCfg({ ...appCfg, latestVersion: e.target.value })}
              placeholder="e.g. 1.9.0" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
            <label style={{ fontSize: 12.5, fontWeight: 700 }}>Play Store URL</label>
            <input value={appCfg.playUrl || ""} onChange={(e) => setAppCfg({ ...appCfg, playUrl: e.target.value })}
              placeholder="https://play.google.com/store/apps/details?id=com.eurobond.crm" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 16px" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={async () => {
                try { await api.setAppConfig({ minVersionCode: Number(appCfg.minVersionCode) || 0, latestVersion: appCfg.latestVersion || "", playUrl: appCfg.playUrl || "" }); setVerOpen(false); alert("Saved. Phones below this build will be asked to update."); }
                catch (e) { alert(e.message); }
              }}>Save</button>
              <button className="btn btn-soft" onClick={() => setVerOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* The other states this person covers.

   One HOD often looks after two or three states, and the single State field
   could only hold one of them — so their beat plan, their areas and the
   people they could pick from all came from that one state and the rest of
   their patch did not exist as far as the app was concerned. Their main state
   stays as it is; these are added to it, and every area under them becomes
   available in the same places.

   Kept as a plain comma-separated line, because that is what the column
   holds and what every screen that reads it already splits on. */
function ExtraStates({ form, setForm, options }) {
  const chosen = String(form.states || "").split(",").map((x) => x.trim()).filter(Boolean);
  const set = (list) => setForm((f) => ({ ...f, states: list.join(", ") }));
  /* the main state is already covered, so it is not offered again here */
  const left = (options || []).filter((o) => o && o !== form.state && !chosen.includes(o));
  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>Extra States (for a HOD covering more than one)</label>
      <select value="" onChange={(e) => { const v = e.target.value; if (v) set([...chosen, v]); }}>
        <option value="">{left.length ? "Add a state…" : "No other states in Area Master"}</option>
        {left.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {chosen.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
          {chosen.map((n) => (
            <span key={n} style={{ background: "#eef2ff", color: "#3949ab", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
              {n}
              <span onClick={() => set(chosen.filter((x) => x !== n))} style={{ cursor: "pointer", marginLeft: 6 }}>×</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
        Areas under these states become available to them as well as their main state.
      </div>
    </div>
  );
}

/* A pick from a list, and only from the list.

   A value already on the row is kept as an option even when it is no longer in
   the list, so opening an old user to change their phone number does not
   silently blank out their city. It is marked, so it is clear that it is not a
   master value. */
function PickOne({ label, val, on, options, empty = "" }) {
  const list = (options || []).filter(Boolean);
  const current = String(val || "").trim();
  const stale = current && !list.some((o) => String(o).trim() === current);
  return (
    <div className="field">
      <label>{label}</label>
      <select value={val || ""} onChange={(e) => on(e.target.value)}>
        <option value="">Select {label}</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
        {stale && <option value={current}>{current} (not in master)</option>}
      </select>
      {!list.length && empty ? (
        <div style={{ fontSize: 11.5, color: "#b0640a", marginTop: 4, fontWeight: 600 }}>{empty}</div>
      ) : null}
    </div>
  );
}

/* The person's photo. It is uploaded the moment it is chosen, and only the
   path is kept on the row, so the picture is never carried inside the user
   list — four hundred of them would make every screen that reads users slow. */
function PhotoField({ form, setForm }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const u = await api.uploadCompressed(file, "avatar");
      const url = u.url || u.path || "";
      if (!url) throw new Error("Upload did not return a file");
      setForm((f) => ({ ...f, photo: url }));
    } catch (e) { alert("Photo upload failed: " + (e && e.message ? e.message : e)); }
    setBusy(false);
  };
  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>Photo</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar name={form.name} photo={form.photo} size={64} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            {busy ? "Uploading…" : form.photo ? "Change Photo" : "Upload Photo"}
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files && e.target.files[0])} />
          </label>
          {form.photo && <button type="button" className="btn btn-danger" onClick={() => setForm((f) => ({ ...f, photo: "" }))}>Remove</button>}
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Shown on the phone profile and on notifications they send.</span>
        </div>
      </div>
    </div>
  );
}

/* #6 — visiting-card QR, shown on the back of the profile photo in the app */
function QrField({ form, setForm }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const u = await api.uploadCompressed(file, "qr");
      const url = u.url || u.path || "";
      if (!url) throw new Error("Upload did not return a file");
      setForm((f) => ({ ...f, qr: url }));
    } catch (e) { alert("QR upload failed: " + (e && e.message ? e.message : e)); }
    setBusy(false);
  };
  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>Visiting Card QR</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 10, border: "1px dashed #c7d0e8", display: "grid", placeItems: "center", background: "#f6f8fd", overflow: "hidden" }}>
          {form.qr ? <img src={fileUrl(form.qr)} alt="QR" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 22 }}>▦</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            {busy ? "Uploading…" : form.qr ? "Change QR" : "Upload QR"}
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files && e.target.files[0])} />
          </label>
          {form.qr && <button type="button" className="btn btn-danger" onClick={() => setForm((f) => ({ ...f, qr: "" }))}>Remove</button>}
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Appears on the back when their profile photo is tapped.</span>
        </div>
      </div>
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
