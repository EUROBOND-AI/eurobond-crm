import { useEffect, useState } from "react";
import { CalendarDays, Upload, X, Trash2, Bell } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";

/* Holidays (admin) — designed like Products/Areas.
   State select -> its holiday rows (Date / Day / Holiday / City).
   CSV import: State, Date, Days, Holiday, City columns.
   Region-wise reminders: 2 days before, 1 day before, same day (holidays.php remind). */
export default function HolidaysPage() {
  const [states, setStates] = useState([]);
  const [sel, setSel] = useState("");
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const loadStates = () => {
    api.holidaysStates().then((d) => setStates(d.states || [])).catch(() => {});
    api.holidaysAll().then((d) => setAllRows(d.holidays || [])).catch(() => {});
  };
  useEffect(loadStates, []);

  const loadState = (st) => {
    setSel(st);
    if (!st) { setRows([]); return; }
    api.holidaysAll(st).then((d) => setRows(d.holidays || [])).catch(() => setRows([]));
  };

  const importCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const iState = head.findIndex((h) => h.includes("state"));
      const iDate = head.findIndex((h) => h.includes("date"));
      const iDay = head.findIndex((h) => h.includes("day"));
      const iHol = head.findIndex((h) => h.includes("holiday"));
      const iCity = head.findIndex((h) => h.includes("city"));
      const parsed = lines.slice(1).map((l) => {
        const c = l.split(",");
        let date = (c[iDate] || "").trim();
        /* normalize dd-mm-yyyy or dd/mm/yyyy -> yyyy-mm-dd */
        const m = date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
        if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; date = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
        return { state: (c[iState] || "").trim(), date, day: (c[iDay] || "").trim(), holiday: (c[iHol] || "").trim(), city: (c[iCity] || "").trim() };
      }).filter((r) => r.state && r.date);
      if (!parsed.length) { alert("No valid rows found in CSV."); setBusy(false); return; }
      const r = await api.holidaysImport(parsed, "replace");
      alert(`Imported ${r.total} holidays.`);
      loadStates(); if (sel) loadState(sel);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const downloadFormat = () => {
    const csv = "State,Date,Days,Holiday,City\nMaharashtra,2026-01-26,Monday,Republic Day,Mumbai\nGujarat,2026-01-26,Monday,Republic Day,Ahmedabad";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "holiday-format.csv"; a.click();
  };

  const runReminders = async () => {
    setBusy(true);
    try { const r = await api.holidayRemind(); alert(`Reminders sent: ${r.created} notification(s) created for users whose region has a holiday in 2 / 1 / 0 days.`); }
    catch (e) { alert(e.message); }
    setBusy(false);
  };

  const delRow = async (h) => {
    const idx = allRows.findIndex((x) => x.state === h.state && x.date === h.date && x.holiday === h.holiday);
    if (idx < 0) return;
    if (!window.confirm(`Delete "${h.holiday}" (${h.date})?`)) return;
    try { await api.holidayRowDelete(idx); loadStates(); loadState(sel); } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <PageHead crumb="Master" title="Holiday List" actions={
        <>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><CalendarDays size={14} /> Add Holiday</button>
          <button className="btn btn-soft" onClick={runReminders} disabled={busy}><Bell size={14} /> Send Reminders</button>
          <button className="btn btn-ghost" onClick={downloadFormat}><Upload size={14} /> Download Format</button>
          <label className="btn btn-soft" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {busy ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />
          </label>
        </>
      } />

      <div className="stat-row">
        <StatCard label="Total Holidays" value={allRows.length} sub="All states" />
        <StatCard label="States" value={states.length} sub="Regions covered" />
        <StatCard label="Selected" value={rows.length} sub={sel || "Pick a state"} color="#2563eb" />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "14px 0", background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Select State / Region</label>
          <select value={sel} onChange={(e) => loadState(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 13, minWidth: 220 }}>
            <option value="">— Select state —</option>
            {states.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", paddingBottom: 8 }}>
          🔔 Reminders auto-notify each user 2 days before, 1 day before, and on the holiday for their region.
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {!sel ? (
          <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>Select a state to view its holidays.</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 50, textAlign: "center", color: "var(--muted)" }}>No holidays for {sel}.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                  {["Date", "Day", "Holiday", "City", ""].map((h) => (
                    <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((h, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{h.date}</td>
                    <td style={{ padding: "10px 14px" }}>{h.day || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{h.holiday || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{h.city || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <button className="btn btn-danger" style={{ padding: "4px 8px" }} onClick={() => delRow(h)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && <AddHolidayModal onClose={() => setAddOpen(false)} states={states} defaultState={sel}
        onSaved={() => { setAddOpen(false); loadStates(); if (sel) loadState(sel); }} />}
    </div>
  );
}

function AddHolidayModal({ onClose, onSaved, states, defaultState }) {
  const [f, setF] = useState({ state: defaultState || "", date: "", day: "", holiday: "", city: "" });
  const [busy, setBusy] = useState(false);
  const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const dayFromDate = (d) => { try { return new Date(d).toLocaleDateString("en-US", { weekday: "long" }); } catch { return ""; } };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,45,.55)", zIndex: 200, display: "grid", placeItems: "center", padding: 18 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Add Holiday</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <label style={{ fontSize: 12, fontWeight: 700 }}>State / Region *</label>
        <input list="hol-states" value={f.state} onChange={(e) => set("state", e.target.value)} placeholder="Select or type new" style={inp} />
        <datalist id="hol-states">{states.map((s) => <option key={s} value={s} />)}</datalist>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Date *</label>
        <input type="date" value={f.date} onChange={(e) => { set("date", e.target.value); set("day", dayFromDate(e.target.value)); }} style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Day</label>
        <input value={f.day} onChange={(e) => set("day", e.target.value)} placeholder="e.g. Monday" style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Holiday Name *</label>
        <input value={f.holiday} onChange={(e) => set("holiday", e.target.value)} placeholder="e.g. Diwali" style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>City</label>
        <input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Mumbai (optional)" style={inp} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 6 }} disabled={busy || !f.state || !f.date || !f.holiday}
          onClick={async () => { setBusy(true); try { await api.holidayAdd(f); onSaved(); } catch (e) { alert(e.message); setBusy(false); } }}>
          {busy ? "Saving…" : "Save Holiday"}
        </button>
      </div>
    </div>
  );
}
