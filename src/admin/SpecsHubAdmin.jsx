import { useEffect, useRef, useState } from "react";
import { api, auth } from "../lib/api.js";
import { SkeletonList } from "../components/Loaders.jsx";

/* Admin side of Specs-Hub:
   1) manage the two dropdown masters (Category, Standard/Premium tier)
   2) see every specification and join the specs↔sales chat. */

const now = () => new Date().toLocaleString("en-IN");
const rid = (r) => r.id || r._id;
const low = (s) => String(s || "").trim().toLowerCase();
const DEF_CATS = ["Project", "Govt", "Corporate"];
const DEF_TIERS = ["Standard", "Premium", "Premium Plus"];

function ListEditor({ title, items, setItems }) {
  const [v, setV] = useState("");
  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16, flex: 1, minWidth: 260 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f3fa" }}>
          <input value={it} onChange={(e) => setItems(items.map((x, j) => j === i ? e.target.value : x))} style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)" }} />
          <button className="btn btn-ghost" style={{ color: "#c03636", padding: "4px 10px" }} onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add option…" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)" }} />
        <button className="btn btn-primary" onClick={() => { if (v.trim()) { setItems([...items, v.trim()]); setV(""); } }}>Add</button>
      </div>
    </div>
  );
}

function AdminChat({ rec, onClose, onChange }) {
  const [msgs, setMsgs] = useState(rec.messages || []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs]);
  const send = async () => {
    const t = text.trim(); if (!t) return;
    const me = auth.user?.name || "Admin";
    const nm = [...msgs, { by: me, role: "Admin", text: t, at: now() }];
    setMsgs(nm); setText(""); setBusy(true);
    try {
      await api.update("specsHub", rid(rec), { ...rec, messages: nm });
      onChange && onChange({ ...rec, messages: nm });
      for (const to of [rec.specPerson, rec.salesPerson].filter(Boolean)) { try { await api.notify({ to, title: "Specs-Hub message (Admin)", message: `${me}: ${t}`, link: "/app/specs-hub", createdAt: now() }); } catch {} }
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.4)", zIndex: 1000, display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#f6f8fd", width: 560, maxWidth: "100%", height: "80vh", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", background: "#1b3a8f", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><b>{rec.projectName}</b><div style={{ fontSize: 12, opacity: .85 }}>Spec: {rec.specPerson} · Sales: {rec.salesPerson}</div></div>
          <button className="btn btn-ghost" style={{ color: "#fff" }} onClick={onClose}>✕</button>
        </div>
        <div ref={boxRef} style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {msgs.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 40 }}>No messages yet.</div>}
          {msgs.map((m, i) => { const mine = low(m.by) === low(auth.user?.name); return (
            <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ maxWidth: "76%", background: mine ? "#1b3a8f" : "#fff", color: mine ? "#fff" : "#1a2236", padding: "9px 13px", borderRadius: 14, boxShadow: "0 2px 8px rgba(20,25,60,.08)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, opacity: .75 }}>{m.by} · {m.role}</div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.text}</div>
                <div style={{ fontSize: 10, opacity: .6, textAlign: "right" }}>{m.at}</div>
              </div>
            </div>
          ); })}
        </div>
        <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e6e9f2", background: "#fff" }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message as Admin…" style={{ flex: 1, padding: "11px 14px", borderRadius: 22, border: "1px solid var(--line)" }} />
          <button className="btn btn-primary" disabled={busy} onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default function SpecsHubAdmin() {
  const [cats, setCats] = useState(DEF_CATS);
  const [tiers, setTiers] = useState(DEF_TIERS);
  const [masterId, setMasterId] = useState(null);
  const [rows, setRows] = useState(null);
  const [chat, setChat] = useState(null);
  const [savingM, setSavingM] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.list("specsHubMaster").then((r) => { const rec = (r.records || [])[0]; if (rec) { setMasterId(rid(rec)); if (rec.categories?.length) setCats(rec.categories); if (rec.tiers?.length) setTiers(rec.tiers); } }).catch(() => {});
    api.list("specsHub").then((r) => setRows((r.records || []).sort((a, b) => rid(b) - rid(a)))).catch(() => setRows([]));
  }, []);

  const saveMasters = async () => {
    setSavingM(true); setMsg("");
    const data = { categories: cats.filter((x) => x.trim()), tiers: tiers.filter((x) => x.trim()) };
    try {
      if (masterId) await api.update("specsHubMaster", masterId, data);
      else { const r = await api.create("specsHubMaster", data); setMasterId(r.id); }
      setMsg("Saved ✓");
    } catch (e) { setMsg(e.message); }
    setSavingM(false);
  };
  const updRow = (r) => setRows((rs) => (rs || []).map((x) => rid(x) === rid(r) ? r : x));

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 4px" }}>Specs-Hub</h2>
      <div style={{ color: "var(--muted)", marginBottom: 18 }}>Dropdown masters for the app, and every specification with its chat.</div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <ListEditor title="Category (app dropdown)" items={cats} setItems={setCats} />
        <ListEditor title="Standard / Premium / Premium Plus" items={tiers} setItems={setTiers} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 26px" }}>
        <button className="btn btn-primary" disabled={savingM} onClick={saveMasters}>{savingM ? "Saving…" : "Save Masters"}</button>
        {msg && <span style={{ fontWeight: 700, color: msg.includes("✓") ? "#0f7a44" : "#c03636" }}>{msg}</span>}
      </div>

      <h3 style={{ margin: "0 0 10px" }}>Specifications</h3>
      {rows === null ? <SkeletonList rows={6} /> : rows.length === 0 ? <div style={{ color: "var(--muted)", padding: 20 }}>No specifications yet.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 12, overflow: "hidden" }}>
            <thead><tr style={{ background: "#f3f6fc", textAlign: "left" }}>{["Project", "Location", "Category", "Spec Person", "Sales Person", "Status", "Mailed", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 12.5, fontWeight: 800 }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rid(r)} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{r.projectName}</td>
                  <td style={{ padding: "10px 12px" }}>{r.location}</td>
                  <td style={{ padding: "10px 12px" }}>{r.category}</td>
                  <td style={{ padding: "10px 12px" }}>{r.specPerson}</td>
                  <td style={{ padding: "10px 12px" }}>{r.salesPerson}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: r.salesStatus === "Win" ? "#0f7a44" : r.salesStatus === "Loss" ? "#c03636" : "#1b3a8f" }}>{r.salesStatus || r.status || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{r.mailTick ? "✓" : "—"}</td>
                  <td style={{ padding: "10px 12px" }}><button className="btn btn-soft" onClick={() => setChat(r)}>💬 Chat</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chat && <AdminChat rec={chat} onChange={updRow} onClose={() => setChat(null)} />}
    </div>
  );
}
