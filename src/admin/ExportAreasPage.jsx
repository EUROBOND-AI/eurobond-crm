import { useEffect, useState, useMemo } from "react";
import { Globe, Upload, Plus, Trash2, X } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useBulk, BulkBar } from "../components/Bulk.jsx";

/* Export Areas (admin) — Country-wise "State / Town / Area" master for EXPORT enquiries.
   Stored in a generic 'exportArea' records module as { country, area }.
   The Export enquiry form reads these: Country dropdown + State/Town/Area dropdown.
   Add / Import CSV (Country, State/Town/Area columns) / Download Format / Export CSV. */
export default function ExportAreasPage() {
  const [rows, setRows] = useState([]);     // [{_id, country, area}]
  const [sel, setSel] = useState("");       // selected country
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => api.listAll("exportArea", false)
    .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, country: r.data?.country || "", area: r.data?.area || "" }))))
    .catch(() => {});
  useEffect(load, []);

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country).filter(Boolean))].sort(), [rows]);
  const areas = useMemo(() => rows.filter((r) => r.country === sel), [rows, sel]);

  const bulk = useBulk(areas, (a) => a._id);

  const delArea = async (r) => {
    if (!confirm(`Delete "${r.area}" from ${r.country}?`)) return;
    try { await api.remove("exportArea", r._id); setRows((list) => list.filter((x) => x._id !== r._id)); }
    catch (e) { alert(e.message); }
  };
  const delMany = async (ids) => {
    for (const id of ids) { try { await api.remove("exportArea", id); } catch {} }
    setRows((list) => list.filter((x) => !ids.includes(x._id)));
  };
  const delCountry = async () => {
    if (!confirm(`Delete ALL areas in ${sel}? This cannot be undone.`)) return;
    try {
      for (const r of areas) { try { await api.remove("exportArea", r._id); } catch {} }
      setRows((list) => list.filter((x) => x.country !== sel)); setSel("");
    } catch (e) { alert(e.message); }
  };

  /* CSV upload: header row with Country + "State / Town / Area" (or Area/State/Town) */
  const importCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
      const cIdx = header.findIndex((h) => h.includes("country"));
      const aIdx = header.findIndex((h) => h.includes("area") || h.includes("state") || h.includes("town") || h.includes("city"));
      if (cIdx < 0 || aIdx < 0) { alert("CSV needs 'Country' and 'State / Town / Area' columns."); setBusy(false); return; }
      const have = new Set(rows.map((r) => `${r.country}||${r.area}`.toLowerCase()));
      const toAdd = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]+)/g) || [];
        const c = (cols[cIdx] || "").trim().replace(/^"|"$/g, "");
        const a = (cols[aIdx] || "").trim().replace(/^"|"$/g, "");
        if (c && a && !have.has(`${c}||${a}`.toLowerCase())) { have.add(`${c}||${a}`.toLowerCase()); toAdd.push({ country: c, area: a }); }
      }
      if (!toAdd.length) { alert("No new rows found."); setBusy(false); return; }
      let done = 0;
      for (const r of toAdd) { try { await api.create("exportArea", r); done++; } catch {} }
      alert(`Imported ${done} export areas.`);
      await load();
    } catch (e) { alert("Import failed: " + e.message); }
    setBusy(false);
  };

  const downloadFormat = () => {
    const csv = [
      ["Country", "State / Town / Area"],
      ["United Arab Emirates", "Dubai"],
      ["United Arab Emirates", "Abu Dhabi"],
      ["Saudi Arabia", "Riyadh"],
    ].map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "export-areas-format.csv"; a.click();
  };
  const exportCsv = () => {
    if (!rows.length) { alert("No export areas to export."); return; }
    const csv = [["Country", "State / Town / Area"]]
      .concat(rows.map((r) => [r.country, r.area]))
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "export-areas.csv"; a.click();
  };

  return (
    <div>
      <PageHead crumb="Master" title="Export Areas" actions={
        <>
          <button className="btn btn-ghost" onClick={downloadFormat}><Upload size={14} /> Download Format</button>
          <button className="btn btn-ghost" onClick={exportCsv}><Upload size={14} style={{ transform: "rotate(180deg)" }} /> Export CSV</button>
          <button className="btn btn-soft" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Area</button>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {busy ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />
          </label>
        </>
      } />

      <div className="stat-row">
        <StatCard label="Total Areas" value={rows.length} sub="Across all countries" color="#4a7bff" />
        <StatCard label="Countries" value={countries.length} sub="Covered" color="#8b5cf6" />
        <StatCard label="Selected Country" value={sel ? areas.length : "—"} sub={sel || "Pick a country"} color="#10b981" />
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-3d)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Country:</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, minWidth: 200 }}>
            <option value="">— Select a country —</option>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
          {sel && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{areas.length} areas</span>}
          {sel && areas.length > 0 && <button className="btn btn-danger" style={{ marginLeft: "auto", padding: "7px 12px", fontSize: 12 }} onClick={delCountry}><Trash2 size={13} /> Delete Country</button>}
        </div>

        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            {rows.length === 0
              ? "No export areas yet. Import a CSV with Country + State/Town/Area columns to get started."
              : "Select a country to view its areas."}
          </div>
        ) : (
          <div>
            <BulkBar bulk={bulk} noun="area" onDelete={delMany} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {areas.map((a) => (
                <div key={a._id} style={{ background: bulk.has(a._id) ? "#eef2ff" : "#f6f8fd", borderRadius: 9, padding: "8px 11px", fontSize: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={bulk.has(a._id)} onChange={() => bulk.toggle(a._id)} style={{ cursor: "pointer", width: 14, height: 14 }} />
                    <Globe size={13} color="var(--accent)" />
                    <span style={{ flex: 1 }}>{a.area}</span>
                    <button onClick={() => delArea(a)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 2, display: "grid", placeItems: "center" }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {addOpen && <AddExportAreaModal countries={countries} onClose={() => setAddOpen(false)} onSaved={(c) => { setAddOpen(false); load(); if (c) setSel(c); }} />}
    </div>
  );
}

function AddExportAreaModal({ countries, onClose, onSaved }) {
  const [country, setCountry] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!country.trim() || !name.trim()) return;
    setBusy(true);
    try { await api.create("exportArea", { country: country.trim(), area: name.trim() }); onSaved(country.trim()); }
    catch (e) { alert(e.message); setBusy(false); }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Add Export Area</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Country</label>
        <input list="exp-countries-dl" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Type or pick country"
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
        <datalist id="exp-countries-dl">{countries.map((c) => <option key={c} value={c} />)}</datalist>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>State / Town / Area</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai"
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 16px" }} />
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={!country.trim() || !name.trim() || busy} onClick={save}>
          {busy ? "Saving…" : "Add Area"}
        </button>
      </div>
    </div>
  );
}
