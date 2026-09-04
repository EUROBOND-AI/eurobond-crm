import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { scopeRows } from "../lib/scope.js";
import { LETTERHEAD } from "./letterhead.js";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/* Admin Quotation — same "From" reflects, quotation-to-quotation format,
   Action: Approve -> app shows approved + PDF auto-generates (company format).
   Mail: To=client, CC=chosen, from sales1@eurobondacp.com with fixed draft. */
export default function QuotationAdmin() {
  const [rows, setRows] = useState(null);
  const [colSearch, setColSearch] = useState({});
  const [view, setView] = useState(null);
  const [mailFor, setMailFor] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fStatus, setFStatus] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [applied, setApplied] = useState(null);
  const [qUsers, setQUsers] = useState([]);
  const QUOTE_COLS = ["Quotation No", "Firm", "Project", "Attn", "Mobile", "Email", "Grade", "Thickness", "Colour Code", "Rate/SqMtr", "Rate/SqFt", "Created By", "Status"];
  const [hiddenCols, setHiddenCols] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("quote_hidden_cols") || "[]")); } catch { return new Set(); } });
  const [cfgOpen, setCfgOpen] = useState(false);
  const toggleCol = (c) => setHiddenCols((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); localStorage.setItem("quote_hidden_cols", JSON.stringify([...n])); return n; });
  const colVisible = (c) => !hiddenCols.has(c);
  const applyShow = () => setApplied({ status: fStatus, person: fPerson, from: fFrom, to: fTo });

  const load = () => api.list("quotation", false)
    .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))))
    .catch(() => setRows([]));
  useEffect(() => { load(); api.listUsers().then((d) => setQUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const list = useMemo(() => {
    let l = scopeRows(rows || [], qUsers, ["createdBy", "by", "salesPerson"]);
    const anyColSearch = Object.values(colSearch).some((v) => String(v || "").trim());
    if (!applied && !anyColSearch) return [];   // nothing until Show is clicked
    if (applied) {
      if (applied.status) l = l.filter((r) => (r.status || "Pending") === applied.status);
      if (applied.person) l = l.filter((r) => (r.createdBy || "") === applied.person);
      if (applied.from) l = l.filter((r) => { const d = (r.createdAt2 || r._created || "").slice(0, 10); return !d || d >= applied.from; });
      if (applied.to) l = l.filter((r) => { const d = (r.createdAt2 || r._created || "").slice(0, 10); return !d || d <= applied.to; });
    }
    Object.entries(colSearch).forEach(([k, v]) => {
      const vv = String(v || "").toLowerCase();
      if (vv) l = l.filter((r) => String(r[k] ?? "").toLowerCase().includes(vv));
    });
    return l;
  }, [rows, colSearch, applied, qUsers]);

  const approve = async (q) => {
    setBusy(true);
    try {
      await api.update("quotation", q._id, { ...q, status: "Approved", approvedAt: new Date().toISOString() });
      /* notify the field user that admin approved */
      try { await api.create("notification", { title: "Quotation Approved", message: `Your quotation ${q.quoteNo || q.id} has been approved.`, forUser: q.createdById, link: "/app/m/quotation", at: new Date().toISOString() }); } catch {}
      load();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const pending = (rows || []).filter((r) => (r.status || "Pending") === "Pending").length;

  const importCsv = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { alert("CSV is empty."); return; }
      const parse = (line) => { const out = []; let cur = "", inQ = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
      const head = parse(lines[0]).map((h) => h.trim().toLowerCase());
      const idx = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const ci = { party: idx(["firm", "party", "customer"]), project: idx(["project"]), contact: idx(["attn", "contact"]), mobile: idx(["mobile", "phone"]), email: idx(["email"]), grade: idx(["grade"]), rate: idx(["rate"]) };
      let added = 0;
      for (let i = 1; i < lines.length; i++) {
        const c = parse(lines[i]);
        const party = ci.party >= 0 ? (c[ci.party] || "").trim() : "";
        if (!party) continue;
        const rec = { partyName: party, projectName: ci.project >= 0 ? (c[ci.project] || "").trim() : "", contactName: ci.contact >= 0 ? (c[ci.contact] || "").trim() : "", mobile: ci.mobile >= 0 ? (c[ci.mobile] || "").trim() : "", clientEmail: ci.email >= 0 ? (c[ci.email] || "").trim() : "", grade: ci.grade >= 0 ? (c[ci.grade] || "").trim() : "", rate: ci.rate >= 0 ? (c[ci.rate] || "").trim() : "", createdBy: "Imported", status: "Pending", imported: true };
        try { await api.create("quotation", rec); added++; } catch {}
      }
      alert(`${added} quotations imported.`);
      load();
    } catch (e) { alert("Import failed: " + e.message); }
  };

  const exportCsv = () => {
    const head = ["Quotation No", "From", "Project", "Created By", "Grade", "Rate/SqFt", "Status", "Client Email"];
    const body = (list || []).map((r) => [r.quoteNo || r.id, r.partyName || r.customer, r.projectName, r.createdBy, r.grade || (r.items && r.items[0] && r.items[0].grade), r.rate, r.status || "Pending", r.clientEmail || ""]);
    const csv = [head, ...body].map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "quotations.csv"; a.click();
  };
  const approved = (rows || []).filter((r) => r.status === "Approved").length;
  const won = (rows || []).filter((r) => r.status === "Win").length;

  return (
    <div>
      <PageHead crumb="SFA" title="Quotation List" actions={
        <ToolButtons
          onAdd={() => setShowAdd(true)}
          addLabel="Add Quotation"
          onRefresh={load}
          onExport={exportCsv}
          onImport={() => document.getElementById("quote-import-file").click()}
          onHeaderConfig={() => setCfgOpen(true)}
          onLogs={() => alert("Logs — quotations created from field app.")}
          onReport={exportCsv}
        />
      } />
      <input id="quote-import-file" type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />

      <div className="stat-row">
        <StatCard label="Total" value={rows ? rows.length : 0} sub="All quotations" />
        <StatCard label="Pending" value={pending} sub="Awaiting approval" color="#f59e0b" />
        <StatCard label="Approved" value={approved} sub="Approved" color="#2563eb" />
        <StatCard label="Won" value={won} sub="Win" color="#059669" />
      </div>

      {/* filters + Show */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14, background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Status</label>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }}>
            <option value="">All</option><option>Pending</option><option>Approved</option><option>Win</option>
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Created By</label>
          <select value={fPerson} onChange={(e) => setFPerson(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }}>
            <option value="">All Sales Persons</option>
            {[...new Set((rows || []).map((r) => r.createdBy).filter(Boolean))].sort().map((p) => <option key={p}>{p}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>From Date</label>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} /></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>To Date</label>
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} /></div>
        <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={applyShow}>Show</button>
        {applied && <button className="btn btn-soft" onClick={() => { setApplied(null); setFStatus(""); setFPerson(""); setFFrom(""); setFTo(""); }}>Clear</button>}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                {["Quotation No", "Firm", "Project", "Attn", "Mobile", "Email", "Grade", "Thickness", "Colour Code", "Rate/SqMtr", "Rate/SqFt", "Created By", "Status"].filter(colVisible).concat(["Action"]).map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
              <tr style={{ background: "#fafbff" }}>
                {[["quoteNo", "Quotation No"], ["partyName", "Firm"], ["projectName", "Project"], ["contactName", "Attn"], ["mobile", "Mobile"], ["clientEmail", "Email"], [null, "Grade"], [null, "Thickness"], [null, "Colour Code"], [null, "Rate/SqMtr"], [null, "Rate/SqFt"], ["createdBy", "Created By"], ["status", "Status"], [null, "Action"]].filter(([, col]) => !col || col === "Action" || colVisible(col)).map(([k], i) => (
                  <th key={i} style={{ padding: "6px 10px" }}>
                    {k && <input value={colSearch[k] || ""} onChange={(e) => setColSearch((c) => ({ ...c, [k]: e.target.value }))} placeholder="Search…"
                      style={{ width: "100%", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 11.5, background: "#fff" }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={14} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={14} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>{applied ? "No quotations found for the selected filter." : "Use filters and click Show to load quotations."}</td></tr>
              ) : list.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                  {colVisible("Quotation No") && <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                    <span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>{r.quoteNo || r.id}</span>
                  </td>}
                  {colVisible("Firm") && <td style={{ padding: "11px 14px" }}>{r.partyName || r.customer}</td>}
                  {colVisible("Project") && <td style={{ padding: "11px 14px" }}>{r.projectName || "—"}</td>}
                  {colVisible("Attn") && <td style={{ padding: "11px 14px" }}>{r.contactName || "—"}</td>}
                  {colVisible("Mobile") && <td style={{ padding: "11px 14px" }}>{r.contactNumber || r.mobile || "—"}</td>}
                  {colVisible("Email") && <td style={{ padding: "11px 14px" }}>{r.clientEmail || "—"}</td>}
                  {colVisible("Grade") && <td style={{ padding: "11px 14px" }}>{r.grade || (r.items && r.items[0] && r.items[0].grade) || "—"}</td>}
                  {colVisible("Thickness") && <td style={{ padding: "11px 14px", fontSize: 11 }}>{(r.items && r.items[0] && r.items[0].thickness) || r.thickness || "—"}</td>}
                  {colVisible("Colour Code") && <td style={{ padding: "11px 14px" }}>{(r.items && r.items[0] && (r.items[0].colourCode || r.items[0].colour)) || r.colour || "—"}</td>}
                  {colVisible("Rate/SqMtr") && <td style={{ padding: "11px 14px" }}>{(r.items && r.items[0] && r.items[0].ratePerSqm) ? `₹${r.items[0].ratePerSqm}` : (r.ratePerSqm ? `₹${r.ratePerSqm}` : "—")}</td>}
                  {colVisible("Rate/SqFt") && <td style={{ padding: "11px 14px" }}>{r.rate ? `₹${r.rate}` : "—"}</td>}
                  {colVisible("Created By") && <td style={{ padding: "11px 14px" }}>{r.createdBy || "—"}</td>}
                  {colVisible("Status") && <td style={{ padding: "11px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 8,
                      background: r.status === "Win" ? "#e5f9f1" : r.status === "Approved" ? "#e8f0ff" : "#fef3e2",
                      color: r.status === "Win" ? "#059669" : r.status === "Approved" ? "#2563eb" : "#c07f00" }}>
                      {r.status || "Pending"}
                    </span>
                  </td>}
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setView(r)}>View</button>
                      {(r.status || "Pending") === "Pending" && <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => approve(r)}>Approve</button>}
                      {r.status === "Approved" && <button className="btn btn-soft" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => downloadQuotePdf(r)}>PDF</button>}
                      {r.status === "Approved" && <button className="btn btn-soft" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setMailFor(r)}>Mail</button>}
                      <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={async () => { if (window.confirm(`Delete quotation ${r.quoteNo || r.id}?`)) { try { await api.remove("quotation", r._id); load(); } catch (e) { alert(e.message); } } }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cfgOpen && (
        <div className="modal-mask" onClick={() => setCfgOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Show / Hide Columns</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setCfgOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 8, maxHeight: "60vh", overflowY: "auto" }}>
              {QUOTE_COLS.map((c) => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={colVisible(c)} onChange={() => toggleCol(c)} style={{ width: 16, height: 16 }} />
                  {c}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)" }}>Your choice is saved on this device.</div>
          </div>
        </div>
      )}

      {view && <QuoteAdminView q={view} onClose={() => setView(null)} onPdf={() => downloadQuotePdf(view)} />}
      {mailFor && <MailModal q={mailFor} onClose={() => setMailFor(null)} />}
      {showAdd && <AdminQuoteForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function QuoteAdminView({ q, onClose, onPdf }) {
  const items = q.items || [{ grade: q.grade, colour: q.colour, rate: q.rate, ratePerSqm: q.ratePerSqm }];
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{q.quoteNo || q.id}</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <div><b>From:</b> {q.partyName || q.customer}</div>
          {q.projectName && <div><b>Project:</b> {q.projectName}</div>}
          {q.contactName && <div><b>Attn:</b> {q.contactName} {q.contactNumber ? `(${q.contactNumber})` : ""}</div>}
          {q.clientEmail && <div><b>Mail ID:</b> {q.clientEmail}</div>}
          {q.address && <div><b>Address:</b> {q.address}</div>}
          <div><b>Created By:</b> {q.createdBy} · {q.createdAt}</div>
          <div><b>Status:</b> {q.status || "Pending"}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 14 }}>
          <thead><tr style={{ background: "#f4f6fc" }}>
            <th style={{ padding: 8, textAlign: "left" }}>Sr</th><th style={{ padding: 8, textAlign: "left" }}>Grade</th>
            <th style={{ padding: 8, textAlign: "left" }}>Colour</th><th style={{ padding: 8, textAlign: "left" }}>Rate/Sq.Mtr</th><th style={{ padding: 8, textAlign: "left" }}>Rate/Sq.Ft</th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: "1px solid #eef" }}>
                <td style={{ padding: 8 }}>{i + 1}</td>
                <td style={{ padding: 8 }}>{it.grade} {it.thickness ? <span style={{ fontSize: 10, color: "#888" }}>({it.thickness})</span> : ""} {i > 0 ? "(Running Feet)" : ""}</td>
                <td style={{ padding: 8 }}>{it.colourCode ? it.colourCode + " · " : ""}{it.colour}</td>
                <td style={{ padding: 8 }}>{i === 0 && it.ratePerSqm ? `INR ${it.ratePerSqm}` : "—"}</td>
                <td style={{ padding: 8 }}>INR {it.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.tc && (
          <div style={{ marginTop: 14, fontSize: 12.5, display: "grid", gap: 3 }}>
            <div><b>Taxes:</b> {q.tc.taxes} &nbsp; <b>Freight:</b> {q.tc.freight}</div>
            <div><b>Delivery:</b> {q.tc.delivery} &nbsp; <b>Payment:</b> {q.tc.payment} &nbsp; <b>Validity:</b> {q.tc.validity}</div>
            <div><b>Billing:</b> {q.tc.billing}</div>
            {q.tc.remarks && <div><b>Remarks:</b> {q.tc.remarks}</div>}
          </div>
        )}
        {q.status === "Win" && q.winInvoice && (
          <div style={{ marginTop: 14 }}>
            <b style={{ fontSize: 13 }}>Invoice (Won · {q.winSqm} sq.mtr):</b>
            {String(q.winInvoice).toLowerCase().includes(".pdf")
              ? <a href={q.winInvoice} target="_blank" rel="noreferrer" className="btn btn-soft" style={{ marginTop: 6, display: "inline-block" }}>Open Invoice PDF</a>
              : <img src={q.winInvoice} alt="Invoice" style={{ width: "100%", borderRadius: 10, marginTop: 6 }} />}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onPdf}>Download PDF</button>
        </div>
      </div>
    </div>
  );
}

/* Mail modal — To=client, CC=chosen, from sales1@eurobondacp.com + fixed draft */
function MailModal({ q, onClose }) {
  const [to, setTo] = useState(q.clientEmail || "");
  const [cc, setCc] = useState("sales@eurobondacp.com, sales3@eurobondacp.com, rahul@eurobondacp.com");
  const defaultDraft = `Dear Sir,

Please find attached the quotation for your kind perusal.

Additionally, we would like to draw your attention to our corporate video available at the following link: https://youtu.be/yjuw53dhZQI
Moreover, you may be interested in viewing our fire test video at: https://www.youtube.com/watch?v=I2oZhmtIfA4
Eurobond E-Catalogues Drive Link - https://drive.google.com/drive/folders/1ZWifdqR6t2x9JVH7c1Vv-45pjCzYxMmh?usp=sharing

Confidentiality Clause:
This quotation is confidential and intended solely for the recipient named above. Please do not disclose, copy, or distribute the contents to any third party without prior written consent from EURO PANEL PRODUCTS LIMITED

We look forward to the pleasure of hearing from you shortly.

Thank you,
EUROBOND`;
  const [draft, setDraft] = useState(defaultDraft);
  const [subject, setSubject] = useState(`Quotation ${q.quoteNo || q.id} - Eurobond`);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!to) { alert("Client email required"); return; }
    setBusy(true);
    try {
      /* quotation ni real PDF (letterhead) attachment ga build cheddam */
      const pdfB64 = await buildQuotePdfBase64(q);
      const res = await api.sendMail({
        to, cc, from: "sales1@eurobondacp.com", subject, body: draft,
        attachment: { name: `Quotation-${(q.quoteNo || q.id).replace(/\//g, "-")}.pdf`, mime: "application/pdf", base64: pdfB64 },
      });
      if (res && res.sent) {
        try { await api.create("notification", { title: "Quotation Sent", message: `Quotation ${q.quoteNo || q.id} sent to client.`, forUser: q.createdById, link: "/app/m/quotation", at: new Date().toISOString() }); } catch {}
        alert("✓ Mail sent to client with quotation PDF.");
        onClose();
      } else {
        alert("Mail could not be sent.\n\n" + (res && res.error ? res.error : "Please check the mail server settings.") + "\n\nThe quotation was NOT emailed.");
        setBusy(false);
      }
    } catch (e) {
      alert("Mail failed: " + e.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Mail Quotation — {q.quoteNo || q.id}</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>From: sales1@eurobondacp.com · 📎 Quotation PDF attached</div>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>To (Client Email)</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>CC</label>
        <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 12px" }} />
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>Message (editable)</label>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 14px", fontSize: 11.5 }} />
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send Mail with PDF"}</button>
      </div>
    </div>
  );
}

/* Build the quotation as a real PDF (letterhead bg) -> base64 (no data: prefix) */
async function buildQuotePdfBase64(q) {
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-9999px";
  holder.style.top = "0";
  holder.style.width = "794px";
  holder.innerHTML = quotePageHtml(q);
  document.body.appendChild(holder);
  const page = holder.querySelector(".page");
  try {
    const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    pdf.addImage(img, "JPEG", 0, 0, 210, 297);
    const dataUri = pdf.output("datauristring");
    return dataUri.substring(dataUri.indexOf(",") + 1);
  } finally {
    document.body.removeChild(holder);
  }
}

/* A4 page HTML with letterhead background (for html2canvas capture) */
function quotePageHtml(q) {
  const items = q.items || [{ grade: q.grade, colour: q.colour, rate: q.rate, ratePerSqm: q.ratePerSqm }];
  const tc = q.tc || {};
  const rowsHtml = items.map((it, i) => `<tr>
    <td style="text-align:center;border:1px solid #999;padding:7px;width:8%">${i + 1}</td>
    <td style="text-align:left;border:1px solid #999;padding:7px;width:38%">${it.grade || ""}${it.thickness ? `<span style="font-size:10px;color:#666;display:block">(${it.thickness})</span>` : ""}${it.fins ? " (Running Feet)" : ""}</td>
    <td style="text-align:center;border:1px solid #999;padding:7px;width:22%">${it.colourCode ? it.colourCode + " · " : ""}${it.colour || ""}</td>
    <td style="text-align:right;border:1px solid #999;padding:7px;width:16%">${!it.fins && it.ratePerSqm ? "INR - " + it.ratePerSqm : "—"}</td>
    <td style="text-align:right;border:1px solid #999;padding:7px;width:16%">INR - ${it.rate}</td>
  </tr>`).join("");
  return `<div class="page" style="position:relative;width:794px;min-height:1123px;padding:158px 68px 128px;font-family:Arial;font-size:13px;color:#1a1a1a;box-sizing:border-box;background-image:url('${LETTERHEAD}');background-size:794px 1123px;background-repeat:no-repeat">
    <div style="display:flex;justify-content:space-between"><b>DATE: ${q.createdAt || new Date().toLocaleDateString("en-GB")}</b><b>${q.quoteNo || q.id}</b></div>
    <div style="margin-top:14px"><b>To,</b><br>${q.contactName || q.partyName || ""}<br>${(q.address || "").replace(/,/g, ",<br>")}</div>
    <div style="margin-top:10px">Project Name : ${q.projectName || ""}</div>
    <div style="margin-top:12px"><b>Kind Attn. ${q.contactName || ""} ${q.contactNumber ? "(Mob.No. " + q.contactNumber + ")" : ""}</b></div>
    <div style="margin-top:6px"><b>Sub :-Quotation For Eurobond-ALUMINIUM COMPOSITE PANEL</b></div>
    <p>Sir,<br>In reference to the discussion held with you regarding the said subject, we are pleased to quote our most preferred rates & other terms and conditions for the same as follows.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <thead><tr style="background:#f0f0f0">
        <th style="border:1px solid #999;padding:7px">Sr.No</th><th style="border:1px solid #999;padding:7px">Description</th>
        <th style="border:1px solid #999;padding:7px">Color Code/Series</th><th style="border:1px solid #999;padding:7px">Rate/Sq.Mtr (INR)</th><th style="border:1px solid #999;padding:7px">Rate/Sq.Ft (INR)</th>
      </tr></thead><tbody>${rowsHtml}</tbody>
    </table>
    <h3 style="margin:6px 0">Terms & Conditions:-</h3>
    <div>Taxes : ${tc.taxes || ""}</div><div>Freight : ${tc.freight || ""}</div>
    <div>Delivery Time : ${tc.delivery || ""}</div><div>Payment : ${tc.payment || ""}</div>
    <div>Validity : ${tc.validity || ""}</div><div>Billing : ${tc.billing || "Billing will be in Sq. Mt."}</div>
    ${tc.remarks ? `<div>Remarks : ${tc.remarks}</div>` : ""}
    <p><b>Note : Unloading of the material will be in scope of Client.</b></p>
    <p>Anticipating healthy business relation with your esteemed organization.</p>
    <div style="margin-top:22px"><b>Thanks & Regards,</b><br><b>EURO PANEL PRODUCTS LIMITED</b><br>${q.createdBy || ""}<br>Brand Specification Manager<br>${q.createdByPhone ? "Mob : " + q.createdByPhone : ""}</div>
  </div>`;
}

/* Quotation as HTML string (for mail attachment) — letterhead format */
function quoteHtml(q) {
  const items = q.items || [{ grade: q.grade, colour: q.colour, rate: q.rate, ratePerSqm: q.ratePerSqm }];
  const tc = q.tc || {};
  const rowsHtml = items.map((it, i) => `<tr>
    <td style="text-align:center;border:1px solid #999;padding:8px">${i + 1}</td>
    <td style="text-align:left;border:1px solid #999;padding:8px">${it.grade || ""}${it.thickness ? `<br><span style="font-size:10px;color:#666">(${it.thickness})</span>` : ""}${it.fins ? " (Running Feet)" : ""}</td>
    <td style="text-align:center;border:1px solid #999;padding:8px">${it.colourCode ? it.colourCode + " · " : ""}${it.colour || ""}</td>
    <td style="text-align:right;border:1px solid #999;padding:8px">${!it.fins && it.ratePerSqm ? "INR - " + it.ratePerSqm : "—"}</td>
    <td style="text-align:right;border:1px solid #999;padding:8px">INR - ${it.rate}</td>
  </tr>`).join("");
  return `<html><head><meta charset="utf-8"><title>${q.quoteNo || q.id}</title></head>
  <body style="font-family:Arial;color:#1a1a1a;font-size:13px;max-width:800px;margin:auto;padding:20px">
    <div style="text-align:center;margin-bottom:16px"><img src="https://crm.eurobond.co.in/eurobond-logo.png" style="height:44px" alt="EUROBOND"/></div>
    <div style="display:flex;justify-content:space-between"><b>DATE: ${q.createdAt || new Date().toLocaleDateString("en-GB")}</b><b>${q.quoteNo || q.id}</b></div>
    <div style="margin-top:14px"><b>To,</b><br>${q.contactName || q.partyName || ""}<br>${(q.address || "").replace(/,/g, ",<br>")}</div>
    <div style="margin-top:10px">Project Name : ${q.projectName || ""}</div>
    <div style="margin-top:12px"><b>Kind Attn. ${q.contactName || ""} ${q.contactNumber ? "(Mob.No. " + q.contactNumber + ")" : ""}</b></div>
    <div style="margin-top:6px"><b>Sub :-Quotation For Eurobond-ALUMINIUM COMPOSITE PANEL</b></div>
    <p>Sir,<br>In reference to the discussion held with you regarding the said subject, we are pleased to quote our most preferred rates & other terms and conditions for the same as follows.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <thead><tr style="background:#f0f0f0">
        <th style="border:1px solid #999;padding:8px">Sr.No</th><th style="border:1px solid #999;padding:8px">Description</th>
        <th style="border:1px solid #999;padding:8px">Color Code/Series</th><th style="border:1px solid #999;padding:8px">Rate/Sq.Mtr (INR)</th><th style="border:1px solid #999;padding:8px">Rate/Sq.Ft (INR)</th>
      </tr></thead><tbody>${rowsHtml}</tbody>
    </table>
    <h3>Terms & Conditions:-</h3>
    <div>Taxes : ${tc.taxes || ""}</div><div>Freight : ${tc.freight || ""}</div>
    <div>Delivery Time : ${tc.delivery || ""}</div><div>Payment : ${tc.payment || ""}</div>
    <div>Validity : ${tc.validity || ""}</div><div>Billing : ${tc.billing || "Billing will be in Sq. Mt."}</div>
    ${tc.remarks ? `<div>Remarks : ${tc.remarks}</div>` : ""}
    <p><b>Note : Unloading of the material will be in scope of Client.</b></p>
    <p>Anticipating healthy business relation with your esteemed organization.</p>
    <div style="margin-top:24px"><b>Thanks & Regards,</b><br><b>EURO PANEL PRODUCTS LIMITED</b><br>${q.createdBy || ""}<br>Brand Specification Manager<br>${q.createdByPhone ? "Mob : " + q.createdByPhone : ""}</div>
  </body></html>`;
}

/* Company-format PDF (print window) — EP/08/160/26-27 numbering, letterhead style */
function downloadQuotePdf(q) {
  const items = q.items || [{ grade: q.grade, colour: q.colour, rate: q.rate, ratePerSqm: q.ratePerSqm }];
  const w = window.open("", "_blank");
  const rowsHtml = items.map((it, i) => `<tr>
    <td class="srno">${i + 1}</td>
    <td class="desc">${it.grade || ""}${it.thickness ? `<span class="thk">(${it.thickness})</span>` : ""}${it.fins ? " (Running Feet)" : ""}</td>
    <td class="colour">${it.colourCode ? it.colourCode + " · " : ""}${it.colour || ""}</td>
    <td class="rate">${!it.fins && it.ratePerSqm ? "INR - " + it.ratePerSqm : "—"}</td>
    <td class="rate">INR - ${it.rate}</td>
  </tr>`).join("");
  const tc = q.tc || {};
  w.document.write(`<html><head><title>${q.quoteNo || q.id}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body{font-family:Arial;color:#1a1a1a;font-size:12.5px;margin:0;padding:0}
    .page{position:relative;width:210mm;min-height:297mm;padding:42mm 18mm 34mm 18mm;}
    .page::before{content:"";position:absolute;inset:0;background-image:url('${LETTERHEAD}');background-size:210mm 297mm;background-repeat:no-repeat;z-index:-1;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .top{display:flex;justify-content:space-between;align-items:flex-start}
    .qno{font-weight:bold}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    td,th{border:1px solid #999;padding:8px 10px;vertical-align:middle}
    th{background:rgba(240,240,240,.85);text-align:center;font-size:12px}
    td.srno{text-align:center;width:8%}
    td.desc{text-align:left;width:38%}
    td.colour{text-align:center;width:22%}
    td.rate{text-align:right;width:16%}
    .thk{font-size:10px;color:#666;display:block;margin-top:2px}
    .tc div{margin:2px 0}
    .sign{margin-top:26px}
    h3{margin:6px 0}
    p{margin:8px 0}
  </style></head><body>
    <div class="page">
      <div class="top">
        <div><b>DATE: ${q.createdAt || new Date().toLocaleDateString("en-GB")}</b></div>
        <div class="qno">${q.quoteNo || q.id}</div>
      </div>
      <div style="margin-top:14px">
        <b>To,</b><br>${q.contactName || q.partyName || ""}<br>${(q.address || "").replace(/,/g, ",<br>")}
      </div>
      <div style="margin-top:10px">Project Name : ${q.projectName || ""}</div>
      <div style="margin-top:12px"><b>Kind Attn. ${q.contactName || ""} ${q.contactNumber ? "(Mob.No. " + q.contactNumber + ")" : ""}</b></div>
      <div style="margin-top:6px"><b>Sub :-Quotation For Eurobond-ALUMINIUM COMPOSITE PANEL</b></div>
      <p>Sir,<br>In reference to the discusssion held with you regarding the said subject, we are please to quote our most preferred rates & others terms and condition for the same as follows.</p>
      <table>
        <thead><tr><th>Sr.No</th><th>Description</th><th>Color Code/Series</th><th>Rate/Sq.Mtr (INR)</th><th>Rate/Sq.Ft (INR)</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <h3>Terms & Conditions:-</h3>
      <div class="tc">
        <div>Taxes &nbsp; : ${tc.taxes || ""}</div>
        <div>Freight &nbsp; : ${tc.freight || ""}</div>
        <div>Delivery Time &nbsp; : ${tc.delivery || ""}</div>
        <div>Payment &nbsp; : ${tc.payment || ""}</div>
        <div>Validity &nbsp; : ${tc.validity || ""}</div>
        <div>Billing &nbsp; : ${tc.billing || "Billing will be in Sq. Mt."}</div>
        ${tc.remarks ? `<div>Remarks &nbsp; : ${tc.remarks}</div>` : ""}
      </div>
      <p><b>Note : Unloading of the material will in scope of Client.</b></p>
      <p>Anticipating healthy business relation with your esteemed organization.</p>
      <div class="sign">
        <b>Thanks & Regards,</b><br>
        <b>EURO PANEL PRODUCTS LIMITED</b><br>
        ${q.createdBy || ""}<br>
        Brand Specification Manager<br>
        ${q.createdByPhone ? "Mob : " + q.createdByPhone : ""}
      </div>
    </div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

/* Admin direct quotation create — grade/colour cascade from products master */
/* Searchable dropdown — type to filter + select */
export function AdminSearchSelect({ value, onChange, options, placeholder, disabled, getLabel }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const label = getLabel ? getLabel(value) : value;
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter((o) => (getLabel ? getLabel(o) : o).toLowerCase().includes(ql)) : options;
  return (
    <div style={{ position: "relative", marginBottom: 8 }}>
      <div onClick={() => !disabled && setOpen((v) => !v)} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: disabled ? "#f0f0f4" : "#fff", cursor: disabled ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: label ? "#1c2340" : "#9aa2bd" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label || placeholder}</span>
        <span>▾</span>
      </div>
      {open && !disabled && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", borderRadius: 10, boxShadow: "0 12px 30px rgba(20,25,60,.25)", zIndex: 60, maxHeight: 240, overflowY: "auto" }}>
          <div style={{ padding: 8, position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #eef1f8" }}>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d7dcef", fontSize: 13 }} onClick={(e) => e.stopPropagation()} />
          </div>
          {filtered.length === 0 ? <div style={{ padding: 12, color: "#9aa2bd", fontSize: 12.5 }}>No match</div>
            : filtered.map((o, i) => (
              <div key={i} onClick={() => { onChange(o); setOpen(false); setQ(""); }} style={{ padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f4f6fc" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f6fc")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
                {getLabel ? getLabel(o) : o}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function AdminQuoteForm({ onClose, onSaved }) {
  const [f, setF] = useState({ partyName: "", projectName: "", address: "", contactName: "", contactNumber: "", clientEmail: "" });
  const [rows, setRows] = useState([{ grade: "", thickness: "", colour: "", colourCode: "", rate: "" }]);
  const [gradeNames, setGradeNames] = useState([]);
  const [colourMap, setColourMap] = useState({});
  const [tc, setTc] = useState({ taxes: "Exclusive 18% GST", freight: "Exclusive", delivery: "15-20 days", payment: "100% advance", validity: "3 days", billing: "Billing will be in Sq. Mt.", remarks: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.productNames && api.productNames().then((d) => setGradeNames(d.names || [])).catch(() => {}); }, []);
  const loadColours = async (name) => {
    if (!name || colourMap[name]) return;
    try { const d = await api.productsByName(name); setColourMap((m) => ({ ...m, [name]: d.rows || [] })); } catch {}
  };
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const financialYear = () => {
    const d = new Date(), y = d.getFullYear() % 100, m = d.getMonth();
    return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  };
  const nextNo = async () => {
    const mm = String(new Date().getMonth() + 1).padStart(2, "0");
    let running = 160;
    try {
      const d = await api.list("quotation", false);
      const nums = (d.records || []).map((r) => { const s = String(r.data?.baseNo || r.data?.quoteNo || ""); const m = s.match(/EP\/\d+\/(\d+)/); return m ? +m[1] : 0; });
      if (nums.length) running = Math.max(running, ...nums) + 1;
    } catch {}
    return `EP/${mm}/${running}/${financialYear()}`;
  };

  const save = async () => {
    if (!f.partyName) { alert("Firm Name required"); return; }
    setBusy(true);
    try {
      const quoteNo = await nextNo();
      const items = rows.filter((r) => r.rate).map((r) => (
        !r.fins
          ? { grade: r.grade, colour: r.colour, colourCode: r.colourCode, thickness: r.thickness, rate: Number(r.rate), ratePerSqm: +(Number(r.rate) * 10.764).toFixed(2) }
          : { grade: r.grade, colour: r.colour, colourCode: r.colourCode, thickness: r.thickness, rate: Number(r.rate), fins: true }
      ));
      await api.create("quotation", {
        ...f, items, tc, quoteNo, baseNo: quoteNo, editCount: 0,
        grade: items[0]?.grade, colour: items[0]?.colour, rate: items[0]?.rate, ratePerSqm: items[0]?.ratePerSqm,
        status: "Pending", createdBy: "Admin", createdAt: new Date().toLocaleDateString("en-GB"),
      });
      onSaved();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Add Quotation</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Firm Name *</label>
        <input value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Project Name</label>
        <input value={f.projectName} onChange={(e) => setF({ ...f, projectName: e.target.value })} style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Address</label>
        <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} style={inp} />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700 }}>Attn</label><input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 700 }}>Mobile</label><input value={f.contactNumber} onChange={(e) => setF({ ...f, contactNumber: e.target.value.replace(/\D/g, "") })} style={inp} /></div>
        </div>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Mail ID</label>
        <input type="email" value={f.clientEmail} onChange={(e) => setF({ ...f, clientEmail: e.target.value })} style={inp} />

        <div style={{ fontWeight: 800, fontSize: 13, margin: "10px 0 8px" }}>Items</div>
        {rows.map((r, i) => {
          const colours = colourMap[r.grade] || [];
          const isFins = r.fins;
          return (
            <div key={i} style={{ background: "#f7f9ff", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>{isFins ? "Running Feet Rate" : `Item ${rows.slice(0, i + 1).filter((x) => !x.fins).length}`}</span>
                {rows.length > 1 && <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#c03636", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>Remove</button>}
              </div>
              {!isFins && (
                <>
                  <AdminSearchSelect value={r.grade} placeholder="— Search & select grade —" options={gradeNames}
                    onChange={(g) => { setRow(i, "grade", g); setRow(i, "colour", ""); setRow(i, "colourCode", ""); setRow(i, "thickness", ""); loadColours(g); }} />
                  <AdminSearchSelect value={r.colourCode ? { code: r.colourCode, colour: r.colour } : null}
                    placeholder={r.grade ? "— Search & select colour —" : "Select grade first"} disabled={!r.grade}
                    options={colours} getLabel={(c) => c ? `${c.code} · ${c.colour}` : ""}
                    onChange={(c) => { setRow(i, "colourCode", c.code); setRow(i, "colour", c.colour); setRow(i, "thickness", c.thickness || ""); }} />
                  {r.thickness && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>Thickness: {r.thickness}</div>}
                </>
              )}
              <input inputMode="decimal" value={r.rate} onChange={(e) => setRow(i, "rate", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Rate (per sq ft ₹)" style={{ ...inp, marginBottom: 0 }} />
              {!isFins && r.rate && <div style={{ fontSize: 11, color: "#1f7a44", marginTop: 5, fontWeight: 700 }}>= ₹{(Number(r.rate) * 10.764).toFixed(2)} / sq.mtr</div>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setRows((rs) => [...rs, { grade: "", thickness: "", colour: "", colourCode: "", rate: "" }])} style={{ flex: 1, padding: 8, borderRadius: 9, border: "1.5px dashed var(--navy)", background: "#fff", color: "var(--navy)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>➕ Add Grade Item</button>
          <button onClick={() => setRows((rs) => [...rs, { grade: "", thickness: "", colour: "", colourCode: "", rate: "", fins: true }])} style={{ flex: 1, padding: 8, borderRadius: 9, border: "1.5px dashed #8b7cc8", background: "#fff", color: "#6c5ce7", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>➕ Running Feet</button>
        </div>

        <div style={{ fontWeight: 800, fontSize: 13, margin: "6px 0 8px" }}>Terms & Conditions</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={{ fontSize: 11 }}>Taxes</label><input value={tc.taxes} onChange={(e) => setTc({ ...tc, taxes: e.target.value })} style={inp} /></div>
          <div><label style={{ fontSize: 11 }}>Freight</label><input value={tc.freight} onChange={(e) => setTc({ ...tc, freight: e.target.value })} style={inp} /></div>
          <div><label style={{ fontSize: 11 }}>Delivery</label><input value={tc.delivery} onChange={(e) => setTc({ ...tc, delivery: e.target.value })} style={inp} /></div>
          <div><label style={{ fontSize: 11 }}>Payment</label><input value={tc.payment} onChange={(e) => setTc({ ...tc, payment: e.target.value })} style={inp} /></div>
          <div><label style={{ fontSize: 11 }}>Validity</label><input value={tc.validity} onChange={(e) => setTc({ ...tc, validity: e.target.value })} style={inp} /></div>
        </div>
        <label style={{ fontSize: 11 }}>Remarks</label>
        <input value={tc.remarks} onChange={(e) => setTc({ ...tc, remarks: e.target.value })} style={inp} />

        <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={busy || !f.partyName} onClick={save}>{busy ? "Saving…" : "Save Quotation"}</button>
      </div>
    </div>
  );
}
