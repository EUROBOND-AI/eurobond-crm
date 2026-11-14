/* History import buttons — old Tours (#9) and Enquiry Dashboard numbers (#10).
   Both are admin-only, one-time backfills of data that pre-dates the app. Only
   the bare numbers are imported, nothing else:
     Tours    — who (employee code), the date, the type, and the area(s).
     Enquiry  — who (employee code), the month, and how many enquiries.
   A "Format" button downloads a ready CSV (with every employee's code listed at
   the foot) so the sheet is filled against real codes; "Import" reads it back. */
import { useRef, useState } from "react";
import { api } from "../lib/api.js";

/* ---- a small CSV reader that respects quotes (an Areas cell may hold commas) */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const push = () => { row.push(cell); cell = ""; };
  const endRow = () => { push(); if (row.some((c) => String(c).trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") push();
    else if (c === "\n") endRow();
    else if (c === "\r") { /* ignore */ }
    else cell += c;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}
const dl = (name, text) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name; a.click();
};
const codeList = (users) => (users || [])
  .filter((u) => String(u.code || "").trim())
  .map((u) => `${u.code},${u.name}`).join("\n");
const findByCode = (users, code) => (users || []).find((u) => String(u.code || "").trim().toLowerCase() === String(code || "").trim().toLowerCase());

const BTN = { padding: "8px 14px", fontWeight: 600 };

/* ============================ #9  Tours ================================= */
export function TourImport({ users, onDone }) {
  const file = useRef(null);
  const [busy, setBusy] = useState(false);

  const format = () => {
    const tpl =
      "Employee Code,Date,Visit Type,Areas,KM\n" +
      "EB001,2025-04-03,Ex Station,\"Kukatpally, Miyapur\",42\n" +
      "EB001,2025-04-05,Out Station,Vijayawada,180\n" +
      "\n\n# Fill the rows above. Date: YYYY-MM-DD. Visit Type: Ex Station / Out Station / Local.\n" +
      "# For more than one area put them in one cell inside quotes, comma separated. KM is optional.\n" +
      "# Delete these notes and the employee list below before importing (they are ignored anyway).\n\n" +
      "Employee Code,Name\n" + codeList(users);
    dl("old-tours-format.csv", tpl);
  };

  const onFile = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert("Empty file"); return; }
      const head = rows[0].map((h) => String(h).trim().toLowerCase());
      const ci = (names) => head.findIndex((h) => names.includes(h));
      const iCode = ci(["employee code", "code", "emp code"]);
      const iDate = ci(["date", "work date", "tour date"]);
      const iType = ci(["visit type", "type"]);
      const iArea = ci(["areas", "area", "visit name"]);
      const iKm = ci(["km", "distance", "kms"]);
      if (iCode < 0 || iDate < 0 || iArea < 0) { alert("Header must have: Employee Code, Date, Areas (Visit Type optional)"); return; }
      const out = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const code = String(row[iCode] || "").trim();
        if (!code || code.startsWith("#") || code.toLowerCase() === "employee code") continue;
        out.push({
          code, date: String(row[iDate] || "").trim(),
          type: iType >= 0 ? String(row[iType] || "").trim() : "",
          areas: String(row[iArea] || "").trim(),
          km: iKm >= 0 ? String(row[iKm] || "").trim() : "",
        });
      }
      if (!out.length) { alert("No data rows found"); return; }
      const res = await api.attImportTours(out);
      let msg = `Imported ${res.inserted} tours. Skipped ${res.skipped} (already there).`;
      if (res.errors && res.errors.length) msg += `\n\nProblems:\n` + res.errors.slice(0, 15).join("\n");
      alert(msg);
      onDone && onDone();
    } catch (e) { alert("Import failed: " + e.message); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  return (
    <>
      <button className="btn" style={BTN} onClick={format}>Tours Format</button>
      <button className="btn" style={BTN} disabled={busy} onClick={() => file.current && file.current.click()}>
        {busy ? "Importing…" : "Import Tours"}
      </button>
      <input ref={file} type="file" accept=".csv" hidden onChange={(e) => onFile(e.target.files[0])} />
    </>
  );
}

/* ====================== #10  Enquiry numbers =========================== */
export function EnqNumbersImport({ users, onDone }) {
  const file = useRef(null);
  const [busy, setBusy] = useState(false);

  const format = () => {
    const tpl =
      "Employee Code,Month,Enquiries,Sales\n" +
      "EB001,2025-04,12,450000\n" +
      "EB001,2025-05,9,300000\n" +
      "\n\n# One row per person per month. Month: YYYY-MM (2025-04 = April 2025).\n" +
      "# Enquiries = how many enquiries that person got that month. Sales = sale value (rupees) that month.\n" +
      "# Only the numbers — no other details. Leave Sales blank/0 if you only want enquiry counts.\n" +
      "# Re-importing the same person + month replaces the old numbers (no doubling).\n" +
      "# Delete these notes and the employee list below before importing.\n\n" +
      "Employee Code,Name\n" + codeList(users);
    dl("enquiry-numbers-format.csv", tpl);
  };

  const normMonth = (m) => {
    const s = String(m || "").trim().replace(/\//g, "-");
    let mm = s.match(/^(\d{4})-(\d{1,2})/); if (mm) return `${mm[1]}-${String(+mm[2]).padStart(2, "0")}`;
    mm = s.match(/^(\d{1,2})-(\d{4})$/);    if (mm) return `${mm[2]}-${String(+mm[1]).padStart(2, "0")}`;
    return "";
  };
  const userByCode = (code) => (users || []).find((u) => String(u.code || "").trim().toLowerCase() === code.toLowerCase());

  const onFile = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert("Empty file"); return; }
      const head = rows[0].map((h) => String(h).trim().toLowerCase());
      const ci = (names) => head.findIndex((h) => names.includes(h));
      const iCode = ci(["employee code", "code", "emp code"]);
      const iMonth = ci(["month", "period"]);
      const iCount = ci(["enquiries", "count", "number", "numbers", "qty"]);
      const iSales = ci(["sales", "sale", "sales value", "value", "amount"]);
      if (iCode < 0 || iMonth < 0 || iCount < 0) { alert("Header must have: Employee Code, Month, Enquiries (Sales optional)"); return; }

      /* existing rows, so a re-import replaces instead of adding */
      const existing = await api.list("enqHist", false).catch(() => ({ records: [] }));
      const byKey = new Map();
      (existing.records || []).forEach((r) => {
        const d = r.data || {};
        byKey.set(`${String(d.code || "").toLowerCase()}|${d.month}`, r.id);
      });

      const numOf = (v) => { const n = parseInt(String(v || "").replace(/[^\d-]/g, ""), 10); return isNaN(n) ? 0 : n; };
      let done = 0, skipped = 0; const errors = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const code = String(row[iCode] || "").trim();
        if (!code || code.startsWith("#") || code.toLowerCase() === "employee code") continue;
        const u = userByCode(code);
        if (!u) { errors.push(`Row ${r + 1}: no employee with code '${code}'`); continue; }
        const month = normMonth(row[iMonth]);
        if (!month) { errors.push(`Row ${r + 1}: bad month '${row[iMonth]}'`); continue; }
        const count = numOf(row[iCount]);
        const sales = iSales >= 0 ? numOf(row[iSales]) : 0;
        if (count <= 0 && sales <= 0) { skipped++; continue; }
        const data = { code, name: u.name, month, count, sales };
        const key = `${code.toLowerCase()}|${month}`;
        try {
          if (byKey.has(key)) await api.update("enqHist", byKey.get(key), data);
          else await api.create("enqHist", data);
          done++;
        } catch (e) { errors.push(`Row ${r + 1}: ${e.message}`); }
      }
      let msg = `Saved ${done} month totals.` + (skipped ? ` Skipped ${skipped} blank/zero.` : "");
      if (errors.length) msg += `\n\nProblems:\n` + errors.slice(0, 15).join("\n");
      alert(msg);
      onDone && onDone();
    } catch (e) { alert("Import failed: " + e.message); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  return (
    <>
      <button className="dx-btn" style={BTN} onClick={format}>Numbers Format</button>
      <button className="dx-btn" style={BTN} disabled={busy} onClick={() => file.current && file.current.click()}>
        {busy ? "Importing…" : "Import Numbers"}
      </button>
      <input ref={file} type="file" accept=".csv" hidden onChange={(e) => onFile(e.target.files[0])} />
    </>
  );
}

/* ====================== #3  Specs-Hub records ========================== */
export function SpecsHubImport({ users, onDone }) {
  const file = useRef(null);
  const [busy, setBusy] = useState(false);

  const format = () => {
    const tpl =
      "Approval Date,Project / Brand,Project Location,Colour Code,Grade,Approved By Type,Firm Name,Contact Person,Contact Number,Mail ID,Approved Qty,Specs Person Code,Sales Persons Codes,Category,Tier,Status,Remark\n" +
      "2026-04-12,Green Residency,Hyderabad,RAL9016,ACP 4mm,Architect,ABC Associates,Ramesh,9876543210,ramesh@abc.com,6565,EB001,\"EB002; EB003\",Project,Standard,Submitted,Sample row\n" +
      "\n\n# Approval Date: YYYY-MM-DD. Approved Qty: number only (Sq.Mtr). Status: Draft / Submitted / Win / Loss.\n" +
      "# Specs Person Code = ONE employee code. Sales Persons Codes = one or more codes in one cell, separated by ; (keep the cell in quotes).\n" +
      "# Codes are matched to employees — see the list below. Delete these notes and the list before importing.\n\n" +
      "Employee Code,Name\n" + codeList(users);
    dl("specs-hub-format.csv", tpl);
  };

  const normDate = (d) => {
    const s = String(d || "").trim().replace(/\//g, "-");
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) { const p = s.split("-"); return `${p[0]}-${String(+p[1]).padStart(2, "0")}-${String(+p[2]).padStart(2, "0")}`; }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) { const p = s.split("-"); return `${p[2]}-${String(+p[1]).padStart(2, "0")}-${String(+p[0]).padStart(2, "0")}`; }
    return s;
  };

  const onFile = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      const rows = parseCsv(await f.text());
      if (!rows.length) { alert("Empty file"); return; }
      const head = rows[0].map((h) => String(h).trim().toLowerCase());
      const ci = (names) => head.findIndex((h) => names.includes(h));
      const col = {
        date: ci(["approval date", "date"]),
        project: ci(["project / brand", "project", "project/brand", "brand"]),
        location: ci(["project location", "location"]),
        colour: ci(["colour code", "color code", "colour", "color"]),
        grade: ci(["grade"]),
        apType: ci(["approved by type", "approved by", "approvedby"]),
        firm: ci(["firm name", "firm"]),
        cperson: ci(["contact person"]),
        cnum: ci(["contact number", "contact no", "mobile"]),
        mail: ci(["mail id", "email", "mail"]),
        qty: ci(["approved qty", "qty", "quantity", "sq.mtr", "sqmtr"]),
        spec: ci(["specs person code", "spec person code", "specs person", "spec person"]),
        sales: ci(["sales persons codes", "sales person codes", "sales persons", "sales person"]),
        category: ci(["category"]),
        tier: ci(["tier"]),
        status: ci(["status"]),
        remark: ci(["remark", "remarks"]),
      };
      if (col.project < 0) { alert("Header must have at least: Project / Brand"); return; }

      /* existing specs — skip a row that is already there (same project+date+colour) */
      const existing = await api.list("specsHub", false).catch(() => ({ records: [] }));
      const seen = new Set((existing.records || []).map((r) => {
        const d = r.data || {};
        return `${String(d.projectName || "").toLowerCase()}|${d.approvalDate || ""}|${String(d.colourCode || "").toLowerCase()}`;
      }));

      const val = (row, k) => (col[k] >= 0 ? String(row[col[k]] || "").trim() : "");
      let done = 0, skipped = 0; const errors = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const project = val(row, "project");
        if (!project || project.startsWith("#") || project.toLowerCase() === "project / brand" || project.toLowerCase() === "employee code") continue;

        const specCode = val(row, "spec");
        const specU = specCode ? findByCode(users, specCode) : null;
        if (specCode && !specU) errors.push(`Row ${r + 1}: no employee with Specs code '${specCode}'`);
        const salesNames = []; const badSales = [];
        val(row, "sales").split(/[;,]/).map((c) => c.trim()).filter(Boolean).forEach((c) => {
          const u = findByCode(users, c); if (u) salesNames.push(u.name); else badSales.push(c);
        });
        if (badSales.length) errors.push(`Row ${r + 1}: unknown Sales code(s) ${badSales.join(", ")}`);

        const date = normDate(val(row, "date"));
        const key = `${project.toLowerCase()}|${date}|${val(row, "colour").toLowerCase()}`;
        if (seen.has(key)) { skipped++; continue; }

        const data = {
          approvalDate: date, projectName: project, location: val(row, "location"),
          colourCode: val(row, "colour"), grade: val(row, "grade"),
          approvedByType: val(row, "apType"), firmName: val(row, "firm"),
          contactPerson: val(row, "cperson"), contactNumber: val(row, "cnum"), mailId: val(row, "mail"),
          approvedQty: parseFloat(String(val(row, "qty")).replace(/[^\d.]/g, "")) || "",
          specPerson: specU ? specU.name : "",
          salesPersons: salesNames, salesPerson: salesNames[0] || "",
          category: val(row, "category"), tier: val(row, "tier"),
          status: val(row, "status") || "Submitted", remark: val(row, "remark"),
          createdByName: specU ? specU.name : "", imported: true,
        };
        try { await api.create("specsHub", data); seen.add(key); done++; }
        catch (e) { errors.push(`Row ${r + 1}: ${e.message}`); }
      }
      let msg = `Imported ${done} specifications.` + (skipped ? ` Skipped ${skipped} (already there).` : "");
      if (errors.length) msg += `\n\nProblems:\n` + errors.slice(0, 15).join("\n");
      alert(msg);
      onDone && onDone();
    } catch (e) { alert("Import failed: " + e.message); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  return (
    <>
      <button className="btn" style={BTN} onClick={format}>Format</button>
      <button className="btn" style={BTN} disabled={busy} onClick={() => file.current && file.current.click()}>
        {busy ? "Importing…" : "Import"}
      </button>
      <input ref={file} type="file" accept=".csv" hidden onChange={(e) => onFile(e.target.files[0])} />
    </>
  );
}
