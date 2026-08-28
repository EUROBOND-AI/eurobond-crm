import { useEffect, useState } from "react";
import { MapPin, Upload, Plus, Trash2, X } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

/* Areas (admin) — state-wise areas manage. App lo Local/Tour dropdown ivi vaadutundi.
   Excel/CSV upload (State, Area columns) OR manual add. */
export default function AreasPage() {
  const [states, setStates] = useState([]);
  const [sel, setSel] = useState("");
  const [areas, setAreas] = useState([]);
  const [count, setCount] = useState({ areas: 0, states: 0 });
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const loadStates = () => {
    api.areaStates().then((d) => setStates(d.states || [])).catch(() => {});
    api.areaCount().then((d) => setCount(d)).catch(() => {});
  };
  useEffect(loadStates, []);
  useEffect(() => {
    if (!sel) { setAreas([]); return; }
    api.areasByState(sel).then((d) => setAreas(d.areas || [])).catch(() => setAreas([]));
  }, [sel]);

  const delArea = async (name) => {
    if (!confirm(`Delete area "${name}" from ${sel}?`)) return;
    try { await api.areaDelete(sel, name); setAreas((a) => a.filter((x) => x !== name)); api.areaCount().then(setCount); }
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
      if (stateIdx < 0 || areaIdx < 0) { alert("CSV needs 'State' and 'Area/City' columns."); setBusy(false); return; }
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]+)/g) || [];
        const st = (cols[stateIdx] || "").trim().replace(/^"|"$/g, "");
        const ar = (cols[areaIdx] || "").trim().replace(/^"|"$/g, "");
        if (st && ar) rows.push([st, ar]);
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

        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            {count.areas === 0
              ? "No areas yet. Import a CSV with State + Area columns to get started."
              : "Select a state to view its areas."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
            {areas.map((a) => (
              <div key={a} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f6f8fd", borderRadius: 9, padding: "8px 11px", fontSize: 13 }}>
                <MapPin size={13} color="var(--accent)" />
                <span style={{ flex: 1 }}>{a}</span>
                <button onClick={() => delArea(a)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2, display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {addOpen && <AddAreaModal states={states} onClose={() => setAddOpen(false)} onSaved={(st) => { setAddOpen(false); loadStates(); if (st === sel) api.areasByState(sel).then((d) => setAreas(d.areas || [])); }} />}
    </div>
  );
}

function AddAreaModal({ states, onClose, onSaved }) {
  const [state, setState] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!state.trim() || !name.trim()) return;
    setBusy(true);
    try { await api.areaAdd(state.trim(), name.trim()); onSaved(state.trim()); }
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
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 16px" }} />
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={!state.trim() || !name.trim() || busy} onClick={save}>
          {busy ? "Saving…" : "Add Area"}
        </button>
      </div>
    </div>
  );
}
