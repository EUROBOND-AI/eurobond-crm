/* Sales Review (Power BI) — a native CRM dashboard (same chrome as every other
   dashboard: DxPage header, dx-filters, ShowGate, KpiCards, Panels). The data is
   the combined Pan-India sales Excel, uploaded here (Import) and stored compact
   on the server (powerbi.php); each upload replaces the whole dataset. */
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download } from "lucide-react";
import { api } from "../lib/api.js";
import { DxPage, KpiCard, Panel, ShowGate, RankBars } from "../components/dash.jsx";

const MO = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const QS = ["Q1", "Q2", "Q3", "Q4"];
/* sg row: [Y,Q,M,B,C,P,R,E,PA,CO,GR,S,SQ,TG,EX] */
const IX = { Y: 0, Q: 1, M: 2, B: 3, C: 4, P: 5, R: 6, E: 7, PA: 8, CO: 9, GR: 10, S: 11, SQ: 12, TG: 13, EX: 14 };

const cr = (n) => { n = Number(n) || 0; return (n / 1e7).toFixed(2) + " Cr"; };
const pcN = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const pcStr = (a, b) => (b ? (a / b * 100).toFixed(1) + "%" : "—");
const pcColor = (p) => (p >= 100 ? "#10b981" : p >= 75 ? "#f59e0b" : "#ef4444");
const sm = (arr, i) => arr.reduce((s, r) => s + (r[i] || 0), 0);
const COLS = ["Year", "QTR", "Month", "Brand", "Category", "Sales person", "Region", "Employee Status", "Party Name", "Code", "Grade", "SALES G", "Sq.Mtr", "Target D", "Expenses"];

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

export default function SalesReview() {
  const [db, setDb] = useState(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  const [fy, setFy] = useState(""), [fb, setFb] = useState(""), [fq, setFq] = useState(""), [fm, setFm] = useState(""), [fr, setFr] = useState("");

  const load = () => {
    setShown(true); setBusy(true);
    api.pbLoad()
      .then((j) => setDb(j && Array.isArray(j.sg) ? Object.assign(blankDB(), j) : blankDB()))
      .catch(() => setDb(blankDB()))
      .finally(() => setBusy(false));
  };

  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setMsg("Reading " + f.name + " …");
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      setMsg("Parsing " + (aoa.length - 1).toLocaleString() + " rows …");
      const nd = buildFromAOA(aoa);
      setMsg("Saving to server …");
      const r = await api.pbSave(nd);
      setDb(nd); setShown(true);
      setMsg("Saved " + Number(r.rows).toLocaleString() + " rows ✓");
      setFy(""); setFb(""); setFq(""); setFm(""); setFr("");
    } catch (err) { setMsg("Error: " + err.message); alert("Import failed: " + err.message); }
    e.target.value = "";
  };

  const onExport = () => {
    if (!db || !db.sg.length) { alert("No data to export — Import an Excel first."); return; }
    const out = [COLS];
    db.sg.forEach((r) => out.push([
      (db.yrs[r[0]]) || "", (r[1] >= 0 ? QS[r[1]] : ""), MO[r[2]] || "",
      db.b[r[3]] || "", db.c[r[4]] || "", db.sp[r[5]] || "", db.r[r[6]] || "",
      (r[7] === 1 ? "Resigned" : "Active"), db.pa[r[8]] || "", db.co[r[9]] || "", db.gr[r[10]] || "",
      r[11], r[12], r[13], r[14],
    ]));
    const ws = XLSX.utils.aoa_to_sheet(out);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, "sales-review-export.xlsx");
  };

  const rows = useMemo(() => {
    if (!db) return [];
    return db.sg.filter((r) =>
      (fy === "" || r[0] === +fy) && (fb === "" || r[3] === +fb) &&
      (fq === "" || r[1] === +fq) && (fm === "" || r[2] === +fm) && (fr === "" || r[6] === +fr));
  }, [db, fy, fb, fq, fm, fr]);

  const A = useMemo(() => {
    const yrs = (db && db.yrs) || [];
    const y0 = rows.filter((r) => r[0] === 0), y1 = rows.filter((r) => r[0] === 1);
    const s0 = sm(y0, IX.S), s1 = sm(y1, IX.S), tg0 = sm(y0, IX.TG), tg1 = sm(y1, IX.TG), ex0 = sm(y0, IX.EX), ex1 = sm(y1, IX.EX);
    const sAll = s0 + s1, tgAll = tg0 + tg1;
    return { yrs, y0, y1, s0, s1, tg0, tg1, ex0, ex1, sAll, tgAll, gw: s0 ? ((s1 - s0) / s0 * 100) : 0, shortfall: Math.max(0, tgAll - sAll) };
  }, [rows, db]);

  const YA = (A.yrs[0]) || "FY1", YB = (A.yrs[1]) || "FY2";

  /* dimension table: Name | YA sales | YA % | YB sales | YB % | Total */
  const dimTable = (arr, idxKey) => {
    const out = [];
    arr.forEach((name, i) => {
      const a = sm(A.y0.filter((r) => r[idxKey] === i), IX.S), b = sm(A.y1.filter((r) => r[idxKey] === i), IX.S);
      if (!a && !b) return;
      out.push([name, cr(a), pcStr(a, A.s0), cr(b), pcStr(b, A.s1), { v: cr(a + b), c: "#0b3c8c" }]);
    });
    out.sort((x, y) => 0);
    return out;
  };

  /* dimension with target/sales/ach%: Name | Target | Sales | Ach% | GW% */
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

  const brandBars = useMemo(() => (db ? db.b.map((name, i) => ({ label: name, value: sm(rows.filter((r) => r[IX.B] === i), IX.S) })).filter((x) => x.value).sort((a, b) => b.value - a.value) : []), [db, rows]);
  const spBars = useMemo(() => (db ? db.sp.map((name, i) => ({ label: name, value: sm(rows.filter((r) => r[IX.P] === i), IX.S) })).filter((x) => x.value).sort((a, b) => b.value - a.value) : []), [db, rows]);

  const hasData = db && db.sg.length > 0;

  return (
    <DxPage title="Sales Review" sub="Pan-India sales — target, achievement and contribution"
      actions={<>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onFile} />
        <button className="dx-btn dx-btn-p" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={15} /> Import Excel</button>
        <button className="dx-btn" onClick={onExport}><Download size={15} /> Export</button>
        {msg && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", fontWeight: 600 }}>{msg}</span>}
      </>}>
      <div className="dx-filters">
        {db && <Sel label="Year" value={fy} set={setFy} allLabel="All years" opts={db.yrs.map((y, i) => ({ v: i, lbl: y }))} />}
        {db && <Sel label="Brand" value={fb} set={setFb} allLabel="All brands" opts={db.b.map((y, i) => ({ v: i, lbl: y }))} />}
        <Sel label="QTR" value={fq} set={setFq} allLabel="All quarters" opts={QS.map((y, i) => ({ v: i, lbl: y }))} />
        <Sel label="Month" value={fm} set={setFm} allLabel="All months" opts={MO.map((y, i) => ({ v: i, lbl: y }))} />
        {db && <Sel label="Region" value={fr} set={setFr} allLabel="All regions" opts={db.r.map((y, i) => ({ v: i, lbl: y }))} />}
        {(fy || fb || fq || fm || fr) && <button className="dx-btn" style={{ alignSelf: "flex-end" }} onClick={() => { setFy(""); setFb(""); setFq(""); setFm(""); setFr(""); }}>Reset</button>}
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
            <Panel title="Brandwise Contribution" sub="by sales value">
              <RankBars items={brandBars} fmt={cr} limit={8} />
            </Panel>
            <Panel title="By Financial Year" sub="target · sales · achievement · expense %">
              <T head={["Year", "Target", "Sales", "Ach%", "Exp%"]}
                rows={[
                  [YA, cr(A.tg0), cr(A.s0), { v: pcStr(A.s0, A.tg0), c: pcColor(pcN(A.s0, A.tg0)) }, pcStr(A.ex0, A.s0)],
                  [YB, cr(A.tg1), cr(A.s1), { v: pcStr(A.s1, A.tg1), c: pcColor(pcN(A.s1, A.tg1)) }, pcStr(A.ex1, A.s1)],
                ]}
                foot={["Total", cr(A.tgAll), cr(A.sAll), pcStr(A.sAll, A.tgAll), pcStr(A.ex0 + A.ex1, A.sAll)]} />
            </Panel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Brandwise" sub={YA + " vs " + YB}>
              <T head={["Brand", YA, "%", YB, "%", "Total"]} rows={dimTable(db.b, IX.B)}
                foot={["Total", cr(A.s0), "100%", cr(A.s1), "100%", cr(A.sAll)]} />
            </Panel>
            <Panel title="Categorywise" sub={YA + " vs " + YB}>
              <T head={["Category", YA, "%", YB, "%", "Total"]} rows={dimTable(db.c, IX.C)}
                foot={["Total", cr(A.s0), "100%", cr(A.s1), "100%", cr(A.sAll)]} />
            </Panel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Regionwise" sub="target · sales · achievement · growth">
              <T head={["Region", "Target", "Sales", "Ach%", "GW%"]} rows={perfTable(db.r, IX.R)} />
            </Panel>
            <Panel title="Sales Personwise Contribution" sub="by sales value">
              <RankBars items={spBars} fmt={cr} limit={10} />
            </Panel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Monthwise" sub="Apr → Mar">
              <T head={["Month", YA, YB, "Total"]}
                rows={MO.map((m, mi) => {
                  const a = sm(A.y0.filter((r) => r[IX.M] === mi), IX.S), b = sm(A.y1.filter((r) => r[IX.M] === mi), IX.S);
                  return (!a && !b) ? null : [m, cr(a), cr(b), { v: cr(a + b), c: "#0b3c8c" }];
                }).filter(Boolean)}
                foot={["Total", cr(A.s0), cr(A.s1), cr(A.sAll)]} />
            </Panel>
            <Panel title="Sales Personwise" sub="target · sales · achievement">
              <T head={["Sales Person", "Target", "Sales", "Ach%", "GW%"]} rows={perfTable(db.sp, IX.P)} maxH={420} />
            </Panel>
          </div>

          <div className="dx-grid dx-row" style={{ marginBottom: 16 }}>
            <Panel title="Codewise" sub={db.co.length + " codes"}>
              <T head={["Code", YA, "%", YB, "%", "Total"]} rows={dimTable(db.co, IX.CO)} maxH={420} />
            </Panel>
            <Panel title="Gradewise" sub={db.gr.length + " grades"}>
              <T head={["Grade", YA, "%", YB, "%", "Total"]} rows={dimTable(db.gr, IX.GR)} maxH={420} />
            </Panel>
          </div>

          <Panel title="Partywise" sub={db.pa.length + " parties"}>
            <T head={["Party", YA, "%", YB, "%", "Total"]} rows={dimTable(db.pa, IX.PA)} maxH={460} />
          </Panel>
        </>
      )}
    </DxPage>
  );
}
