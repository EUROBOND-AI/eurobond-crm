/* Sales Review (Power BI) — a native CRM dashboard (same chrome as every other
   dashboard: DxPage, dx-filters with Zone/State/HOD/Person, ShowGate, KpiCards,
   Panels with graphs + tables). Data = the combined Pan-India sales Excel (full
   49-column format, read by column name), uploaded here and stored compact on
   the server (powerbi.php). Each upload replaces the whole dataset. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, FileDown, Maximize2, X } from "lucide-react";
import { api, auth, API_BASE } from "../lib/api.js";
import { DxPage, KpiCard, Panel, ShowGate, RankBars, WeekBars, HalfDonut } from "../components/dash.jsx";

const MO = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const QS = ["Q1", "Q2", "Q3", "Q4"];
const IX = { Y: 0, Q: 1, M: 2, B: 3, C: 4, P: 5, R: 6, E: 7, PA: 8, CO: 9, GR: 10, S: 11, SQ: 12, TG: 13, EX: 14 };

/* the full format the ERP exports — used only for the blank Download Format */
const FULL_COLS = ["Year", "QTR", "MTH", "Month", "Date", "Voucher Type", "Voucher No", "Party Name", "Item Description", "Item Group", "Item Group Description", "Code", "Grade", "#", "Category", "Brand", "QTY", "Sq.Mtr", "CO", "SALES G", "HOD", "Area", "STATE", "Region", "Sales person", "Target D", "Sales D", "Expenses", "Company", "Category CAT", "Target CAT", "Sales CAT", "# Brand", "# Category", "# Year", "Employee Code", "Employee Status", "DOJ", "DOR", "SL -2025-26 SALES G", "SL -2026-27 SALES G", "Expenses-I", "Inc", "# Category Cat", "SL -2025-26 SALES G (Nw)", "SL -2026-27 SALES G (Nw)"];
const EXPORT_COLS = ["Year", "QTR", "Month", "Brand", "Category", "Sales person", "Region", "Employee Status", "Party Name", "Code", "Grade", "SALES G", "Sq.Mtr", "Target D", "Expenses"];

const cr = (n) => { n = Number(n) || 0; return (n / 1e7).toFixed(2) + " Cr"; };
const pcN = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const pcStr = (a, b) => (b ? (a / b * 100).toFixed(1) + "%" : "—");
const pcColor = (p) => (p >= 100 ? "#10b981" : p >= 75 ? "#f59e0b" : "#ef4444");
const sm = (arr, i) => arr.reduce((s, r) => s + (r[i] || 0), 0);

function blankDB() { return { sp: [], r: [], b: [], c: [], pa: [], co: [], gr: [], sg: [], yrs: [] }; }

function buildFromAOA(aoa) {
  const head = (aoa[0] || []).map((h) => String(h == null ? "" : h).trim());
  const col = {}; head.forEach((h, i) => { if (!(h in col)) col[h] = i; });
  const need = ["Year", "Month", "Brand", "Category", "Sales person", "Region", "SALES G"];
  const miss = need.filter((k) => !(k in col));
  if (miss.length) throw new Error("Missing columns: " + miss.join(", "));
  const Q = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };
  const d = blankDB();
  const num = (v) => { if (v == null || v === "") return 0; const n = +String(v).replace(/[^0-9.\-]/g, ""); return isNaN(n) ? 0 : n; };
  const maps = { b: new Map(), c: new Map(), sp: new Map(), r: new Map(), pa: new Map(), co: new Map(), gr: new Map() };
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
      num(g(row, "SALES G")), num(g(row, "Sq.Mtr")), num(g(row, "Target D")), num(g(row, "Expenses"))]);
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

/* a plain table styled to sit inside a dx Panel */
function T({ head, rows, foot, maxH }) {
  return (
    <div style={{ overflow: "auto", maxHeight: maxH || "none", border: "1px solid var(--line)", borderRadius: 10 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, whiteSpace: "nowrap" }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ position: "sticky", top: 0, background: "var(--navy)", color: "#fff", fontWeight: 700, padding: "7px 10px", textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => <tr key={ri} style={{ borderBottom: "1px solid var(--line)" }}>{r.map((c, ci) => <td key={ci} style={{ padding: "6px 10px", textAlign: ci === 0 ? "left" : "right", fontWeight: ci === 0 ? 700 : 500, color: c && c.c ? c.c : "var(--ink)" }}>{c && c.v !== undefined ? c.v : c}</td>)}</tr>)}
          {foot && <tr style={{ background: "var(--accent-soft)", fontWeight: 800 }}>{foot.map((c, ci) => <td key={ci} style={{ padding: "7px 10px", textAlign: ci === 0 ? "left" : "right" }}>{c && c.v !== undefined ? c.v : c}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

/* Panel + a corner "full screen" button that opens the same content in a modal */
function ZPanel({ title, sub, children }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <Panel title={title} sub={sub} action={
        <button className="dx-btn" style={{ padding: "4px 8px" }} title="Full screen" onClick={() => setZoom(true)}><Maximize2 size={14} /></button>
      }>{children}</Panel>
      {zoom && (
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,45,.55)", zIndex: 99999, display: "grid", placeItems: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "min(1100px, 96vw)", maxHeight: "92vh", overflow: "auto", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div><div style={{ fontWeight: 800, fontSize: 17, color: "var(--navy)" }}>{title}</div>{sub && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{sub}</div>}</div>
              <button className="dx-btn" onClick={() => setZoom(false)}><X size={15} /> Close</button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}

export default function SalesReview() {
  const [db, setDb] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState(null);   // upload %  (null = not uploading)
  const fileRef = useRef(null);

  // filters — standard Zone/State/HOD/Person, exactly like every dashboard
  const [zone, setZone] = useState(""), [state, setState] = useState(""), [hod, setHod] = useState(""), [person, setPerson] = useState("");
  const low = (x) => String(x || "").trim().toLowerCase();

  useEffect(() => { api.listUsers().then((d) => setUsers(d.users || [])).catch(() => {}); }, []);

  const load = () => {
    setShown(true); setBusy(true);
    Promise.all([api.pbLoad(), api.listUsers().catch(() => ({ users: [] }))])
      .then(([j, uu]) => { setUsers(uu.users || []); setDb(j && Array.isArray(j.sg) ? Object.assign(blankDB(), j) : blankDB()); })
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
      setZone(""); setState(""); setHod(""); setPerson("");
    } catch (err) { setMsg("Error: " + err.message); alert("Import failed: " + err.message); }
    setProg(null);
    e.target.value = "";
  };

  const onExport = () => {
    if (!db || !db.sg.length) { alert("No data to export — Import an Excel first."); return; }
    const out = [EXPORT_COLS];
    db.sg.forEach((r) => out.push([(db.yrs[r[0]]) || "", (r[1] >= 0 ? QS[r[1]] : ""), MO[r[2]] || "", db.b[r[3]] || "", db.c[r[4]] || "", db.sp[r[5]] || "", db.r[r[6]] || "", (r[7] === 1 ? "Resigned" : "Active"), db.pa[r[8]] || "", db.co[r[9]] || "", db.gr[r[10]] || "", r[11], r[12], r[13], r[14]]));
    const ws = XLSX.utils.aoa_to_sheet(out);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales"); XLSX.writeFile(wb, "sales-review-export.xlsx");
  };
  const onFormat = () => {
    const ws = XLSX.utils.aoa_to_sheet([FULL_COLS]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales"); XLSX.writeFile(wb, "sales-review-format.xlsx");
  };

  /* Zone → State → HOD → Person cascade from the users table */
  const vis = useMemo(() => (users || []).filter((u) => u.status == null || u.status == 1 || u.status === "1"), [users]);
  const inZone = useMemo(() => (zone ? vis.filter((u) => low(u.zone) === low(zone)) : vis), [vis, zone]);
  const inState = useMemo(() => (state ? inZone.filter((u) => [u.state, ...String(u.states || "").split(",")].map(low).includes(low(state))) : inZone), [inZone, state]);
  const inHod = useMemo(() => (hod ? inState.filter((u) => low(u.manager) === low(hod) || low(u.name) === low(hod)) : inState), [inState, hod]);
  const zones = useMemo(() => [...new Set(vis.map((u) => String(u.zone || "").trim()).filter(Boolean))].sort(), [vis]);
  const states = useMemo(() => [...new Set(inZone.flatMap((u) => [u.state, ...String(u.states || "").split(",")]).map((x) => String(x || "").trim()).filter(Boolean))].sort(), [inZone]);
  const hods = useMemo(() => [...new Set(inState.map((u) => String(u.manager || "").trim()).filter(Boolean))].sort(), [inState]);
  const persons = useMemo(() => [...inHod].map((u) => u.name).filter(Boolean).sort(), [inHod]);

  /* the set of sales-person names the current place filter allows */
  const allowSp = useMemo(() => {
    if (!(zone || state || hod || person)) return null;        // null = everyone
    if (person) return new Set([low(person)]);
    return new Set(inHod.map((u) => low(u.name)));
  }, [zone, state, hod, person, inHod]);

  const rows = useMemo(() => {
    if (!db) return [];
    if (!allowSp) return db.sg;
    return db.sg.filter((r) => allowSp.has(low(db.sp[r[IX.P]])));
  }, [db, allowSp]);

  const A = useMemo(() => {
    const yrs = (db && db.yrs) || [];
    const y0 = rows.filter((r) => r[0] === 0), y1 = rows.filter((r) => r[0] === 1);
    const s0 = sm(y0, IX.S), s1 = sm(y1, IX.S), tg0 = sm(y0, IX.TG), tg1 = sm(y1, IX.TG), ex0 = sm(y0, IX.EX), ex1 = sm(y1, IX.EX);
    const sAll = s0 + s1, tgAll = tg0 + tg1;
    return { yrs, y0, y1, s0, s1, tg0, tg1, ex0, ex1, sAll, tgAll, gw: s0 ? ((s1 - s0) / s0 * 100) : 0, shortfall: Math.max(0, tgAll - sAll) };
  }, [rows, db]);

  const YA = (A.yrs[0]) || "FY1", YB = (A.yrs[1]) || "FY2";

  const dimTable = (arr, idxKey) => {
    const out = [];
    arr.forEach((name, i) => {
      const a = sm(A.y0.filter((r) => r[idxKey] === i), IX.S), b = sm(A.y1.filter((r) => r[idxKey] === i), IX.S);
      if (!a && !b) return;
      out.push([name, cr(a), pcStr(a, A.s0), cr(b), pcStr(b, A.s1), { v: cr(a + b), c: "#0b3c8c" }]);
    });
    return out;
  };
  const perfTable = (arr, idxKey) => {
    const out = [];
    arr.forEach((name, i) => {
      const a = sm(A.y0.filter((r) => r[idxKey] === i), IX.S), b = sm(A.y1.filter((r) => r[idxKey] === i), IX.S);
      const tg = sm(A.y0.filter((r) => r[idxKey] === i), IX.TG) + sm(A.y1.filter((r) => r[idxKey] === i), IX.TG);
      const s = a + b; if (!s && !tg) return;
      const gw = a ? ((b - a) / a * 100) : null;
      out.push([name, cr(tg), cr(s), { v: pcStr(s, tg), c: pcColor(pcN(s, tg)) }, { v: gw == null ? "—" : gw.toFixed(1) + "%", c: gw == null ? "var(--muted)" : (gw >= 0 ? "#10b981" : "#ef4444") }]);
    });
    return out;
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
    <DxPage title="Sales Review" sub="Pan-India sales — target, achievement and contribution"
      actions={<>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onFile} />
        <button className="dx-btn dx-btn-p" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={15} /> Import Excel</button>
        <button className="dx-btn" onClick={onFormat}><FileDown size={15} /> Download Format</button>
        <button className="dx-btn" onClick={onExport}><Download size={15} /> Export</button>
        {msg && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", fontWeight: 600 }}>{msg}</span>}
      </>}>

      <div className="dx-filters">
        <Sel label="Zone" value={zone} set={(v) => { setZone(v); setState(""); setHod(""); setPerson(""); }} allLabel="All zones" opts={zones.map((z) => ({ v: z, lbl: z }))} />
        <Sel label="State" value={state} set={(v) => { setState(v); setHod(""); setPerson(""); }} allLabel="All states" opts={states.map((z) => ({ v: z, lbl: z }))} />
        <Sel label="HOD" value={hod} set={(v) => { setHod(v); setPerson(""); }} allLabel="All HODs" opts={hods.map((z) => ({ v: z, lbl: z }))} />
        <Sel label="Person" value={person} set={setPerson} allLabel="Everyone" opts={persons.map((z) => ({ v: z, lbl: z }))} />
        {(zone || state || hod || person) && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={() => { setZone(""); setState(""); setHod(""); setPerson(""); }}>Reset</button>}
      </div>

      {!shown || (busy && !db) ? <ShowGate onShow={load} busy={busy} what="Sales Review" /> : !hasData ? (
        <Panel><div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>No data yet — press <b>Import Excel</b> above to upload the combined Pan-India file.</div></Panel>
      ) : (
        <>
          <div className="dx-grid dx-kpis" style={{ marginBottom: 16 }}>
            <KpiCard hero label="Target" value={cr(A.tgAll)} sub="combined target" />
            <KpiCard label="Sales" value={cr(A.sAll)} chip={pcStr(A.sAll, A.tgAll)} sub="of target" />
            <KpiCard label="Shortfall" value={cr(A.shortfall)} sub={A.shortfall ? "still to come" : "on target"} />
            <KpiCard label="GW %" value={A.gw.toFixed(1) + "%"} sub={YA + " → " + YB} />
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <ZPanel title="Achievement by Financial Year" sub="sales vs target">
              <WeekBars days={[{ label: YA, value: A.s0, note: pcStr(A.s0, A.tg0) }, { label: YB, value: A.s1, note: pcStr(A.s1, A.tg1), isToday: true }]} height={230} fmt={cr} />
            </ZPanel>
            <ZPanel title="Expense %" sub={YA + " vs " + YB}>
              <HalfDonut segments={[{ label: YA, value: A.ex0 }, { label: YB, value: A.ex1 }]} center={pcStr(A.ex0 + A.ex1, A.sAll)} centerLabel="of sales" fmt={cr} />
            </ZPanel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <ZPanel title="Quarterwise Achievement" sub={YB + " — achievement % on each bar"}>
              <WeekBars days={qtrBars} height={230} fmt={cr} />
            </ZPanel>
            <ZPanel title="Monthwise Sales" sub="Apr → Mar"><WeekBars days={monthBars} height={230} fmt={cr} /></ZPanel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <ZPanel title="Brandwise Contribution" sub="by sales value"><RankBars items={bars(db.b, IX.B)} fmt={cr} limit={8} /></ZPanel>
            <ZPanel title="Categorywise Contribution" sub="by sales value"><RankBars items={bars(db.c, IX.C)} fmt={cr} limit={8} /></ZPanel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <ZPanel title="Regionwise Contribution" sub="by sales value"><RankBars items={bars(db.r, IX.R)} fmt={cr} limit={10} /></ZPanel>
            <ZPanel title="Sales Personwise Contribution" sub="by sales value"><RankBars items={bars(db.sp, IX.P)} fmt={cr} limit={10} /></ZPanel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <ZPanel title="Brandwise" sub={YA + " vs " + YB}>
              <T head={["Brand", YA, "%", YB, "%", "Total"]} rows={dimTable(db.b, IX.B)} foot={["Total", cr(A.s0), "100%", cr(A.s1), "100%", cr(A.sAll)]} />
            </ZPanel>
            <ZPanel title="Categorywise" sub={YA + " vs " + YB}>
              <T head={["Category", YA, "%", YB, "%", "Total"]} rows={dimTable(db.c, IX.C)} foot={["Total", cr(A.s0), "100%", cr(A.s1), "100%", cr(A.sAll)]} />
            </ZPanel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <ZPanel title="Regionwise" sub="target · sales · achievement · growth">
              <T head={["Region", "Target", "Sales", "Ach%", "GW%"]} rows={perfTable(db.r, IX.R)} maxH={320} />
            </ZPanel>
            <ZPanel title="Monthwise" sub="Apr → Mar">
              <T head={["Month", YA, YB, "Total"]} rows={MO.map((m, mi) => { const a = sm(A.y0.filter((r) => r[IX.M] === mi), IX.S), b = sm(A.y1.filter((r) => r[IX.M] === mi), IX.S); return (!a && !b) ? null : [m, cr(a), cr(b), { v: cr(a + b), c: "#0b3c8c" }]; }).filter(Boolean)} foot={["Total", cr(A.s0), cr(A.s1), cr(A.sAll)]} maxH={320} />
            </ZPanel>
          </div>

          <ZPanel title="Sales Personwise" sub="target · sales · achievement · growth">
            <T head={["Sales Person", "Target", "Sales", "Ach%", "GW%"]} rows={perfTable(db.sp, IX.P)} maxH={320} />
          </ZPanel>

          <div className="dx-grid dx-row" style={{ marginTop: 16 }}>
            <ZPanel title="Codewise" sub={db.co.length + " codes"}>
              <T head={["Code", YA, "%", YB, "%", "Total"]} rows={dimTable(db.co, IX.CO)} maxH={300} />
            </ZPanel>
            <ZPanel title="Gradewise" sub={db.gr.length + " grades"}>
              <T head={["Grade", YA, "%", YB, "%", "Total"]} rows={dimTable(db.gr, IX.GR)} maxH={300} />
            </ZPanel>
          </div>

          <div style={{ marginTop: 16 }}>
            <ZPanel title="Partywise" sub={db.pa.length + " parties"}>
              <T head={["Party", YA, "%", YB, "%", "Total"]} rows={dimTable(db.pa, IX.PA)} maxH={300} />
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
