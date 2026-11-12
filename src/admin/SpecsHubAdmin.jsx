import { useEffect, useMemo, useRef, useState } from "react";
import { api, auth } from "../lib/api.js";
import { PageHead, Tabs, StatCard, DataTable, ToolButtons, Pill } from "../components/ui.jsx";
import { SkeletonList } from "../components/Loaders.jsx";
import { recordMatchesPlace, recordPeople, hodNamesOf, visibleUsers } from "../lib/scope.js";

/* Admin Specs-Hub — same look as every other module (stat boxes, filters, Show,
   tabs, table, export, refresh). Admin also sets each record's Category and
   Standard/Premium tier here (not in the app), manages the dropdown options,
   and can join the specs↔sales chat. */

const now = () => new Date().toLocaleString("en-IN");
const rid = (r) => r.id || r._id;
const low = (s) => String(s || "").trim().toLowerCase();
const DEF_CATS = ["Project", "Govt", "Corporate"];
const DEF_TIERS = ["Standard", "Premium", "Premium Plus"];
const sel = { padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };
const statusOf = (r) => r.salesStatus || (r.mailTick ? "Mailed" : r.status) || "Draft";

/* ---- in-app attachment zoom (admin) ---- */
function Lightbox({ src, onClose }) {
  if (!src) return null;
  const isImg = /^data:image\//.test(src) || /\.(png|jpe?g|webp|gif)$/i.test(src);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,8,20,.92)", zIndex: 2000, display: "grid", placeItems: "center", padding: 20 }}>
      {isImg ? <img src={src} style={{ maxWidth: "95%", maxHeight: "95%", borderRadius: 8 }} />
        : <iframe src={src} title="doc" style={{ width: "92%", height: "92%", border: "none", borderRadius: 8, background: "#fff" }} />}
      <button onClick={onClose} style={{ position: "absolute", top: 20, right: 24, background: "#fff", border: "none", borderRadius: "50%", width: 44, height: 44, fontSize: 20, cursor: "pointer" }}>✕</button>
    </div>
  );
}
function Atts({ atts, onZoom }) {
  if (!atts || !atts.length) return <span style={{ color: "var(--muted)" }}>No attachments</span>;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{atts.map((a, i) => /^image\//.test(a.mime)
    ? <img key={i} src={a.base64} onClick={() => onZoom(a.base64)} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)", cursor: "zoom-in" }} />
    : <div key={i} onClick={() => onZoom(a.base64)} style={{ background: "#eef1f8", padding: "10px 14px", borderRadius: 10, fontWeight: 700, color: "#1b3a8f", cursor: "pointer", fontSize: 13 }}>📎 {a.name}</div>)}</div>;
}

/* ---- list editor for the two masters ---- */
function ListEditor({ title, items, setItems }) {
  const [v, setV] = useState("");
  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 16, flex: 1, minWidth: 240 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f3fa" }}>
          <input value={it} onChange={(e) => setItems(items.map((x, j) => j === i ? e.target.value : x))} style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)" }} />
          <button className="btn btn-ghost" style={{ color: "#c03636" }} onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>
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
      const parties = [rec.specPerson, ...(rec.salesPersons && rec.salesPersons.length ? rec.salesPersons : String(rec.salesPerson || "").split(/,\s*/))].filter(Boolean);
      for (const to of [...new Set(parties)]) { try { await api.notify({ to, title: "Specs-Hub message (Admin)", message: `${me}: ${t}`, link: "/app/specs-hub", createdAt: now() }); } catch {} }
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

/* record view — admin assigns Category + tier here */
function ViewModal({ rec, cats, tiers, onSaved, onClose }) {
  const [cat, setCat] = useState(rec.category || "");
  const [tier, setTier] = useState(rec.tier || "");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null);
  const Row = ({ k, v }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #eef1f8", fontSize: 14 }}><span style={{ color: "var(--muted)", fontWeight: 600 }}>{k}</span><b style={{ textAlign: "right", maxWidth: "62%" }}>{v || "—"}</b></div>;
  const save = async () => { setBusy(true); try { const d = { ...rec, category: cat, tier }; await api.update("specsHub", rid(rec), d); onSaved(d); } catch (e) { alert(e.message); setBusy(false); } };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.4)", zIndex: 1000, display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 620, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", borderRadius: 16, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>{rec.projectName}</h3>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ background: "#f6f8fd", border: "1px solid #e6ecf7", borderRadius: 12, padding: "4px 14px", marginBottom: 14 }}>
          <Row k="Approval Date" v={rec.approvalDate} />
          <Row k="Project / Brand" v={rec.projectName} />
          <Row k="Project Location" v={rec.location} />
          <Row k="Colour Code" v={rec.colourCode} />
          <Row k="Grade" v={rec.grade} />
          <Row k="Approved By" v={[rec.approvedByType, rec.firmName].filter(Boolean).join(" — ")} />
          <Row k="Contact Person" v={rec.contactPerson} />
          <Row k="Contact Number" v={rec.contactNumber} />
          <Row k="Mail ID" v={rec.mailId} />
          <Row k="Approved Qty" v={rec.approvedQty ? rec.approvedQty + " Sq.Mtr" : ""} />
          <Row k="Specs Person" v={rec.specPerson} />
          <Row k="Sales Persons" v={rec.salesPersons ? rec.salesPersons.join(", ") : rec.salesPerson} />
          <Row k="Category" v={rec.category} />
          <Row k="Tier" v={rec.tier} />
          <Row k="Status" v={statusOf(rec)} />{rec.mailedAt && <Row k="Mailed" v={rec.mailedAt} />}
        </div>
        {rec.remark && (
          <div style={{ background: "#fff7e6", border: "1px solid #f3e2b8", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#9a6b00", marginBottom: 4 }}>REMARK</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{rec.remark}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>Category (admin)</div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...sel, width: "100%" }}><option value="">Select…</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>Standard / Premium / Premium Plus</div>
            <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ ...sel, width: "100%" }}><option value="">Select…</option>{tiers.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>ATTACHMENTS</div>
        <Atts atts={rec.attachments} onZoom={setZoom} />
        {rec.salesStatus === "Win" && <div style={{ marginTop: 14, background: "#e3f5ec", borderRadius: 12, padding: 14 }}><b style={{ color: "#0f7a44" }}>🏆 WON</b> — {rec.winSqm} Sq.Mtr {rec.winRemark ? "· " + rec.winRemark : ""}{(rec.invoices || []).length ? <div style={{ marginTop: 6, fontSize: 13 }}>Invoices: {(rec.invoices || []).map((x, i) => <span key={i}>{x.no} ₹{x.amount}; </span>)}</div> : null}</div>}
        {rec.salesStatus === "Loss" && <div style={{ marginTop: 14, background: "#fdecec", borderRadius: 12, padding: 14 }}><b style={{ color: "#c03636" }}>✗ LOST</b> — {rec.lossRemark}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={save} style={{ width: "100%", marginTop: 16 }}>{busy ? "Saving…" : "Save Category / Tier"}</button>
        <Lightbox src={zoom} onClose={() => setZoom(null)} />
      </div>
    </div>
  );
}

export default function SpecsHubAdmin() {
  const [cats, setCats] = useState(DEF_CATS);
  const [tiers, setTiers] = useState(DEF_TIERS);
  const [masterId, setMasterId] = useState(null);
  const [all, setAll] = useState(null);
  const [tab, setTab] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fZone, setFZone] = useState(""); const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState(""); const [fUser, setFUser] = useState("");
  const [users, setUsers] = useState([]);
  const [shown, setShown] = useState(false);
  const [view, setView] = useState(null);
  const [chat, setChat] = useState(null);
  const [showMasters, setShowMasters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMasters = () => api.list("specsHubMaster").then((r) => { const rec = (r.records || [])[0]; const d = rec?.data || {}; if (rec) { setMasterId(rid(rec)); if (d.categories?.length) setCats(d.categories); if (d.tiers?.length) setTiers(d.tiers); } }).catch(() => {});
  // records store all fields inside .data — flatten it onto the row so columns read
  const loadRows = () => api.list("specsHub").then((r) => setAll((r.records || []).map((x) => ({ ...(x.data || {}), id: x.id, _id: rid(x), createdByName: x.created_by_name || (x.data || {}).createdByName, createdAt: x.created_at })).sort((a, b) => rid(b) - rid(a)))).catch(() => setAll([]));
  useEffect(() => { loadMasters(); loadRows(); api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const zones = useMemo(() => [...new Set(users.map((u) => u.zone).filter(Boolean))].sort(), [users]);
  const states = useMemo(() => [...new Set(users.flatMap((u) => [u.state, ...String(u.states || "").split(",")]).map((s) => String(s || "").trim()).filter(Boolean))].sort(), [users]);
  const hods = useMemo(() => hodNamesOf(users), [users]);
  const userNames = useMemo(() => visibleUsers(users).map((u) => u.name).filter(Boolean).sort(), [users]);

  const refresh = async () => { setRefreshing(true); await Promise.all([loadMasters(), loadRows()]); setRefreshing(false); };
  const saveMasters = async () => {
    const data = { categories: cats.filter((x) => x.trim()), tiers: tiers.filter((x) => x.trim()) };
    try { if (masterId) await api.update("specsHubMaster", masterId, data); else { const r = await api.create("specsHubMaster", data); setMasterId(r.id); } setShowMasters(false); } catch (e) { alert(e.message); }
  };
  const updRow = (r) => setAll((rs) => (rs || []).map((x) => rid(x) === rid(r) ? { ...r, _id: rid(r) } : x));
  const delRow = async (r) => {
    if (!window.confirm(`Delete "${r.projectName || "this specification"}"? This cannot be undone.`)) return;
    try { await api.remove("specsHub", rid(r)); setAll((rs) => (rs || []).filter((x) => rid(x) !== rid(r))); }
    catch (e) { alert(e.message); }
  };

  const base = useMemo(() => {
    let rs = all || [];
    if (from) rs = rs.filter((r) => (r.approvalDate || "") >= from);
    if (to) rs = rs.filter((r) => (r.approvalDate || "") <= to);
    if (fZone || fState || fHod) rs = rs.filter((r) => recordMatchesPlace(r, users, { zone: fZone, state: fState, hod: fHod }));
    if (fUser) rs = rs.filter((r) => recordPeople(r).map(low).includes(low(fUser)));
    if (fStatus) rs = rs.filter((r) => statusOf(r) === fStatus);
    return rs;
  }, [all, from, to, fZone, fState, fHod, fUser, fStatus, users]);

  const tabbed = useMemo(() => {
    if (tab === "all") return base;
    if (tab === "Mailed") return base.filter((r) => r.mailTick && !r.salesStatus);
    return base.filter((r) => statusOf(r) === tab);
  }, [base, tab]);

  const people = useMemo(() => [...new Set((all || []).flatMap((r) => [r.specPerson, r.salesPerson]).filter(Boolean))], [all]);
  const cnt = (s) => base.filter((r) => statusOf(r) === s).length;

  const exportCsv = () => {
    const cols = ["projectName", "location", "category", "grade", "tier", "approvedByType", "firmName", "specPerson", "salesPerson", "approvedQty", "remark"];
    const head = ["Project", "Project Location", "Category", "Grade", "Tier", "Approved By", "Firm", "Spec Person", "Sales Persons", "Qty", "Remark", "Status"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(",")].concat(tabbed.map((r) => cols.map((c) => esc(r[c])).concat(esc(statusOf(r))).join(",")));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "specs-hub.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const columns = [
    { key: "projectName", label: "Project" },
    { key: "location", label: "Location" },
    { key: "category", label: "Category", render: (v) => v || "—" },
    { key: "grade", label: "Grade" },
    { key: "specPerson", label: "Spec Person" },
    { key: "salesPerson", label: "Sales Persons", render: (v, r) => (r.salesPersons ? r.salesPersons.join(", ") : v) || "—" },
    { key: "status", label: "Status", filter: false, render: (_v, r) => <Pill status={statusOf(r)} /> },
    { key: "mailTick", label: "Mailed", filter: false, render: (v) => v ? "✓" : "—" },
    { key: "createdByName", label: "Created By", render: (v, r) => v || r.specPerson || "—" },
    { key: "remark", label: "Remark", filter: false, render: (v, r) => {
      const t = String(v || ""); if (!t) return "—";
      if (t.length <= 40) return t;
      return <span>{t.slice(0, 40)}… <a onClick={(e) => { e.stopPropagation(); setView(r); }} style={{ color: "#1b3a8f", fontWeight: 700, cursor: "pointer" }}>read more</a></span>;
    } },
  ];
  const tabs = [
    { key: "all", label: "All", count: base.length },
    { key: "Draft", label: "Draft", count: cnt("Draft") },
    { key: "Mailed", label: "Mailed", count: base.filter((r) => r.mailTick && !r.salesStatus).length },
    { key: "Win", label: "Won", count: cnt("Win") },
    { key: "Loss", label: "Lost", count: cnt("Loss") },
  ];

  return (
    <div>
      <PageHead crumb="Specs-Hub" title="Specs-Hub"
        actions={<ToolButtons onRefresh={refresh} refreshing={refreshing} onExport={exportCsv} onHeaderConfig={() => setShowMasters(true)} />} />

      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard label="Total" value={shown ? base.length : 0} sub="Matching records" color="#4a7bff" />
        <StatCard label="Draft" value={shown ? cnt("Draft") : 0} sub="Draft records" color="#8b5cf6" />
        <StatCard label="Mailed" value={shown ? base.filter((r) => r.mailTick && !r.salesStatus).length : 0} sub="Mailed records" color="#10b981" />
        <StatCard label="Won" value={shown ? cnt("Win") : 0} sub="Won records" color="#f59e0b" />
        <StatCard label="Lost" value={shown ? cnt("Loss") : 0} sub="Lost records" color="#ec4899" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={fZone} onChange={(e) => setFZone(e.target.value)} style={sel}><option value="">All Zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select>
          <select value={fState} onChange={(e) => setFState(e.target.value)} style={sel}><option value="">All States</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
          <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={sel}><option value="">All HODs</option>{hods.map((h) => <option key={h}>{h}</option>)}</select>
          <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={sel}><option value="">All Users</option>{userNames.map((p) => <option key={p}>{p}</option>)}</select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={sel} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={sel} />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={sel}><option value="">All Status</option>{["Draft", "Submitted", "Mailed", "Win", "Loss"].map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn btn-primary" style={{ padding: "8px 22px" }} onClick={() => setShown(true)}>Show</button>
        </div>
      </div>

      {!shown ? (
        <div className="card" style={{ padding: 50, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Set filters and click <b>Show</b> to view specifications.</div>
      ) : all === null ? <SkeletonList rows={6} /> : (
        <>
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          <DataTable columns={columns} rows={tabbed} onView={(r) => setView(r)} onChat={(r) => setChat(r)} onDelete={delRow} />
        </>
      )}

      {view && <ViewModal rec={view} cats={cats} tiers={tiers} onSaved={(r) => { updRow(r); setView(r); }} onClose={() => setView(null)} />}
      {chat && <AdminChat rec={chat} onChange={updRow} onClose={() => setChat(null)} />}
      {showMasters && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.4)", zIndex: 1000, display: "grid", placeItems: "center", padding: 20 }} onClick={() => setShowMasters(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 720, maxWidth: "100%", borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><h3 style={{ margin: 0 }}>Dropdown Masters</h3><button className="btn btn-ghost" onClick={() => setShowMasters(false)}>✕</button></div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <ListEditor title="Category" items={cats} setItems={setCats} />
              <ListEditor title="Standard / Premium / Premium Plus" items={tiers} setItems={setTiers} />
            </div>
            <button className="btn btn-primary" onClick={saveMasters} style={{ marginTop: 16 }}>Save Masters</button>
          </div>
        </div>
      )}
    </div>
  );
}
