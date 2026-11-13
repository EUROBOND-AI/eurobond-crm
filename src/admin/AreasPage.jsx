import { useEffect, useState } from "react";
import { MapPin, Upload, Plus, Trash2, X } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useBulk, BulkBar } from "../components/Bulk.jsx";

/* Areas (admin) — state-wise areas manage. App lo Local/Tour dropdown ivi vaadutundi.
   Excel/CSV upload (State, Area columns) OR manual add. */
export default function AreasPage() {
  const [states, setStates] = useState([]);
  const [sel, setSel] = useState("");
  const [areas, setAreas] = useState([]);
  const [count, setCount] = useState({ areas: 0, states: 0 });
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /* #1 — area → sales-person mapping used to auto-assign incoming enquiries.
     Kept in its own 'areaAssign' records module (state, area, person); a blank
     area means the whole state's default person. */
  const [users, setUsers] = useState([]);
  const [assigns, setAssigns] = useState([]);
  const loadAssigns = () => api.list("areaAssign", false).then((d) => setAssigns((d.records || []).map((r) => ({ _id: r.id, ...r.data })))).catch(() => {});

  const loadStates = () => {
    api.areaStates().then((d) => setStates(d.states || [])).catch(() => {});
    api.areaCount().then((d) => setCount(d)).catch(() => {});
  };
  useEffect(loadStates, []);
  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); loadAssigns(); }, []);

  /* the sales people who cover the selected state (their own state or an extra one) */
  const low = (x) => String(x || "").trim().toLowerCase();
  const statePeople = (!sel ? [] : users.filter((u) => {
    const theirs = [u.state, ...String(u.states || "").split(",")].map(low).filter(Boolean);
    const isSales = /sales/i.test(`${u.role || ""} ${u.designation || ""}`) || !/hod|admin|spec/i.test(`${u.role || ""}`);
    return theirs.includes(low(sel)) && isSales;
  }).map((u) => u.name));

  /* #1 — a selection is staged locally (keyed by area name; "" = state default);
     nothing is written until "Save Assignments" is pressed. */
  const [pending, setPending] = useState({});
  const [savingAssign, setSavingAssign] = useState(false);
  useEffect(() => { setPending({}); }, [sel]);   // switching state clears unsaved picks
  const savedFor = (area) => {
    const a = assigns.find((x) => low(x.state) === low(sel) && low(x.area || "") === low(area || ""));
    return a ? a.person : "";
  };
  const assignFor = (area) => (Object.prototype.hasOwnProperty.call(pending, area || "") ? pending[area || ""] : savedFor(area));
  const stageAssign = (area, person) => setPending((p) => ({ ...p, [area || ""]: person }));
  const dirtyCount = Object.keys(pending).filter((a) => (pending[a] || "") !== savedFor(a)).length;
  const saveAssignments = async () => {
    setSavingAssign(true);
    try {
      for (const area of Object.keys(pending)) {
        const person = pending[area] || "";
        const existing = assigns.find((x) => low(x.state) === low(sel) && low(x.area || "") === low(area || ""));
        if (!person && existing?._id) await api.remove("areaAssign", existing._id);
        else if (existing?._id) await api.update("areaAssign", existing._id, { state: sel, area, person });
        else if (person) await api.create("areaAssign", { state: sel, area, person });
      }
      await loadAssigns();
      setPending({});
      alert("Assignments saved.");
    } catch (e) { alert(e.message); }
    setSavingAssign(false);
  };
  useEffect(() => {
    if (!sel) { setAreas([]); return; }
    api.areasByState(sel)
      .then((d) => setAreas(d.areaRows || (d.areas || []).map((n) => ({ name: n, tier: "A" }))))
      .catch(() => setAreas([]));
  }, [sel]);

  const bulk = useBulk(areas, (a) => a.name || a);
  const delMany = async (names) => {
    for (const n of names) { try { await api.areaDelete(sel, n); } catch {} }
    setAreas((list) => list.filter((x) => !names.includes(x.name || x)));
    api.areaCount().then(setCount).catch(() => {});
  };

  const delArea = async (name) => {
    if (!confirm(`Delete area "${name}" from ${sel}?`)) return;
    try { await api.areaDelete(sel, name); setAreas((a) => a.filter((x) => (x.name || x) !== name)); api.areaCount().then(setCount); }
    catch (e) { alert(e.message); }
  };
  const delState = async () => {
    if (!confirm(`Delete ALL areas in ${sel}? This cannot be undone.`)) return;
    try { await api.areaDeleteState(sel); setAreas([]); setSel(""); loadStates(); }
    catch (e) { alert(e.message); }
  };

  /* CSV upload: expects header row with State, Area (or "Major City / Town") */
  const importCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
      const stateIdx = header.findIndex((h) => h.includes("state"));
      const areaIdx = header.findIndex((h) => h.includes("area") || h.includes("city") || h.includes("town"));
      /* the sheet also carries the A/B/C tier — it used to be ignored, so every
         imported area ended up as A */
      const tierIdx = header.findIndex((h) => h.includes("tier"));
      if (stateIdx < 0 || areaIdx < 0) { alert("CSV needs 'State' and 'Area/City' columns."); setBusy(false); return; }
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]+)/g) || [];
        const st = (cols[stateIdx] || "").trim().replace(/^"|"$/g, "");
        const ar = (cols[areaIdx] || "").trim().replace(/^"|"$/g, "");
        let tr = tierIdx >= 0 ? (cols[tierIdx] || "").trim().replace(/^"|"$/g, "").toUpperCase() : "A";
        if (!["A", "B", "C"].includes(tr)) tr = "A";
        if (st && ar) rows.push([st, ar, tr]);
      }
      if (rows.length === 0) { alert("No valid rows found."); setBusy(false); return; }
      /* batch import (500 at a time) */
      let done = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const r = await api.areaImport(batch);
        done += r.imported || 0;
      }
      alert(`Imported ${done} areas.`);
      loadStates();
      if (sel) api.areasByState(sel).then((d) => setAreas(d.areas || []));
    } catch (e) { alert("Import failed: " + e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHead crumb="Master" title="Areas" actions={
        <>
          <button className="btn btn-ghost" onClick={() => {
            const csv = [
              ["State", "Area / City", "Tier (A/B/C)"],
              ["Andhra Pradesh", "Visakhapatnam", "A"],
              ["Andhra Pradesh", "Amalapuram", "B"],
              ["Telangana", "Hyderabad", "A"],
            ].map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = "areas-format.csv"; a.click();
          }}><Upload size={14} /> Download Format</button>
          <button className="btn btn-ghost" onClick={async () => {
            try {
              const d = await api.areasAll();
              const rows = (d.areaRows || d.areas || []).map((r) => typeof r === "string" ? { state: "", name: r, tier: "" } : r);
              if (!rows.length) { alert("No areas to export."); return; }
              const csv = [["State", "Area / City", "Tier (A/B/C)"]]
                .concat(rows.map((r) => [r.state || "", r.name || r.area || "", r.tier || ""]))
                .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              a.download = "areas-export.csv"; a.click();
            } catch (e) { alert("Export failed: " + e.message); }
          }}><Upload size={14} style={{ transform: "rotate(180deg)" }} /> Export CSV</button>
          <button className="btn btn-soft" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Area</button>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {busy ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />
          </label>
        </>
      } />

      <div className="stat-row">
        <StatCard label="Total Areas" value={count.areas} sub="Across all states" color="#4a7bff" />
        <StatCard label="States" value={count.states} sub="Covered" color="#8b5cf6" />
        <StatCard label="Selected State" value={sel ? areas.length : "—"} sub={sel || "Pick a state"} color="#10b981" />
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-3d)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>State:</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, minWidth: 200 }}>
            <option value="">— Select a state —</option>
            {states.map((s) => <option key={s}>{s}</option>)}
          </select>
          {sel && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{areas.length} areas</span>}
          {sel && areas.length > 0 && <button className="btn btn-danger" style={{ marginLeft: "auto", padding: "7px 12px", fontSize: 12 }} onClick={delState}><Trash2 size={13} /> Delete State</button>}
        </div>

        {/* #1 — state-level default: when an enquiry's area has no person of its
            own, it auto-assigns to this person (whole-state fallback). */}
        {sel && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#eef5ff", border: "1px solid #d6e4ff", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--navy)" }}>State default person (auto-assign):</span>
            <select value={assignFor("")} onChange={(e) => stageAssign("", e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12.5, minWidth: 200, background: "#fff" }}>
              <option value="">— None —</option>
              {statePeople.map((n) => <option key={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>New enquiries in {sel} with no area match go to this person.</span>
            {/* #1 — save the staged picks */}
            <button className="btn btn-primary" style={{ marginLeft: "auto", padding: "7px 18px", opacity: dirtyCount ? 1 : 0.5 }}
              disabled={!dirtyCount || savingAssign} onClick={saveAssignments}>
              {savingAssign ? "Saving…" : dirtyCount ? `💾 Save Assignments (${dirtyCount})` : "💾 Saved"}
            </button>
          </div>
        )}

        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            {count.areas === 0
              ? "No areas yet. Import a CSV with State + Area columns to get started."
              : "Select a state to view its areas."}
          </div>
        ) : (
          <div>
          <BulkBar bulk={bulk} noun="area" onDelete={delMany} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {areas.map((a) => {
              const nm = a.name || a;
              const tr = a.tier || "A";
              return (
                <div key={nm} style={{ background: bulk.has(nm) ? "#eef2ff" : "#f6f8fd", borderRadius: 9, padding: "8px 11px", fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={bulk.has(nm)} onChange={() => bulk.toggle(nm)}
                      style={{ cursor: "pointer", width: 14, height: 14 }} />
                    <MapPin size={13} color="var(--accent)" />
                    <span style={{ flex: 1 }}>{nm}</span>
                    {/* the tier is what the expense screen shows as Area (A)/(B)/(C) */}
                    <select value={tr}
                      onChange={async (e) => {
                        const t = e.target.value;
                        setAreas((list) => list.map((x) => ((x.name || x) === nm ? { name: nm, tier: t } : x)));
                        try { await api.areaAdd(sel, nm, t); } catch (err) { alert(err.message); }
                      }}
                      style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "2px 4px", fontSize: 11.5, fontWeight: 700, background: "#fff" }}>
                      <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                    </select>
                    <button onClick={() => delArea(nm)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2, display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>
                  </div>
                  {/* #1 — assign this area to a sales person; enquiries here auto-assign to them */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>👤</span>
                    <select value={assignFor(nm)} onChange={(e) => stageAssign(nm, e.target.value)}
                      style={{ flex: 1, border: assignFor(nm) !== savedFor(nm) ? "1.5px solid #f59e0b" : "1px solid var(--line)", borderRadius: 7, padding: "4px 6px", fontSize: 11.5, background: "#fff", color: assignFor(nm) ? "var(--navy)" : "var(--muted)" }}>
                      <option value="">— Assign person —</option>
                      {statePeople.map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>

      {addOpen && <AddAreaModal states={states} onClose={() => setAddOpen(false)} onSaved={(st) => { setAddOpen(false); loadStates(); if (st === sel) api.areasByState(sel).then((d) => setAreas(d.areaRows || (d.areas || []).map((n) => ({ name: n, tier: "A" })))); }} />}
    </div>
  );
}

function AddAreaModal({ states, onClose, onSaved }) {
  const [state, setState] = useState("");
  const [name, setName] = useState("");
  const [tier, setTier] = useState("A");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!state.trim() || !name.trim()) return;
    setBusy(true);
    try { await api.areaAdd(state.trim(), name.trim(), tier); onSaved(state.trim()); }
    catch (e) { alert(e.message); setBusy(false); }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Add Area</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>State</label>
        <input list="states-dl" value={state} onChange={(e) => setState(e.target.value)} placeholder="Type or pick state"
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
        <datalist id="states-dl">{states.map((s) => <option key={s} value={s} />)}</datalist>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Area / City name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Andheri"
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
        {/* tier decides the expense category shown as Area (A) / (B) / (C) */}
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Tier</label>
        <select value={tier} onChange={(e) => setTier(e.target.value)}
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 16px" }}>
          <option value="A">A — Tier 1</option>
          <option value="B">B — Tier 2</option>
          <option value="C">C — Tier 3</option>
        </select>
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={!state.trim() || !name.trim() || busy} onClick={save}>
          {busy ? "Saving…" : "Add Area"}
        </button>
      </div>
    </div>
  );
}
