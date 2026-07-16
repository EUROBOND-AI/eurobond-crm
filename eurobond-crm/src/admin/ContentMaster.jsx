import { useEffect, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { PageHead, Tabs } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const TABS = [
  { key: "Banner", label: "Banner" },
  { key: "Videos", label: "Videos" },
  { key: "Document", label: "Document" },
  { key: "About Us", label: "About Us" },
  { key: "Contact Us", label: "Contact Us" },
  { key: "Privacy Policy", label: "Privacy Policy" },
  { key: "Term & Condition", label: "Term & Condition" },
  { key: "FAQ'S", label: "FAQ'S" },
];

export default function ContentMaster() {
  const [tab, setTab] = useState("Banner");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);   // {title, text, url}
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.list("content")
      .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const visible = rows.filter((r) => r.section === tab);

  const save = async () => {
    if (!form.title) { alert("Title required"); return; }
    setBusy(true);
    try {
      const data = { section: tab, title: form.title, text: form.text || "", url: form.url || "", createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) };
      const res = await api.create("content", data);
      setRows([{ _id: res.id, ...data }, ...rows]);
      setForm(null);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const del = async (r) => {
    if (!confirm("Delete this item?")) return;
    try { await api.remove("content", r._id); setRows(rows.filter((x) => x._id !== r._id)); } catch (e) { alert(e.message); }
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try { const res = await api.uploadPhoto(file, "content"); setForm({ ...form, url: res.url }); }
    catch (e) { alert("Upload failed: " + e.message); }
    setBusy(false);
  };

  return (
    <>
      <PageHead
        crumb="Masters / Content"
        title="Content Master"
        actions={<button className="btn btn-primary" onClick={() => setForm({ title: "", text: "", url: "" })}><Plus size={14} /> Add {tab}</button>}
      />
      <Tabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setForm(null); }} />

      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : visible.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          No {tab} content yet. Click <b>Add {tab}</b> to create.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {visible.map((r) => (
            <div key={r._id} className="chart-card card-pad" style={{ position: "relative" }}>
              {r.url && (r.url.match(/\.(jpg|jpeg|png|webp)$/i)
                ? <img src={r.url} alt={r.title} style={{ width: "100%", borderRadius: 10, marginBottom: 8 }} />
                : <a href={r.url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12.5, display: "block", marginBottom: 6, wordBreak: "break-all" }}>{r.url}</a>)}
              <b style={{ fontSize: 14 }}>{r.title}</b>
              {r.text && <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{r.text}</p>}
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{r.createdAt}</div>
              <button className="btn btn-danger" style={{ position: "absolute", top: 10, right: 10, padding: "4px 8px" }} onClick={() => del(r)}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="modal-mask" onClick={() => setForm(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>Add {tab}</h3>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tab + " title"} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Text / Description</label>
              <textarea rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 9, padding: 10, fontSize: 13 }} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Link / URL (video, doc)</label>
              <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Or upload image (banner)</label>
              <input type="file" accept="image/*" onChange={(e) => uploadFile(e.target.files[0])} />
            </div>
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
