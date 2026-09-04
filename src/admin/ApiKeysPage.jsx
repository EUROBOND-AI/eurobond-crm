import { useEffect, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

export default function ApiKeysPage() {
  const [rows, setRows] = useState(null);
  const [edits, setEdits] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [newKey, setNewKey] = useState({ key: "", label: "", value: "" });

  const load = () => api.settingsList().then((d) => setRows(d.settings || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

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

          <div style={{ background: "#f4f6fc", borderRadius: 12, padding: 16, border: "1px dashed #c5cce0" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>+ Add New Key</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} placeholder="Label (e.g. IndiaMART Key — New)" style={ni} />
              <input value={newKey.key} onChange={(e) => setNewKey({ ...newKey, key: e.target.value })} placeholder="Key id (e.g. indiamart_new)" style={ni} />
              <input value={newKey.value} onChange={(e) => setNewKey({ ...newKey, value: e.target.value })} placeholder="Value (the API key)" style={{ ...ni, fontFamily: "monospace" }} />
              <button className="btn btn-primary" onClick={addNew} style={{ justifySelf: "start" }}>Add Key</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const ni = { padding: "9px 12px", borderRadius: 9, border: "1.5px solid #d7dcef", fontSize: 13 };
