import { useEffect, useState } from "react";
import { Package, Upload, X, Trash2 } from "lucide-react";
import { PageHead, StatCard } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { useBulk, BulkHead, BulkCell, BulkBar } from "../components/Bulk.jsx";

/* Products (admin) — designed like Areas.
   Product Name (Grade Name) select -> its Colour Codes + Colours + Grade + Thickness.
   App Quotation lo Grade Name filter -> ee colour codes cascade avutundi.
   CSV import: Product Name, Thickness, Code, Colour, Grade columns. */
export default function ProductsPage() {
  const [names, setNames] = useState([]);
  const [sel, setSel] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState({ rows: 0, products: 0 });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  /* the row being corrected, or null when a new one is being added */
  const [editRow, setEditRow] = useState(null);

  const loadNames = () => {
    api.productNames().then((d) => setNames(d.names || [])).catch(() => {});
    api.productsCount().then((d) => setCount(d)).catch(() => {});
  };
  useEffect(loadNames, []);
  useEffect(() => {
    if (!sel) { setRows([]); return; }
    api.productsByName(sel).then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, [sel]);

  const filteredNames = q ? names.filter((n) => n.toLowerCase().includes(q.toLowerCase())) : names;

  const delProduct = async () => {
    if (!sel) return;
    if (!confirm(`Delete ALL colour codes of "${sel}"? This cannot be undone.`)) return;
    try { await api.productDelete(sel); setRows([]); setSel(""); loadNames(); }
    catch (e) { alert(e.message); }
  };
  /* a colour row is known by its code and colour together */
  const rowKey = (r) => `${r.code || ""}|${r.colour || ""}`;
  const bulk = useBulk(rows, rowKey);
  const delManyRows = async (keys) => {
    const picked = rows.filter((r) => keys.includes(rowKey(r)));
    for (const r of picked) { try { await api.productRowDelete(sel, r.code, r.colour); } catch {} }
    setRows((rs) => rs.filter((x) => !keys.includes(rowKey(x))));
    api.productsCount().then(setCount).catch(() => {});
  };

  const delRow = async (r) => {
    if (!confirm(`Delete colour code ${r.code} (${r.colour}) from ${sel}?`)) return;
    try { await api.productRowDelete(sel, r.code, r.colour); setRows((rs) => rs.filter((x) => !(x.code === r.code && x.colour === r.colour))); api.productsCount().then(setCount); }
    catch (e) { alert(e.message); }
  };

  /* CSV import: Product Name, Thickness, Code, Colour, Grade */
  const importCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
      /* Matching a header by "contains" put three different columns on the same
         one: "Colour Code" contains both "colour" and "code", and
         "Product Name (Grade Name)" contains "grade". Each column is now looked
         for by its own full name first, and only then by a looser match that
         rules the others out. */
      const exact = (...names) => header.findIndex((h) => names.includes(h));
      const pick = (full, loose, not = []) => {
        const e = exact(...full);
        if (e >= 0) return e;
        return header.findIndex((h) => loose.some((k) => h.includes(k)) && !not.some((n) => h.includes(n)));
      };
      const pIdx   = pick(["product name (grade name)", "product name", "product"], ["product"]);
      const tIdx   = pick(["thickness"], ["thickness"]);
      const cIdx   = pick(["colour code", "color code", "code"], ["code"], ["grade"]);
      const colIdx = pick(["colour", "color"], ["colour", "color"], ["code"]);
      const gIdx   = pick(["grade code", "grade"], ["grade"], ["product", "name"]);
      const prIdx  = pick(["standard price (per sq.ft)", "standard price", "price"], ["price", "rate"]);
      if (pIdx < 0) { alert("CSV needs at least a 'Product Name' column."); setBusy(false); return; }
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].match(/(".*?"|[^,]+)/g) || [];
        const clean = (n) => (n >= 0 ? (cols[n] || "").trim().replace(/^"|"$/g, "") : "");
        const pn = clean(pIdx);
        if (!pn) continue;
        parsed.push({ productName: pn, thickness: clean(tIdx), code: clean(cIdx), colour: clean(colIdx),
                      grade: clean(gIdx), price: clean(prIdx).replace(/[^\d.]/g, "") });
      }
      if (parsed.length === 0) { alert("No valid rows found."); setBusy(false); return; }
      const r = await api.productsImport(parsed);
      alert(`Imported ${r.saved} product rows.`);
      loadNames();
      if (sel) api.productsByName(sel).then((d) => setRows(d.rows || []));
    } catch (e) { alert("Import failed: " + e.message); }
    setBusy(false);
  };

  return (
    <div>
      <PageHead crumb="Master" title="Products" actions={
        <>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Package size={14} /> Add Product</button>
          <button className="btn btn-ghost" onClick={() => {
            const csv = [
              ["Product Name (Grade Name)", "Colour Code", "Colour", "Grade Code", "Thickness", "Standard Price (per Sq.Ft)"],
              ["4MM PLATINIUM", "ER 501", "Brush Silver", "3BRB", "0.50 AL + 3.00 LDPE CORE + 0.50 AL", "150"],
              ["4MM ECONOMY", "ER 107", "Red", "2RED", "0.30 AL + 3.00 LDPE CORE + 0.30 AL", "120"],
            ].map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = "products-format.csv"; a.click();
          }}><Upload size={14} /> Download Format</button>
          <label className="btn btn-soft" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {busy ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />
          </label>
        </>
      } />

      <div className="stat-row">
        <StatCard label="Total Rows" value={count.rows} sub="Colour codes" color="#4a7bff" />
        <StatCard label="Products" value={count.products} sub="Grade names" color="#8b5cf6" />
        <StatCard label="Selected" value={sel ? rows.length : "—"} sub={sel || "Pick a product"} color="#10b981" />
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "var(--shadow-3d)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Product (Grade Name):</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product…" style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, minWidth: 180 }} />
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, minWidth: 240 }}>
            <option value="">— Select a product —</option>
            {filteredNames.map((s) => <option key={s}>{s}</option>)}
          </select>
          {sel && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{rows.length} colour codes</span>}
          {sel && <button className="btn btn-danger" style={{ marginLeft: "auto", padding: "7px 12px", fontSize: 12 }} onClick={delProduct}><Trash2 size={13} /> Delete Product</button>}
        </div>

        {!sel ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            {count.rows === 0
              ? "No products yet. Import a CSV with Product Name, Thickness, Code, Colour, Grade columns."
              : "Select a product to view its colour codes."}
          </div>
        ) : (
          <div>
            <BulkBar bulk={bulk} noun="colour code" onDelete={delManyRows} />
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f4f6fc", textAlign: "left" }}><BulkHead bulk={bulk} />
                {["Colour Code", "Colour", "Grade", "Thickness", "Standard Price", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                    <BulkCell bulk={bulk} k={rowKey(r)} />
                    <td style={{ padding: "9px 12px", fontWeight: 700 }}>{r.code || "—"}</td>
                    <td style={{ padding: "9px 12px" }}>{r.colour || "—"}</td>
                    <td style={{ padding: "9px 12px" }}>{r.grade || "—"}</td>
                    <td style={{ padding: "9px 12px", fontSize: 11.5, color: "var(--muted)" }}>{r.thickness || "—"}</td>
                    {/* the rate this grade is meant to sell at — it was stored but
                        never shown, so there was no way to check or correct it */}
                    <td style={{ padding: "9px 12px", fontWeight: 700 }}>{r.price ? `₹ ${Number(r.price).toLocaleString("en-IN")}` : "—"}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={() => setEditRow({ ...r, productName: sel })} title="Edit"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#2f6fed", fontWeight: 700, fontSize: 12 }}>Edit</button>
                        <button onClick={() => delRow(r)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {(addOpen || editRow) && (
        <AddProductModal
          onClose={() => { setAddOpen(false); setEditRow(null); }}
          onSaved={() => { setAddOpen(false); setEditRow(null); loadNames(); if (sel) api.productsByName(sel).then((d) => setRows(d.rows || [])); }}
          defaultName={sel} existingNames={names} editing={editRow} />
      )}
    </div>
  );
}

function AddProductModal({ onClose, onSaved, defaultName, existingNames = [], editing = null }) {
  const [f, setF] = useState(editing
    ? { productName: editing.productName || defaultName || "", thickness: editing.thickness || "", code: editing.code || "", colour: editing.colour || "", grade: editing.grade || "", price: editing.price || "" }
    : { productName: defaultName || "", thickness: "", code: "", colour: "", grade: "" });
  const [busy, setBusy] = useState(false);
  const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13 };
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,45,.55)", zIndex: 200, display: "grid", placeItems: "center", padding: 18 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{editing ? "Edit Product" : "Add Product"}</h3>
          <button className="btn btn-ghost" style={{ padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Product Name (Grade Name) *</label>
        <input list="existing-products" value={f.productName} onChange={(e) => set("productName", e.target.value)} placeholder="Select existing or type new" style={inp} />
        <datalist id="existing-products">
          {existingNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: -6, marginBottom: 10 }}>Select an existing product from the dropdown, or type a new product name</div>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Colour Code</label>
        <input value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. ER 501" style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Colour</label>
        <input value={f.colour} onChange={(e) => set("colour", e.target.value)} placeholder="e.g. Brush Silver" style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Grade Code</label>
        <input value={f.grade} onChange={(e) => set("grade", e.target.value)} placeholder="e.g. 3BRB" style={inp} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>Thickness</label>
        <input value={f.thickness} onChange={(e) => set("thickness", e.target.value)} placeholder="e.g. 0.50 AL + 3.00 LDPE CORE + 0.50 AL" style={inp} />

        {/* Standard rate — used only in the admin panel to flag low quotation rates.
            It is never shown to field users. */}
        <label style={{ fontSize: 12, fontWeight: 700 }}>Standard Price (₹ per Sq.Ft)</label>
        <input value={f.price || ""} inputMode="decimal"
          onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="e.g. 150" style={inp} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 6 }} disabled={busy || !f.productName} onClick={async () => {
          setBusy(true);
          try {
            await api.productAdd(f);
            /* An edit that changes the colour code or the colour would otherwise
               leave the old row behind, since a row is identified by those two.
               The new one is saved first, so nothing is lost if this fails. */
            if (editing && (editing.code !== f.code || editing.colour !== f.colour)) {
              try { await api.productRowDelete(editing.productName || f.productName, editing.code, editing.colour); } catch {}
            }
            onSaved();
          } catch (e) { alert(e.message); setBusy(false); }
        }}>{busy ? "Saving…" : (editing ? "Save Changes" : "Save Product")}</button>
      </div>
    </div>
  );
}
