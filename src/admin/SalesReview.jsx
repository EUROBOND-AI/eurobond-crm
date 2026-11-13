/* Sales Review (Power BI) — a native CRM dashboard (same chrome as every other
   dashboard: DxPage, dx-filters with Zone/State/HOD/Person, ShowGate, KpiCards,
   Panels with graphs + tables). Data = the combined Pan-India sales Excel (full
   49-column format, read by column name), uploaded here and stored compact on
   the server (powerbi.php). Each upload replaces the whole dataset. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, FileDown, Maximize2, X, Trash2 } from "lucide-react";
import { api, auth, API_BASE } from "../lib/api.js";
import { isPanelAdmin } from "../lib/scope.js";
import { DxPage, KpiCard, Panel, ShowGate, RankBars, WeekBars, HalfDonut } from "../components/dash.jsx";

const MO = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const QS = ["Q1", "Q2", "Q3", "Q4"];
const IX = { Y: 0, Q: 1, M: 2, B: 3, C: 4, P: 5, R: 6, E: 7, PA: 8, CO: 9, GR: 10, S: 11, SQ: 12, TG: 13, EX: 14, ST: 15, HD: 16, EC: 17 };

/* the full format the ERP exports — used only for the blank Download Format */
const FULL_COLS = ["Year", "QTR", "MTH", "Month", "Date", "Voucher Type", "Voucher No", "Party Name", "Item Description", "Item Group", "Item Group Description", "Code", "Grade", "#", "Category", "Brand", "QTY", "Sq.Mtr", "CO", "SALES G", "HOD", "Area", "STATE", "Region", "Sales person", "Employee Code", "Target D", "Sales D", "Expenses", "Company", "Category CAT", "Target CAT", "Sales CAT", "# Brand", "# Category", "# Year", "Employee Status", "DOJ", "DOR", "SL -2025-26 SALES G", "SL -2026-27 SALES G", "Expenses-I", "Inc", "# Category Cat", "SL -2025-26 SALES G (Nw)", "SL -2026-27 SALES G (Nw)"];
const EXPORT_COLS = ["Year", "QTR", "Month", "Brand", "Category", "Sales person", "Employee Code", "Region", "Employee Status", "Party Name", "Code", "Grade", "SALES G", "Sq.Mtr", "Target D", "Expenses"];

const cr = (n) => { n = Number(n) || 0; return (n / 1e7).toFixed(2) + " Cr"; };
const pcN = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const pcStr = (a, b) => (b ? (a / b * 100).toFixed(1) + "%" : "—");
const pcColor = (p) => (p >= 100 ? "#10b981" : p >= 75 ? "#f59e0b" : "#ef4444");
const sm = (arr, i) => arr.reduce((s, r) => s + (r[i] || 0), 0);

function blankDB() { return { sp: [], r: [], b: [], c: [], pa: [], co: [], gr: [], st: [], hd: [], ec: [], sg: [], yrs: [] }; }

function buildFromAOA(aoa) {
  const head = (aoa[0] || []).map((h) => String(h == null ? "" : h).trim());
  const col = {}; head.forEach((h, i) => { if (!(h in col)) col[h] = i; });
  const need = ["Year", "Month", "Brand", "Category", "Sales person", "Region", "SALES G"];
  const miss = need.filter((k) => !(k in col));
  if (miss.length) throw new Error("Missing columns: " + miss.join(", "));
  const Q = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };
  const d = blankDB();
  const num = (v) => { if (v == null || v === "") return 0; const n = +String(v).replace(/[^0-9.\-]/g, ""); return isNaN(n) ? 0 : n; };
  const maps = { b: new Map(), c: new Map(), sp: new Map(), r: new Map(), pa: new Map(), co: new Map(), gr: new Map(), st: new Map(), hd: new Map(), ec: new Map() };
  const idx = (key, v) => { v = (v == null ? "" : String(v)).trim(); if (v === "") return -1; const k = v.toLowerCase(); let i = maps[key].get(k); if (i == null) { d[key].push(v); i = d[key].length - 1; maps[key].set(k, i); } return i; };
  const g = (row, k) => (col[k] == null ? "" : row[col[k]]);
  const yseen = [];
  for (let ri = 1; ri < aoa.length; ri++) {
    const row = aoa[ri]; if (!row || row.length === 0) continue;
    const ys = String(g(row, "Year") || "").trim(); if (!ys) continue;
    let yi = yseen.indexOf(ys); if (yi < 0) { yseen.push(ys); yi = yseen.length - 1; }
    let q = Q[String(g(row, "QTR") || "").trim()]; if (q == null) q = -1;
    d.sg.push([yi, q, MO.indexOf(String(g(row, "Month") || "").trim()),
      idx("b", g(row, "Brand")), idx("c", g(row, "Category")), idx("sp", g(row, "Sales person")),
      idx("r", g(row, "Region")), (String(g(row, "Employee Status") || "").trim().toLowerCase() === "resigned" ? 1 : 0),
      idx("pa", g(row, "Party Name")), idx("co", g(row, "Code")), idx("gr", g(row, "Grade")),
      num(g(row, "SALES G")), num(g(row, "Sq.Mtr")), num(g(row, "Target D")), num(g(row, "Expenses")),
      idx("st", g(row, "STATE")), idx("hd", g(row, "HOD")), idx("ec", g(row, "Employee Code"))]);
  }
  const sorted = [...yseen].sort();
  const remap = yseen.map((y) => sorted.indexOf(y));
  d.sg.forEach((r) => { r[0] = remap[r[0]]; });
  d.yrs = sorted;
  return d;
}

/* upload with a real progress % (fetch has no upload progress, XHR does) */
function uploadWithProgress(obj, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_BASE + "/powerbi.php");
    if (auth.token) xhr.setRequestHeader("Authorization", "Bearer " + auth.token);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300 && !j.error) resolve(j); else reject(new Error(j.error || ("HTTP " + xhr.status))); } catch (err) { reject(new Error("Server did not return JSON")); } };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(JSON.stringify(obj));
  });
}

function Sel({ label, value, set, opts, allLabel }) {
  return (
    <div><label>{label}</label>
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">{allLabel}</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.lbl}</option>)}
      </select>
    </div>
  );
}

/* a plain table. It does NOT scroll itself — its ZPanel gives every panel a
   fixed-height body that is the single scroller, so the header (sticky) freezes
   against that box and every panel ends up exactly the same size.
   #2 — every column header is clickable to sort the rows: first click low→high,
   second high→low, third back to the original order. Numeric columns sort by the
   raw value carried on the cell ({v, n}); the name column sorts alphabetically.
   The Total foot is never moved. */
const cellNum = (c) => {
  if (c && typeof c === "object" && c.n !== undefined) return c.n;
  const raw = c && c.v !== undefined ? c.v : c;
  const n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
};
const cellText = (c) => String(c && c.v !== undefined ? c.v : (c == null ? "" : c));
function T({ head, rows, foot }) {
  const [sort, setSort] = useState(null);   // { col, dir: 'asc'|'desc' }
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { col, dir } = sort;
    const numeric = rows.every((r) => cellNum(r[col]) !== null);
    const cp = [...rows];
    cp.sort((a, b) => {
      if (numeric) { const x = cellNum(a[col]) || 0, y = cellNum(b[col]) || 0; return dir === "asc" ? x - y : y - x; }
      const x = cellText(a[col]).toLowerCase(), y = cellText(b[col]).toLowerCase();
      return dir === "asc" ? x.localeCompare(y) : y.localeCompare(x);
    });
    return cp;
  }, [rows, sort]);
  const click = (i) => setSort((p) => (p && p.col === i ? (p.dir === "asc" ? { col: i, dir: "desc" } : null) : { col: i, dir: "asc" }));
  const arrow = (i) => (sort && sort.col === i ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, whiteSpace: "nowrap" }}>
        <thead><tr>{head.map((h, i) => <th key={i} onClick={() => click(i)} title="Click to sort" style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--navy)", color: "#fff", fontWeight: 700, padding: "7px 10px", textAlign: i === 0 ? "left" : "right", cursor: "pointer", userSelect: "none" }}>{h}{arrow(i)}</th>)}</tr></thead>
        <tbody>
          {sorted.map((r, ri) => <tr key={ri} style={{ borderBottom: "1px solid var(--line)" }}>{r.map((c, ci) => <td key={ci} style={{ padding: "6px 10px", textAlign: ci === 0 ? "left" : "right", fontWeight: ci === 0 ? 700 : 500, color: c && c.c ? c.c : "var(--ink)" }}>{c && c.v !== undefined ? c.v : c}</td>)}</tr>)}
          {foot && <tr style={{ background: "var(--accent-soft)", fontWeight: 800 }}>{foot.map((c, ci) => <td key={ci} style={{ padding: "7px 10px", textAlign: ci === 0 ? "left" : "right" }}>{c && c.v !== undefined ? c.v : c}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

/* a checkbox dropdown for choosing several grades at once (empty = all). */
function MultiSel({ label, opts, sel, setSel }) {
  const [open, setOpen] = useState(false);
  const n = sel.size;
  const toggle = (v) => { const s = new Set(sel); s.has(v) ? s.delete(v) : s.add(v); setSel(s); };
  return (
    <div style={{ position: "relative" }}>
      <label>{label}</label>
      <button type="button" className="dx-btn" onClick={() => setOpen((o) => !o)} style={{ minWidth: 140, textAlign: "left", fontWeight: 600 }}>
        {n === 0 ? "All grades" : n + " selected"} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 51, marginTop: 4, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 12px 34px rgba(0,0,0,.18)", width: 230, maxHeight: 320, overflow: "auto", padding: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px" }}>
              <button type="button" className="dx-btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setSel(new Set(opts.map((o) => o.v)))}>Select all</button>
              <button type="button" className="dx-btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setSel(new Set())}>Clear</button>
            </div>
            {opts.map((o) => (
              <label key={o.v} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer", fontSize: 12.5 }}>
                <input type="checkbox" checked={sel.has(o.v)} onChange={() => toggle(o.v)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.lbl}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* Panel + a corner "full screen" button. Every panel's body is the SAME fixed
   height (PANEL_BODY) and is the single scroll area, so all boxes on a row line
   up to one size whatever the data; the modal shows the full content. */
const PANEL_BODY = 460;
function ZPanel({ title, sub, children }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <Panel title={title} sub={sub} action={
        <button className="dx-btn" style={{ padding: "4px 8px" }} title="Full screen" onClick={() => setZoom(true)}><Maximize2 size={14} /></button>
      }>
        <div style={{ height: PANEL_BODY, overflow: "auto", borderRadius: 10 }}>{children}</div>
      </Panel>
      {zoom && (
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,45,.55)", zIndex: 99999, display: "grid", placeItems: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "min(1100px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <div><div style={{ fontWeight: 800, fontSize: 17, color: "var(--navy)" }}>{title}</div>{sub && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{sub}</div>}</div>
              <button className="dx-btn" onClick={() => setZoom(false)}><X size={15} /> Close</button>
            </div>
            {/* this body is the single scroller — padding-top is 0 so the table
                header sits flush at the top and nothing shows above it when
                scrolling (the gap the header seemed to leave) */}
            <div style={{ overflow: "auto", padding: "0 20px 20px", flex: 1 }}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

export default function SalesReview() {
  const [db, setDb] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState(null);   // upload %  (null = not uploading)
  const fileRef = useRef(null);

  // filters — all built from the uploaded DATA itself (not the users table):
  // the previous set (Year/Brand/QTR/Month/Region) + State/HOD/Person
  const [fy, setFy] = useState(""), [fb, setFb] = useState(""), [fq, setFq] = useState(""), [fm, setFm] = useState("");
  const [fr, setFr] = useState(""), [fst, setFst] = useState(""), [fhd, setFhd] = useState(""), [fp, setFp] = useState("");
  const [fgr, setFgr] = useState(new Set());   // #2 — grade multi-select (empty = all)
  const resetF = () => { setFy(""); setFb(""); setFq(""); setFm(""); setFr(""); setFst(""); setFhd(""); setFp(""); setFgr(new Set()); };

  /* Power BI is open to every login. Admin/owner see the whole company; an
     individual (field) login sees ONLY their own sales rows. We match on the
     Employee Code first (the CRM name and the sales-sheet name are sometimes
     spelled differently, the code is not), and fall back to the name only when
     the user has no code or it is not in the data. */
  const admin = isPanelAdmin();
  const myScope = useMemo(() => {
    if (admin || !db) return { ec: -1, sp: -1 };
    const code = String(auth.user?.code || auth.user?.empCode || auth.user?.employeeCode || "").trim().toLowerCase();
    const name = String(auth.user?.name || "").trim().toLowerCase();
    const ec = code ? (db.ec || []).findIndex((c) => String(c).trim().toLowerCase() === code) : -1;
    const sp = name ? (db.sp || []).findIndex((n) => String(n).trim().toLowerCase() === name) : -1;
    return { ec, sp };
  }, [admin, db]);

  const load = () => {
    setShown(true); setBusy(true);
    api.pbLoad()
      .then((j) => setDb(j && Array.isArray(j.sg) ? Object.assign(blankDB(), j) : blankDB()))
      .catch(() => setDb(blankDB()))
      .finally(() => setBusy(false));
  };

  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setMsg("Reading " + f.name + " …"); setProg(0);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      setMsg("Parsing " + (aoa.length - 1).toLocaleString() + " rows …");
      const nd = buildFromAOA(aoa);
      setMsg("Uploading " + nd.sg.length.toLocaleString() + " rows …");
      const r = await uploadWithProgress(nd, setProg);
      setDb(nd); setShown(true);
      setMsg("Saved " + Number(r.rows).toLocaleString() + " rows ✓");
      resetF();
    } catch (err) { setMsg("Error: " + err.message); alert("Import failed: " + err.message); }
    setProg(null);
    e.target.value = "";
  };

  const onExport = () => {
    if (!db || !db.sg.length) { alert("No data to export — Import an Excel first."); return; }
    const out = [EXPORT_COLS];
    db.sg.forEach((r) => out.push([(db.yrs[r[0]]) || "", (r[1] >= 0 ? QS[r[1]] : ""), MO[r[2]] || "", db.b[r[3]] || "", db.c[r[4]] || "", db.sp[r[5]] || "", (db.ec && db.ec[r[IX.EC]]) || "", db.r[r[6]] || "", (r[7] === 1 ? "Resigned" : "Active"), db.pa[r[8]] || "", db.co[r[9]] || "", db.gr[r[10]] || "", r[11], r[12], r[13], r[14]]));
    const ws = XLSX.utils.aoa_to_sheet(out);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales"); XLSX.writeFile(wb, "sales-review-export.xlsx");
  };
  const onFormat = () => {
    const ws = XLSX.utils.aoa_to_sheet([FULL_COLS]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales"); XLSX.writeFile(wb, "sales-review-format.xlsx");
  };
  const onDelete = async () => {
    if (!db || !db.sg.length) { alert("No data to delete."); return; }
    if (!window.confirm("Delete all uploaded Sales Review data? This cannot be undone.")) return;
    try { await api.pbDelete(); setDb(blankDB()); resetF(); setMsg("All data deleted."); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  const rows = useMemo(() => {
    if (!db) return [];
    /* a non-admin only ever sees their own rows: by Employee Code when we could
       match it, otherwise by name. If neither matched they correctly see nothing. */
    const mine = (r) => admin || (myScope.ec >= 0 ? r[IX.EC] === myScope.ec : r[IX.P] === myScope.sp);
    return db.sg.filter((r) =>
      mine(r) &&
      (fy === "" || r[IX.Y] === +fy) && (fb === "" || r[IX.B] === +fb) &&
      (fq === "" || r[IX.Q] === +fq) && (fm === "" || r[IX.M] === +fm) &&
      (fr === "" || r[IX.R] === +fr) && (fst === "" || r[IX.ST] === +fst) &&
      (fhd === "" || r[IX.HD] === +fhd) && (fp === "" || r[IX.P] === +fp) &&
      (fgr.size === 0 || fgr.has(r[IX.GR])));
  }, [db, fy, fb, fq, fm, fr, fst, fhd, fp, fgr, admin, myScope]);

  /* alphabetically-sorted option lists, straight from the uploaded data */
  const optsOf = (arr) => (arr || []).map((v, i) => ({ v: i, lbl: v })).sort((a, b) => String(a.lbl).localeCompare(String(b.lbl)));

  const A = useMemo(() => {
    const yrs = (db && db.yrs) || [];
    const y0 = rows.filter((r) => r[0] === 0), y1 = rows.filter((r) => r[0] === 1);
    const s0 = sm(y0, IX.S), s1 = sm(y1, IX.S), tg0 = sm(y0, IX.TG), tg1 = sm(y1, IX.TG), ex0 = sm(y0, IX.EX), ex1 = sm(y1, IX.EX);
    const sAll = s0 + s1, tgAll = tg0 + tg1;
    return { yrs, y0, y1, s0, s1, tg0, tg1, ex0, ex1, sAll, tgAll, gw: s0 ? ((s1 - s0) / s0 * 100) : 0, shortfall: Math.max(0, tgAll - sAll) };
  }, [rows, db]);

  const YA = (A.yrs[0]) || "FY1", YB = (A.yrs[1]) || "FY2";

  /* 6-col dimension table (Brand/Category): sorted high→low, with a Total foot */
  const dimTable = (arr, idxKey) => {
    const raw = [];
    arr.forEach((name, i) => {
      const a = sm(A.y0.filter((r) => r[idxKey] === i), IX.S), b = sm(A.y1.filter((r) => r[idxKey] === i), IX.S);
      if (!a && !b) return; raw.push({ name, a, b });
    });
    raw.sort((x, y) => (y.a + y.b) - (x.a + x.b));
    const rows = raw.map((o) => [o.name, { v: cr(o.a), n: o.a }, { v: pcStr(o.a, A.s0), n: pcN(o.a, A.s0) }, { v: cr(o.b), n: o.b }, { v: pcStr(o.b, A.s1), n: pcN(o.b, A.s1) }, { v: cr(o.a + o.b), n: o.a + o.b, c: "#0b3c8c" }]);
    return { rows, foot: ["Total", cr(A.s0), "100%", cr(A.s1), "100%", cr(A.sAll)] };
  };
  /* compact 4-col version for the narrow Code/Grade/Party boxes */
  const dimTableS = (arr, idxKey) => {
    let ta = 0, tb = 0; const raw = [];
    arr.forEach((name, i) => {
      const a = sm(A.y0.filter((r) => r[idxKey] === i), IX.S), b = sm(A.y1.filter((r) => r[idxKey] === i), IX.S);
      if (!a && !b) return; ta += a; tb += b; raw.push({ name, a, b });
    });
    raw.sort((x, y) => (y.a + y.b) - (x.a + x.b));
    const rows = raw.map((o) => [o.name, { v: cr(o.a), n: o.a }, { v: cr(o.b), n: o.b }, { v: cr(o.a + o.b), n: o.a + o.b, c: "#0b3c8c" }]);
    return { rows, foot: ["Total", cr(ta), cr(tb), cr(ta + tb)] };
  };
  /* target/sales/ach%/growth table (Region/Sales Person): sorted high→low by
     sales, with a Total foot */
  const perfTable = (arr, idxKey) => {
    let tt = 0, ts = 0; const raw = [];
    arr.forEach((name, i) => {
      const a = sm(A.y0.filter((r) => r[idxKey] === i), IX.S), b = sm(A.y1.filter((r) => r[idxKey] === i), IX.S);
      const tg = sm(A.y0.filter((r) => r[idxKey] === i), IX.TG) + sm(A.y1.filter((r) => r[idxKey] === i), IX.TG);
      const s = a + b; if (!s && !tg) return; tt += tg; ts += s; raw.push({ name, a, b, s, tg });
    });
    raw.sort((x, y) => y.s - x.s);
    const rows = raw.map((o) => { const gw = o.a ? ((o.b - o.a) / o.a * 100) : null; return [o.name, { v: cr(o.tg), n: o.tg }, { v: cr(o.s), n: o.s }, { v: pcStr(o.s, o.tg), n: pcN(o.s, o.tg), c: pcColor(pcN(o.s, o.tg)) }, { v: gw == null ? "—" : gw.toFixed(1) + "%", n: gw == null ? -1e9 : gw, c: gw == null ? "var(--muted)" : (gw >= 0 ? "#10b981" : "#ef4444") }]; });
    return { rows, foot: ["Total", cr(tt), cr(ts), { v: pcStr(ts, tt), c: pcColor(pcN(ts, tt)) }, ""] };
  };
  const bars = (arr, idxKey, lim) => (db ? arr.map((name, i) => ({ label: name, value: sm(rows.filter((r) => r[idxKey] === i), IX.S) })).filter((x) => x.value).sort((a, b) => b.value - a.value).slice(0, lim || 99) : []);

  const monthBars = useMemo(() => MO.map((m, mi) => {
    const a = sm(A.y0.filter((r) => r[IX.M] === mi), IX.S), b = sm(A.y1.filter((r) => r[IX.M] === mi), IX.S);
    return { label: m, value: b || a, note: cr((a + b)), isToday: false };
  }), [A]);
  const qtrBars = useMemo(() => QS.map((q, qi) => {
    const r1 = A.y1.filter((r) => r[IX.Q] === qi); const s = sm(r1, IX.S), tg = sm(r1, IX.TG);
    return { label: q, value: s, note: pcStr(s, tg) };
  }), [A]);

  const hasData = db && db.sg.length > 0;

  return (
    <DxPage title="Power BI" sub="Pan-India sales — target, achievement and contribution"
      actions={<>
        {admin && <>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onFile} />
          <button className="dx-btn dx-btn-p" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={15} /> Import Excel</button>
          <button className="dx-btn" onClick={onFormat}><FileDown size={15} /> Download Format</button>
        </>}
        <button className="dx-btn" onClick={onExport}><Download size={15} /> Export</button>
        {admin && <button className="dx-btn" style={{ color: "#ef4444", borderColor: "#f3b4b0" }} onClick={onDelete}><Trash2 size={15} /> Delete</button>}
        {msg && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", fontWeight: 600 }}>{msg}</span>}
      </>}>

      <div className="dx-filters">
        {db && <Sel label="State" value={fst} set={setFst} allLabel="All states" opts={optsOf(db.st)} />}
        {db && <Sel label="HOD" value={fhd} set={setFhd} allLabel="All HODs" opts={optsOf(db.hd)} />}
        {db && <Sel label="Region" value={fr} set={setFr} allLabel="All regions" opts={optsOf(db.r)} />}
        {db && admin && <Sel label="Person" value={fp} set={setFp} allLabel="Everyone" opts={optsOf(db.sp)} />}
        {db && <Sel label="Year" value={fy} set={setFy} allLabel="All years" opts={db.yrs.map((y, i) => ({ v: i, lbl: y }))} />}
        {db && <Sel label="Brand" value={fb} set={setFb} allLabel="All brands" opts={optsOf(db.b)} />}
        <Sel label="QTR" value={fq} set={setFq} allLabel="All quarters" opts={QS.map((y, i) => ({ v: i, lbl: y }))} />
        <Sel label="Month" value={fm} set={setFm} allLabel="All months" opts={MO.map((y, i) => ({ v: i, lbl: y }))} />
        {db && db.gr && db.gr.length > 0 && <MultiSel label="Grade" opts={optsOf(db.gr)} sel={fgr} setSel={setFgr} />}
        {(fy || fb || fq || fm || fr || fst || fhd || fp || fgr.size) && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={resetF}>Reset</button>}
      </div>

      {!shown || (busy && !db) ? <ShowGate onShow={load} busy={busy} what="Sales Review" /> : !hasData ? (
        <Panel><div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>{admin ? <>No data yet — press <b>Import Excel</b> above to upload the combined Pan-India file.</> : "No sales data available for you yet."}</div></Panel>
      ) : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Target" value={cr(A.tgAll)} sub="combined target" />
            <KpiCard label="Sales" value={cr(A.sAll)} chip={pcStr(A.sAll, A.tgAll)} sub="of target" />
            <KpiCard label="Shortfall" value={cr(A.shortfall)} sub={A.shortfall ? "still to come" : "on target"} />
            <KpiCard label="GW %" value={A.gw.toFixed(1) + "%"} sub={YA + " → " + YB} />
          </div>

          {/* exact layout — 3 panels per row, six rows, in the order asked */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignItems: "start" }}>
            {/* Row 1 */}
            <ZPanel title="Achievement by Financial Year" sub="sales vs target">
              <WeekBars days={[{ label: YA, value: A.s0, note: pcStr(A.s0, A.tg0) }, { label: YB, value: A.s1, note: pcStr(A.s1, A.tg1), isToday: true }]} height={400} fmt={cr} />
            </ZPanel>
            <ZPanel title="Monthwise Sales" sub="Apr → Mar"><WeekBars days={monthBars} height={400} fmt={cr} /></ZPanel>
            <ZPanel title="Quarterwise Achievement" sub={YB + " — ach% on each bar"}><WeekBars days={qtrBars} height={400} fmt={cr} /></ZPanel>

            {/* Row 2 — the two contribution charts side by side */}
            <ZPanel title="Brandwise Contribution" sub="by sales value"><RankBars items={bars(db.b, IX.B)} fmt={cr} limit={8} /></ZPanel>
            <ZPanel title="Regionwise Contribution" sub="by sales value"><RankBars items={bars(db.r, IX.R)} fmt={cr} limit={10} /></ZPanel>
            <ZPanel title="Categorywise Contribution" sub="by sales value"><RankBars items={bars(db.c, IX.C)} fmt={cr} limit={8} /></ZPanel>

            {/* Row 3 */}
            <ZPanel title="Brandwise" sub={YA + " vs " + YB}>
              {(() => { const t = dimTable(db.b, IX.B); return <T head={["Brand", YA, "%", YB, "%", "Total"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>
            <ZPanel title="Regionwise" sub="target · sales · achievement · growth">
              {(() => { const t = perfTable(db.r, IX.R); return <T head={["Region", "Target", "Sales", "Ach%", "GW%"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>
            <ZPanel title="Expense %" sub={YA + " vs " + YB}>
              <HalfDonut segments={[{ label: YA, value: A.ex0 }, { label: YB, value: A.ex1 }]} center={pcStr(A.ex0 + A.ex1, A.sAll)} centerLabel="of sales" size={320} fmt={cr} />
            </ZPanel>

            {/* Row 4 */}
            <ZPanel title="Sales Personwise Contribution" sub="by sales value"><RankBars items={bars(db.sp, IX.P)} fmt={cr} limit={10} /></ZPanel>
            <ZPanel title="Monthwise" sub="Apr → Mar">
              <T head={["Month", YA, YB, "Total"]} rows={MO.map((m, mi) => { const a = sm(A.y0.filter((r) => r[IX.M] === mi), IX.S), b = sm(A.y1.filter((r) => r[IX.M] === mi), IX.S); return (!a && !b) ? null : [m, { v: cr(a), n: a }, { v: cr(b), n: b }, { v: cr(a + b), n: a + b, c: "#0b3c8c" }]; }).filter(Boolean)} foot={["Total", cr(A.s0), cr(A.s1), cr(A.sAll)]} maxH={470} />
            </ZPanel>
            <ZPanel title="Sales Personwise" sub="target · sales · achievement · growth">
              {(() => { const t = perfTable(db.sp, IX.P); return <T head={["Sales Person", "Target", "Sales", "Ach%", "GW%"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>

            {/* Row 5 */}
            <ZPanel title="Categorywise" sub={YA + " vs " + YB}>
              {(() => { const t = dimTable(db.c, IX.C); return <T head={["Category", YA, "%", YB, "%", "Total"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>
            <ZPanel title="Partywise Contribution" sub="by sales value"><RankBars items={bars(db.pa, IX.PA)} fmt={cr} limit={10} /></ZPanel>
            <ZPanel title="Gradewise Contribution" sub="by sales value"><RankBars items={bars(db.gr, IX.GR)} fmt={cr} limit={10} /></ZPanel>

            {/* Row 6 */}
            <ZPanel title="Codewise" sub={db.co.length + " codes"}>
              {(() => { const t = dimTableS(db.co, IX.CO); return <T head={["Code", YA, YB, "Total"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>
            <ZPanel title="Gradewise" sub={db.gr.length + " grades"}>
              {(() => { const t = dimTableS(db.gr, IX.GR); return <T head={["Grade", YA, YB, "Total"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>
            <ZPanel title="Partywise" sub={db.pa.length + " parties"}>
              {(() => { const t = dimTableS(db.pa, IX.PA); return <T head={["Party", YA, YB, "Total"]} rows={t.rows} foot={t.foot} maxH={470} />; })()}
            </ZPanel>
          </div>
        </>
      )}

      {/* upload progress — like the Customers import, 0 → 100% */}
      {prog !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,45,.5)", zIndex: 99999, display: "grid", placeItems: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "26px 30px", width: "min(420px, 92vw)", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--navy)", marginBottom: 4 }}>Uploading sales data…</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>{msg}</div>
            <div style={{ height: 12, borderRadius: 99, background: "var(--accent-soft)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: prog + "%", borderRadius: 99, background: "var(--navy)", transition: "width .2s" }} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 20, color: "var(--navy)", marginTop: 10 }}>{prog}%</div>
          </div>
        </div>
      )}
    </DxPage>
  );
}
