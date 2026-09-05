import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

export default function ApiKeysPage() {
  const [rows, setRows] = useState(null);
  const [edits, setEdits] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [crmKeys, setCrmKeys] = useState([]);
  const [newCrm, setNewCrm] = useState({ label: "", module: "enquiry" });

  const loadCrm = () => api.crmKeysList().then((d) => setCrmKeys(d.keys || [])).catch(() => setCrmKeys([]));
  const issueCrmKey = async () => {
    if (!newCrm.label.trim()) { alert("Enter the partner / source name"); return; }
    try { await api.crmKeyIssue(newCrm.label.trim(), newCrm.module); setNewCrm({ label: "", module: "enquiry" }); loadCrm(); }
    catch (e) { alert(e.message); }
  };
  const revokeCrmKey = async (id) => {
    if (!window.confirm("Revoke this API key? The partner will stop being able to send data.")) return;
    try { await api.crmKeyRevoke(id); loadCrm(); } catch (e) { alert(e.message); }
  };
  const [newKey, setNewKey] = useState({ key: "", label: "", value: "" });

  const load = () => api.settingsList().then((d) => setRows(d.settings || [])).catch(() => setRows([]));
  useEffect(() => { load(); loadCrm(); }, []);

  const saveOne = async (skey, label) => {
    setSavingKey(skey);
    try {
      await api.settingsSave(skey, edits[skey] !== undefined ? edits[skey] : "", label);
      await load(); setEdits((e) => { const n = { ...e }; delete n[skey]; return n; });
    } catch (e) { alert(e.message); }
    setSavingKey("");
  };
  const addNew = async () => {
    if (!newKey.key) { alert("Key id required (e.g. indiamart_new)"); return; }
    try { await api.settingsSave(newKey.key.trim().replace(/\s+/g, "_"), newKey.value, newKey.label); setNewKey({ key: "", label: "", value: "" }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div>
      <PageHead title="API Keys & Settings" crumb="API Keys" />
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
        Edit an API key here and click Save — it updates instantly everywhere. No code change needed.
      </p>

      {rows === null ? <div style={{ padding: 30, color: "var(--muted)" }}>Loading…</div> : (
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
          {rows.map((r) => (
            <div key={r.skey} style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "var(--shadow)" }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 2 }}>{r.slabel || r.skey}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>id: {r.skey} {r.updated_at ? "· updated " + r.updated_at : ""}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={edits[r.skey] !== undefined ? edits[r.skey] : r.svalue}
                  onChange={(e) => setEdits({ ...edits, [r.skey]: e.target.value })}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: "1.5px solid #d7dcef", fontSize: 13, fontFamily: "monospace" }} />
                <button className="btn btn-primary" disabled={savingKey === r.skey} onClick={() => saveOne(r.skey, r.slabel)}>{savingKey === r.skey ? "Saving…" : "Save"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- YOUR CRM's own API keys: give these to partners so they can push data in ---- */}
      <h3 style={{ margin: "26px 0 6px" }}>CRM API Keys (for partners)</h3>
      <p style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 12 }}>
        Issue a key to anyone who needs to send data into this CRM (leads, enquiries).
        They POST to <code>/crm-api/crm_api.php?action=push&amp;key=THEIR_KEY</code>.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, maxWidth: 720 }}>
        <input value={newCrm.label} onChange={(e) => setNewCrm({ ...newCrm, label: e.target.value })} placeholder="Partner / source name" style={{ ...ni, flex: 1, minWidth: 180 }} />
        <select value={newCrm.module} onChange={(e) => setNewCrm({ ...newCrm, module: e.target.value })} style={ni}>
          <option value="enquiry">Enquiry</option>
          <option value="customer">Customers</option>
          <option value="projectProjection">Project Projection</option>
          <option value="expense">Expense</option>
          <option value="quotation">Quotation</option>
          <option value="attendance">Attendance</option>
          <option value="attendanceSheet">Attendance Sheet</option>
        </select>
        <button className="btn btn-primary" onClick={issueCrmKey}>+ Issue Key</button>
      </div>
      <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        {crmKeys.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No API keys issued yet.</div> : crmKeys.map((k) => (
          <div key={k.id} style={{ background: "#fff", borderRadius: 12, padding: 14, boxShadow: "var(--shadow)", opacity: Number(k.active) ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{k.label} <span style={{ color: "var(--muted)", fontWeight: 600 }}>· {k.module}</span></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => { try { navigator.clipboard.writeText(k.api_key); alert("Key copied"); } catch {} }}>Copy</button>
                {!!Number(k.active) && <button className="btn btn-danger" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => revokeCrmKey(k.id)}>Revoke</button>}
              </div>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 6, wordBreak: "break-all", color: "#3949ab" }}>{k.api_key}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              {Number(k.active) ? "Active" : "Revoked"} · {k.calls || 0} calls {k.last_used ? "· last used " + k.last_used : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const ni = { padding: "9px 12px", borderRadius: 9, border: "1.5px solid #d7dcef", fontSize: 13 };
