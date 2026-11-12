import { useEffect, useMemo, useRef, useState } from "react";
import { api, auth } from "../lib/api.js";
import { ChevronLeft, Eye, Pencil, Mail, MessageSquare, Plus, Paperclip, X, Check, Send, Trophy, XCircle } from "lucide-react";
import { SkeletonList } from "../components/Loaders.jsx";
import ScreenHead from "../components/ScreenHead.jsx";
import RefreshBtn from "../components/RefreshBtn.jsx";

/* same in-app full-screen photo / PDF zoom viewer the other modules use */
const openAppPhoto = (url) => { if (url) window.dispatchEvent(new CustomEvent("app-photo", { detail: url })); };

/* ================= Specs-Hub (Specs → Sales) =================
   Specs persons create an approved-specification record, mail it to Approvals
   (CC Sales + their HOD + chosen people) and chat with the mentioned sales
   person. The sales person gets a view + Win/Loss status + the same chat.
   Category and the Standard/Premium tier come from an admin-managed master. */

const CU = () => auth.user || {};
const low = (s) => String(s || "").trim().toLowerCase();
const isAdmin = () => /admin|owner/i.test(CU().role || "") || CU().owner || CU().bootstrap;
const isSpec = () => /spec/i.test(CU().role || "") || isAdmin();
const isSales = () => /sales/i.test(CU().role || "") || isAdmin();

const APPROVED_BY = ["Developer / Builder", "Architect", "Consultant", "Fabricator", "Contractor", "Others"];
const DEF_CATS = ["Project", "Govt", "Corporate"];
const DEF_TIERS = ["Standard", "Premium", "Premium Plus"];
const TO_MAIL = "approvals@eurobondacp.com";
const CC_SALES = "sales@eurobondacp.com";
const CC_RAHUL = "Rahul@eurobondacp.com";

const now = () => new Date().toLocaleString("en-IN");
const rid = (r) => r.id || r._id;

/* ---- shared small UI ---- */
const inp = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--line, #d9deea)", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const lbl = { fontSize: 12.5, fontWeight: 700, color: "var(--muted, #6b7694)", margin: "14px 0 5px", display: "block" };
const req = <span style={{ color: "#e23b4e" }}> *</span>;
/* same top bar as every other app screen (ScreenHead look): back arrow, title,
   Refresh. Used for the inner views whose Back returns to the list in state. */
function Head({ title, onBack, right }) {
  return (
    <div className="f-screen-head">
      {onBack && <button onClick={onBack} aria-label="Back" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "grid", placeItems: "center" }}><ChevronLeft size={22} /></button>}
      <div className="grow" style={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: 16 }}>{title}</div>
      {right}
      <RefreshBtn />
    </div>
  );
}
function Chip({ s }) {
  const map = { Draft: ["#6b7694", "#eef1f8"], Submitted: ["#1b3a8f", "#e7edfb"], Mailed: ["#0f7a44", "#e3f5ec"], Win: ["#0f7a44", "#e3f5ec"], Loss: ["#c03636", "#fdecec"] };
  const [c, b] = map[s] || map.Draft;
  return <span style={{ fontSize: 11.5, fontWeight: 800, color: c, background: b, padding: "3px 10px", borderRadius: 20 }}>{s}</span>;
}

/* read attachments from file inputs as base64 data URLs; images are shrunk */
function filesToAtts(fileList, cb) {
  const files = Array.from(fileList || []);
  const out = [];
  let left = files.length;
  if (!left) { cb([]); return; }
  files.forEach((file) => {
    const done = (dataUrl) => { out.push({ name: file.name, mime: file.type || "application/octet-stream", base64: dataUrl }); if (--left === 0) cb(out); };
    if (/^image\//.test(file.type)) {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement("canvas"); cv.width = img.width * sc; cv.height = img.height * sc;
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          done(cv.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => done(r.result);
        img.src = r.result;
      };
      r.readAsDataURL(file);
    } else { const r = new FileReader(); r.onloadend = () => done(r.result); r.readAsDataURL(file); }
  });
}

function AttView({ atts }) {
  if (!atts || !atts.length) return <div style={{ color: "var(--muted)", fontSize: 13 }}>No attachments</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {atts.map((a, i) => /^image\//.test(a.mime)
        ? <img key={i} src={a.base64} alt={a.name} onClick={() => openAppPhoto(a.base64)} style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 10, border: "1px solid #e1e7f5", cursor: "zoom-in" }} />
        : <div key={i} onClick={() => openAppPhoto(a.base64)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#eef1f8", padding: "10px 14px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, color: "#1b3a8f", cursor: "pointer" }}><Paperclip size={14} /> {a.name.length > 18 ? a.name.slice(0, 16) + "…" : a.name}</div>)}
    </div>
  );
}

/* ================= masters + users hooks ================= */
function useMasters() {
  const [m, setM] = useState({ categories: DEF_CATS, tiers: DEF_TIERS });
  useEffect(() => {
    api.list("specsHubMaster").then((r) => {
      const rec = (r.records || [])[0];
      if (rec) setM({ categories: rec.categories?.length ? rec.categories : DEF_CATS, tiers: rec.tiers?.length ? rec.tiers : DEF_TIERS });
    }).catch(() => {});
  }, []);
  return m;
}
function useUsers() {
  const [u, setU] = useState([]);
  useEffect(() => { api.listUsers().then((d) => setU((d.users || []).filter((x) => x.status == 1))).catch(() => {}); }, []);
  return u;
}
const hodEmailOf = (users, personName) => {
  const p = users.find((x) => low(x.name) === low(personName));
  if (!p || !p.manager) return "";
  const h = users.find((x) => low(x.name) === low(p.manager));
  return h?.email || "";
};
const emailOf = (users, name) => users.find((x) => low(x.name) === low(name))?.email || "";

/* ================= CHAT (specs ↔ sales ↔ admin) ================= */
function Chat({ rec, onChange, onClose }) {
  const [msgs, setMsgs] = useState(rec.messages || []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs]);
  const send = async () => {
    const t = text.trim(); if (!t) return;
    const me = CU().name, role = isAdmin() ? "Admin" : isSpec() ? "Specs" : "Sales";
    const nm = [...msgs, { by: me, role, text: t, at: now() }];
    setMsgs(nm); setText(""); setBusy(true);
    try {
      await api.update("specsHub", rid(rec), { ...rec, messages: nm });
      onChange && onChange({ ...rec, messages: nm });
      const others = [rec.specPerson, rec.salesPerson].filter((n) => n && low(n) !== low(me));
      for (const to of others) { try { await api.notify({ to, title: "Specs-Hub message", message: `${me}: ${t}`, link: isSpec() ? "/app/specs-hub" : "/app/sales-hub", createdAt: now() }); } catch {} }
    } catch (e) { alert(e.message); }
    setBusy(false);
  };
  const mine = (m) => low(m.by) === low(CU().name);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#f6f8fd", zIndex: 80, display: "flex", flexDirection: "column" }}>
      <Head title={`Chat · ${rec.projectName || "Specs"}`} onBack={onClose} />
      <div ref={boxRef} style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {msgs.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 40 }}>No messages yet. Say hello 👋</div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: mine(m) ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "76%", background: mine(m) ? "#1b3a8f" : "#fff", color: mine(m) ? "#fff" : "#1a2236", padding: "10px 14px", borderRadius: 16, boxShadow: "0 2px 8px rgba(20,25,60,.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.75, marginBottom: 2 }}>{m.by} · {m.role}</div>
              <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap" }}>{m.text}</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: "right" }}>{m.at}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e6e9f2", background: "#fff" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" style={{ ...inp, borderRadius: 24 }} />
        <button onClick={send} disabled={busy} style={{ width: 50, height: 50, borderRadius: "50%", background: "#1b3a8f", color: "#fff", border: "none", display: "grid", placeItems: "center", cursor: "pointer" }}><Send size={20} /></button>
      </div>
    </div>
  );
}

/* ================= MAIL ================= */
function MailModal({ rec, users, onSent, onClose }) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const specHod = hodEmailOf(users, rec.specPerson);
  /* fixed CC (sales + Rahul) + the specs person's HOD, all REMOVABLE, and add more */
  const [cc, setCc] = useState(() => [...new Set([CC_SALES, CC_RAHUL])]);
  useEffect(() => { if (specHod) setCc((c) => c.includes(specHod) ? c : [...c, specHod]); }, [specHod]);
  const rmCc = (e) => setCc((c) => c.filter((x) => x !== e));
  const addPerson = () => { if (!pick) return; const e = emailOf(users, pick) || pick; if (e && !cc.includes(e)) setCc((c) => [...c, e]); setPick(""); };
  const ccList = cc;

  const draftHtml = () => {
    const row = (k, v) => v ? `<tr><td style="padding:4px 10px;color:#6b7694;font-weight:600">${k}</td><td style="padding:4px 10px;font-weight:700">${v}</td></tr>` : "";
    return `Dear Sir/Madam,<br>Good Day!<br><br>Please find the approved specification details below:<br><br>
<table style="border-collapse:collapse;font-size:14px">
${row("Approval Date", rec.approvalDate)}${row("Category", rec.category)}${row("Project / Brand", rec.projectName)}${row("Location", rec.location)}
${row("Colour Code", rec.colourCode)}${row("Grade", rec.grade)}${row("Grade Tier", rec.tier)}
${row("Approved By", [rec.approvedByType, rec.firmName].filter(Boolean).join(" — "))}
${row("Contact Person", [rec.contactPerson, rec.contactNumber, rec.mailId].filter(Boolean).join(" · "))}
${row("Approved Qty", rec.approvedQty ? rec.approvedQty + " Sq.Mtr" : "")}
${row("Sales Person", rec.salesPerson)}
</table><br>
Regards,<br><b>${CU().name || ""}</b>${CU().mobile ? "<br>" + CU().mobile : ""}`;
  };

  const send = async () => {
    setBusy(true);
    try {
      await api.sendMail({
        to: TO_MAIL, cc: ccList.join(","),
        subject: `Approved Specification — ${rec.projectName || ""}${rec.location ? ", " + rec.location : ""}`,
        body: draftHtml(), html: true,
        attachments: (rec.attachments || []).map((a) => ({ name: a.name, mime: a.mime, base64: a.base64 })),
      });
      const upd = { ...rec, mailTick: true, mailedAt: now(), status: rec.status === "Draft" ? "Submitted" : rec.status };
      await api.update("specsHub", rid(rec), upd);
      onSent(upd);
    } catch (e) { alert("Mail failed: " + e.message); setBusy(false); }
  };

  const salesPeople = users.filter((u) => /sales/i.test(u.role || "")).map((u) => u.name);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#f6f8fd", zIndex: 80, overflowY: "auto" }}>
      <Head title="Mail Specification" onBack={onClose} />
      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #e6ecf7" }}>
          <div style={{ fontSize: 13 }}><b>To:</b> {TO_MAIL}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", margin: "10px 0 6px" }}>CC (tap × to remove any)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ccList.map((e) => <span key={e} style={{ background: "#e7edfb", color: "#1b3a8f", padding: "5px 10px", borderRadius: 16, fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>{e} <X size={13} style={{ cursor: "pointer" }} onClick={() => rmCc(e)} /></span>)}
            {ccList.length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>No CC</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ ...inp, flex: 1 }}>
              <option value="">+ Add a person to CC…</option>
              {salesPeople.concat(users.map((u) => u.name)).filter((n, i, a) => a.indexOf(n) === i).map((n) => <option key={n} value={n}>{n}{emailOf(users, n) ? "" : " (no email)"}</option>)}
            </select>
            <button onClick={addPerson} className="f-submit" style={{ padding: "0 16px" }}>Add</button>
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #e6ecf7", marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>PREVIEW</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: draftHtml() }} />
          <div style={{ marginTop: 12 }}><div style={lbl}>Attachments ({(rec.attachments || []).length})</div><AttView atts={rec.attachments} /></div>
        </div>
        <button onClick={send} disabled={busy} className="f-submit" style={{ width: "100%", marginTop: 16, padding: 14, fontSize: 15 }}>{busy ? "Sending…" : "✉ Send Mail with Attachments"}</button>
      </div>
    </div>
  );
}

/* ================= FORM (create / edit) ================= */
function SpecForm({ edit, onSaved, onClose }) {
  const users = useUsers();
  const [f, setF] = useState(edit || { approvalDate: "", category: "", projectName: "", location: "", colourCode: "", grade: "", tier: "", approvedByType: "", firmName: "", contactPerson: "", contactNumber: "", mailId: "", approvedQty: "", attachments: [], salesPerson: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const salesPeople = users.filter((u) => /sales/i.test(u.role || "")).map((u) => u.name);

  const addFiles = (fl) => filesToAtts(fl, (atts) => setF((p) => ({ ...p, attachments: [...(p.attachments || []), ...atts] })));
  const rmAtt = (i) => setF((p) => ({ ...p, attachments: p.attachments.filter((_, j) => j !== i) }));

  const save = async (asDraft) => {
    if (!asDraft) {
      const need = [["approvalDate", "Approval date"], ["projectName", "Project / Brand name"], ["location", "Location"], ["colourCode", "Colour code"], ["grade", "Grade"], ["approvedByType", "Approved by"], ["firmName", "Firm name"], ["contactPerson", "Contact person name"], ["salesPerson", "Sales person"]];
      for (const [k, label] of need) if (!String(f[k] || "").trim()) { alert(`Please fill: ${label}`); return; }
      if (!(f.attachments || []).length) { alert("Please add at least one attachment (photo / PDF)."); return; }
    } else {
      if (!String(f.projectName || "").trim()) { alert("Add at least the Project / Brand name to save a draft."); return; }
    }
    setBusy(true);
    const data = { ...f, status: asDraft ? "Draft" : (f.status === "Mailed" || f.mailTick ? f.status : "Submitted"), specPerson: edit?.specPerson || CU().name };
    if (edit && edit.mailTick) data.mailTick = false; // changed after mail -> needs re-mail
    try {
      let r;
      if (edit) { r = await api.update("specsHub", rid(edit), data); onSaved({ ...edit, ...data }); }
      else {
        r = await api.create("specsHub", data);
        onSaved({ id: r.id, ...data });
        if (f.salesPerson) { try { await api.notify({ to: f.salesPerson, title: "New Specification approved", message: `${CU().name} mentioned you on "${f.projectName}"`, link: "/app/sales-hub", createdAt: now() }); } catch {} }
      }
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f6f8fd", zIndex: 70, overflowY: "auto" }}>
      <Head title={edit ? "Edit Specification" : "New Specification"} onBack={onClose} />
      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
        <label style={lbl}>Approval Date{req}</label>
        <input type="date" value={f.approvalDate} onChange={(e) => set("approvalDate", e.target.value)} style={inp} />
        <label style={lbl}>Project / Brand Name{req}</label>
        <input value={f.projectName} onChange={(e) => set("projectName", e.target.value)} style={inp} placeholder="Project or brand name" />
        <label style={lbl}>Location{req}</label>
        <input value={f.location} onChange={(e) => set("location", e.target.value)} style={inp} />
        <label style={lbl}>Colour Code{req}</label>
        <input value={f.colourCode} onChange={(e) => set("colourCode", e.target.value)} style={inp} />
        <label style={lbl}>Grade{req}</label>
        <input value={f.grade} onChange={(e) => set("grade", e.target.value)} style={inp} />
        <label style={lbl}>Approved By{req}</label>
        <select value={f.approvedByType} onChange={(e) => set("approvedByType", e.target.value)} style={inp}><option value="">Select…</option>{APPROVED_BY.map((c) => <option key={c}>{c}</option>)}</select>
        {f.approvedByType && (
          <div style={{ background: "#fff", border: "1px solid #e6ecf7", borderRadius: 12, padding: 12, marginTop: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1b3a8f", marginBottom: 2 }}>{f.approvedByType} — contact details</div>
            <label style={lbl}>Firm Name{req}</label>
            <input value={f.firmName} onChange={(e) => set("firmName", e.target.value)} style={inp} />
            <label style={lbl}>Contact Person Name{req}</label>
            <input value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} style={inp} />
            <label style={lbl}>Contact Number</label>
            <input value={f.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} style={inp} inputMode="tel" />
            <label style={lbl}>Mail ID</label>
            <input value={f.mailId} onChange={(e) => set("mailId", e.target.value)} style={inp} type="email" />
          </div>
        )}
        <label style={lbl}>Approved Qty (Sq.Mtr)</label>
        <input value={f.approvedQty} onChange={(e) => set("approvedQty", e.target.value.replace(/[^\d.]/g, ""))} style={inp} inputMode="decimal" />
        <label style={lbl}>Attachments (photo / PDF){req}</label>
        <label className="f-submit" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", cursor: "pointer" }}><Paperclip size={15} /> Add files<input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} /></label>
        {(f.attachments || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {f.attachments.map((a, i) => (
              <div key={i} style={{ position: "relative" }}>
                {/^image\//.test(a.mime) ? <img src={a.base64} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid #e1e7f5" }} /> : <div style={{ width: 84, height: 84, borderRadius: 10, background: "#eef1f8", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#1b3a8f", textAlign: "center", padding: 6 }}>PDF</div>}
                <span onClick={() => rmAtt(i)} style={{ position: "absolute", top: -7, right: -7, background: "#e23b4e", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={13} /></span>
              </div>
            ))}
          </div>
        )}
        <label style={lbl}>Sales Person (mention){req}</label>
        <select value={f.salesPerson} onChange={(e) => set("salesPerson", e.target.value)} style={inp}><option value="">Select sales person…</option>{salesPeople.map((n) => <option key={n}>{n}</option>)}</select>

        <div style={{ display: "flex", gap: 10, margin: "22px 0 40px" }}>
          <button onClick={() => save(true)} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, border: "1px solid #c9d2ea", background: "#fff", color: "#1b3a8f", fontWeight: 800, cursor: "pointer" }}>Save Draft</button>
          <button onClick={() => save(false)} disabled={busy} className="f-submit" style={{ flex: 1, padding: 13, fontSize: 15 }}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= VIEW ================= */
function SpecView({ rec, onClose }) {
  const Row = ({ k, v }) => <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: "1px solid #eef1f8", fontSize: 14 }}><span style={{ color: "var(--muted)", fontWeight: 600 }}>{k}</span><b style={{ textAlign: "right", maxWidth: "60%" }}>{v || "—"}</b></div>;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#f6f8fd", zIndex: 70, overflowY: "auto" }}>
      <Head title="Specification" onBack={onClose} right={<Chip s={rec.salesStatus || rec.status} />} />
      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: "4px 16px", border: "1px solid #e6ecf7" }}>
          <Row k="Approval Date" v={rec.approvalDate} /><Row k="Project / Brand" v={rec.projectName} />
          <Row k="Location" v={rec.location} /><Row k="Colour Code" v={rec.colourCode} /><Row k="Grade" v={rec.grade} />
          <Row k="Approved By" v={[rec.approvedByType, rec.firmName].filter(Boolean).join(" — ")} />
          <Row k="Contact" v={[rec.contactPerson, rec.contactNumber, rec.mailId].filter(Boolean).join(" · ")} />
          <Row k="Approved Qty" v={rec.approvedQty ? rec.approvedQty + " Sq.Mtr" : ""} /><Row k="Sales Person" v={rec.salesPerson} /><Row k="Specs Person" v={rec.specPerson} />
          {rec.mailedAt && <Row k="Mailed" v={rec.mailedAt} />}
        </div>
        <div style={{ marginTop: 14 }}><div style={lbl}>ATTACHMENTS</div><AttView atts={rec.attachments} /></div>
        {rec.salesStatus === "Win" && (
          <div style={{ marginTop: 14, background: "#e3f5ec", borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 900, color: "#0f7a44", marginBottom: 6 }}>🏆 WON</div>
            <Row k="Sales Done" v={rec.salesDone} /><Row k="Win Sq.Mtr" v={rec.winSqm} /><Row k="Remark" v={rec.winRemark} />
            {(rec.invoices || []).length > 0 && <div style={{ marginTop: 8, fontSize: 13 }}><b>Invoices:</b> {(rec.invoices || []).map((iv, i) => <div key={i}>{iv.no} · ₹{iv.amount} {iv.date ? "· " + iv.date : ""}</div>)}</div>}
            {rec.winAttachments?.length > 0 && <div style={{ marginTop: 8 }}><AttView atts={rec.winAttachments} /></div>}
          </div>
        )}
        {rec.salesStatus === "Loss" && <div style={{ marginTop: 14, background: "#fdecec", borderRadius: 14, padding: 16 }}><div style={{ fontWeight: 900, color: "#c03636", marginBottom: 6 }}>✗ LOST</div><div style={{ fontSize: 14 }}>{rec.lossRemark || "—"}</div></div>}
      </div>
    </div>
  );
}

/* ================= row card with actions ================= */
function RowCard({ rec, actions }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #e9edf6", marginBottom: 12, boxShadow: "0 2px 8px rgba(20,35,90,.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15.5 }}>{rec.projectName || "Untitled"}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{[rec.location, rec.colourCode, rec.grade].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{rec.salesPerson ? "Sales: " + rec.salesPerson : ""}{rec.specPerson ? " · Spec: " + rec.specPerson : ""}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <Chip s={rec.salesStatus || rec.status} />
          {rec.mailTick && <div style={{ color: "#0f7a44", fontSize: 11.5, fontWeight: 800, marginTop: 6, display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}><Check size={14} /> Mailed</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}
/* buttons match the Enquiries list style: no border, light-tinted background,
   bold coloured text, filling the row evenly */
const TONE = { v: ["#3949ab", "#eef1ff"], e: ["#c99400", "#fff7e0"], p: ["#0f7a44", "#e7f7ef"], m: ["#6c5ce7", "#efeaff"], d: ["#c0392b", "#fdecec"] };
const ActBtn = ({ icon, label, onClick, tone = "v" }) => {
  const [c, b] = TONE[tone] || TONE.v;
  return <button onClick={onClick} style={{ flex: "1 1 auto", minWidth: 58, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 6px", borderRadius: 8, border: "none", background: b, color: c, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>{icon} {label}</button>;
};

/* ================= SPECS-HUB SCREEN (specs side) ================= */
export function SpecsHubScreen() {
  const [rows, setRows] = useState(null);
  const [view, setView] = useState(null);   // {type, rec}
  const users = useUsers();
  const load = () => api.list("specsHub", false, isAdmin() ? {} : { involved: 1 }).then((d) => {
    const me = low(CU().name);
    let rs = (d.records || []).map((r) => ({ ...(r.data || {}), id: r.id, _id: r.id, createdByName: r.created_by_name || (r.data || {}).createdByName, createdAt: r.created_at }));
    if (!isAdmin()) rs = rs.filter((r) => low(r.specPerson) === me || low(r.createdByName) === me);
    setRows(rs.sort((a, b) => rid(b) - rid(a)));
  }).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { const h = () => load(); window.addEventListener("eb-refresh-pressed", h); window.addEventListener("eb-app-resumed", h); return () => { window.removeEventListener("eb-refresh-pressed", h); window.removeEventListener("eb-app-resumed", h); }; }, []);
  const upd = (r) => { setRows((rs) => (rs || []).map((x) => rid(x) === rid(r) ? r : x)); setView((v) => v && rid(v.rec) === rid(r) ? { ...v, rec: r } : v); };
  const add = (r) => { setRows((rs) => [r, ...(rs || [])]); };

  if (view?.type === "form") return <SpecForm edit={view.rec} onSaved={(r) => { view.rec ? upd(r) : add(r); setView(null); }} onClose={() => setView(null)} />;
  if (view?.type === "view") return <SpecView rec={view.rec} onClose={() => setView(null)} />;
  if (view?.type === "mail") return <MailModal rec={view.rec} users={users} onSent={(r) => { upd(r); setView({ type: "view", rec: r }); }} onClose={() => setView(null)} />;
  if (view?.type === "chat") return <Chat rec={view.rec} onChange={upd} onClose={() => setView(null)} />;

  return (
    <div style={{ minHeight: "100%", background: "#f6f8fd" }}>
      <ScreenHead title="Specs-Hub" right={<button className="f-submit" style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px" }} onClick={() => setView({ type: "form", rec: null })}><Plus size={16} /> Add</button>} />
      <div style={{ padding: 16 }}>
        {rows === null ? <SkeletonList rows={5} /> : rows.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 50 }}>No specifications yet.<br />Tap <b>Add</b> to create one.</div>
        ) : rows.map((rec) => (
          <RowCard key={rid(rec)} rec={rec} actions={<>
            <ActBtn icon={<Eye size={14} />} label="View" onClick={() => setView({ type: "view", rec })} />
            <ActBtn icon={<Pencil size={14} />} label="Edit" tone="e" onClick={() => setView({ type: "form", rec })} />
            <ActBtn icon={<Mail size={14} />} label={rec.mailTick ? "Re-mail" : "Mail"} tone="p" onClick={() => setView({ type: "mail", rec })} />
            <ActBtn icon={<MessageSquare size={14} />} label="Message" tone="m" onClick={() => setView({ type: "chat", rec })} />
          </>} />
        ))}
      </div>
    </div>
  );
}

/* ================= SALES-HUB SCREEN (sales side) ================= */
function StatusModal({ rec, onSaved, onClose }) {
  const [mode, setMode] = useState(rec.salesStatus || "");
  const [f, setF] = useState({ salesDone: rec.salesDone || "", winSqm: rec.winSqm || "", winRemark: rec.winRemark || "", lossRemark: rec.lossRemark || "", invoices: rec.invoices || [], winAttachments: rec.winAttachments || [] });
  const [iv, setIv] = useState({ no: "", amount: "", date: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const addInv = () => { if (!iv.no && !iv.amount) return; set("invoices", [...f.invoices, iv]); setIv({ no: "", amount: "", date: "" }); };
  const addWinFiles = (fl) => filesToAtts(fl, (a) => set("winAttachments", [...f.winAttachments, ...a]));

  const save = async () => {
    if (!mode) { alert("Choose Win or Loss."); return; }
    if (mode === "Win" && !String(f.winSqm || "").trim()) { alert("Enter the Win Sq.Mtr."); return; }
    if (mode === "Loss" && !String(f.lossRemark || "").trim()) { alert("Enter the loss remark."); return; }
    setBusy(true);
    const data = { ...rec, salesStatus: mode, salesDone: f.salesDone, winSqm: f.winSqm, winRemark: f.winRemark, lossRemark: f.lossRemark, invoices: f.invoices, winAttachments: f.winAttachments, statusAt: now() };
    try {
      await api.update("specsHub", rid(rec), data);
      if (rec.specPerson) { try { await api.notify({ to: rec.specPerson, title: `Specs-Hub ${mode}`, message: `${CU().name} marked "${rec.projectName}" as ${mode}`, link: "/app/specs-hub", createdAt: now() }); } catch {} }
      onSaved(data);
    } catch (e) { alert(e.message); setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#f6f8fd", zIndex: 70, overflowY: "auto" }}>
      <Head title="Update Status" onBack={onClose} />
      <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setMode("Win")} style={{ flex: 1, padding: 16, borderRadius: 14, border: mode === "Win" ? "2px solid #0f9d58" : "1px solid #d9deea", background: mode === "Win" ? "#e3f5ec" : "#fff", fontWeight: 900, color: "#0f7a44", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Trophy size={18} /> Win</button>
          <button onClick={() => setMode("Loss")} style={{ flex: 1, padding: 16, borderRadius: 14, border: mode === "Loss" ? "2px solid #c03636" : "1px solid #d9deea", background: mode === "Loss" ? "#fdecec" : "#fff", fontWeight: 900, color: "#c03636", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><XCircle size={18} /> Loss</button>
        </div>
        {mode === "Win" && (
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Sales Done (details)</label>
            <input value={f.salesDone} onChange={(e) => set("salesDone", e.target.value)} style={inp} />
            <label style={lbl}>Win Sq.Mtr{req}</label>
            <input value={f.winSqm} onChange={(e) => set("winSqm", e.target.value.replace(/[^\d.]/g, ""))} style={inp} inputMode="decimal" />
            <label style={lbl}>Remark</label>
            <textarea value={f.winRemark} onChange={(e) => set("winRemark", e.target.value)} style={{ ...inp, minHeight: 70 }} />
            <label style={lbl}>Attachments</label>
            <label className="f-submit" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", cursor: "pointer" }}><Paperclip size={14} /> Add<input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => addWinFiles(e.target.files)} /></label>
            {f.winAttachments.length > 0 && <div style={{ marginTop: 8 }}><AttView atts={f.winAttachments} /></div>}
            <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e6ecf7", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 800, color: "#1b3a8f", marginBottom: 6 }}>Invoices</div>
              {f.invoices.map((x, i) => <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #eef1f8" }}>{x.no} · ₹{x.amount} {x.date ? "· " + x.date : ""}</div>)}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={iv.no} onChange={(e) => setIv((p) => ({ ...p, no: e.target.value }))} placeholder="Invoice #" style={{ ...inp, flex: 1 }} />
                <input value={iv.amount} onChange={(e) => setIv((p) => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="Amount" style={{ ...inp, width: 110 }} inputMode="decimal" />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input type="date" value={iv.date} onChange={(e) => setIv((p) => ({ ...p, date: e.target.value }))} style={{ ...inp, flex: 1 }} />
                <button onClick={addInv} className="f-submit" style={{ padding: "0 16px" }}>+ Add</button>
              </div>
            </div>
          </div>
        )}
        {mode === "Loss" && (
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Loss Remark{req}</label>
            <textarea value={f.lossRemark} onChange={(e) => set("lossRemark", e.target.value)} style={{ ...inp, minHeight: 90 }} />
          </div>
        )}
        <button onClick={save} disabled={busy} className="f-submit" style={{ width: "100%", marginTop: 20, padding: 14, fontSize: 15 }}>{busy ? "Saving…" : "Save Status"}</button>
      </div>
    </div>
  );
}

export function SalesHubScreen() {
  const [rows, setRows] = useState(null);
  const [view, setView] = useState(null);
  const load = () => api.list("specsHub", false, isAdmin() ? {} : { involved: 1 }).then((d) => {
    const me = low(CU().name);
    let rs = (d.records || []).map((r) => ({ ...(r.data || {}), id: r.id, _id: r.id, createdByName: r.created_by_name || (r.data || {}).createdByName, createdAt: r.created_at }));
    // sales side: only records that are mailed/submitted (approved & sent), where I'm the sales person
    if (!isAdmin()) rs = rs.filter((r) => low(r.salesPerson) === me);
    setRows(rs.sort((a, b) => rid(b) - rid(a)));
  }).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  useEffect(() => { const h = () => load(); window.addEventListener("eb-refresh-pressed", h); window.addEventListener("eb-app-resumed", h); return () => { window.removeEventListener("eb-refresh-pressed", h); window.removeEventListener("eb-app-resumed", h); }; }, []);
  const upd = (r) => { setRows((rs) => (rs || []).map((x) => rid(x) === rid(r) ? r : x)); setView((v) => v && rid(v.rec) === rid(r) ? { ...v, rec: r } : v); };

  if (view?.type === "view") return <SpecView rec={view.rec} onClose={() => setView(null)} />;
  if (view?.type === "chat") return <Chat rec={view.rec} onChange={upd} onClose={() => setView(null)} />;
  if (view?.type === "status") return <StatusModal rec={view.rec} onSaved={(r) => { upd(r); setView({ type: "view", rec: r }); }} onClose={() => setView(null)} />;

  return (
    <div style={{ minHeight: "100%", background: "#f6f8fd" }}>
      <ScreenHead title="Sales-Hub" />
      <div style={{ padding: 16 }}>
        {rows === null ? <SkeletonList rows={5} /> : rows.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 50 }}>No specifications shared with you yet.</div>
        ) : rows.map((rec) => (
          <RowCard key={rid(rec)} rec={rec} actions={<>
            <ActBtn icon={<Eye size={14} />} label="View" onClick={() => setView({ type: "view", rec })} />
            <ActBtn icon={<MessageSquare size={14} />} label="Message" tone="m" onClick={() => setView({ type: "chat", rec })} />
            <ActBtn icon={rec.salesStatus === "Win" ? <Trophy size={14} /> : rec.salesStatus === "Loss" ? <XCircle size={14} /> : <Check size={14} />} label={rec.salesStatus ? rec.salesStatus : "Status"} tone="p" onClick={() => setView({ type: "status", rec })} />
          </>} />
        ))}
      </div>
    </div>
  );
}
