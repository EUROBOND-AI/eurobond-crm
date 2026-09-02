import { useEffect, useMemo, useState } from "react";

import { MODULES } from "./moduleConfigs.jsx";
import { PageHead, Tabs, DataTable, ToolButtons, FormModal, StatCard } from "../components/ui.jsx";
import { api, auth } from "../lib/api.js";
import { scopeRows } from "../lib/scope.js";
import { AdminSearchSelect } from "./QuotationAdmin.jsx";

/* flatten arrays into readable text for admin table columns */
function projContactsText(contacts) {
  if (!contacts || !contacts.length) return "";
  return contacts.map((c) => {
    const ppl = (c.people || []).map((p) => [p.person, p.number, p.email].filter(Boolean).join(" ")).filter(Boolean).join("; ");
    return `${c.category || ""}${c.firmName ? " - " + c.firmName : ""}${ppl ? " (" + ppl + ")" : ""}`;
  }).filter(Boolean).join(" | ");
}
function projProductsText(items) {
  if (!items || !items.length) return "";
  return items.filter((it) => it.grade).map((it) => `${it.grade}${it.colourCode ? " / " + it.colourCode : ""}${it.qty ? " x" + it.qty : ""}`).join(", ");
}
/* per-category contact text: {cat_Architect: "Firm (person number email)", ...} */
function projCategoryCols(contacts) {
  const out = {};
  (contacts || []).forEach((c) => {
    if (!c.category) return;
    const ppl = (c.people || []).map((p) => [p.person, p.number, p.email].filter(Boolean).join(" ")).filter(Boolean).join("; ");
    const txt = `${c.firmName || ""}${ppl ? " (" + ppl + ")" : ""}`.trim();
    const key = "cat_" + c.category;
    out[key] = out[key] ? out[key] + " | " + txt : txt;
  });
  return out;
}


export default function ModulePage({ cfgKey }) {
  const cfg = MODULES[cfgKey];
  const [tab, setTab] = useState(cfg.tabs?.[0]?.key);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [userNames, setUserNames] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    api.listUsers().then((d) => {
      const us = (d.users || []).filter((u) => u.status == 1);
      setAllUsers(us);
      setUserNames(us.map((u) => u.name));
    }).catch(() => {});
  }, [cfgKey]);

  /* HOD-only names (role/designation contains "hod") for HOD dropdowns */
  const hodNames = useMemo(
    () => allUsers.filter((u) => `${u.role || ""} ${u.designation || ""}`.toLowerCase().includes("hod")).map((u) => u.name),
    [allUsers]
  );

  const formFields = useMemo(
    () => (cfg.form || []).map((f) => {
      if (f.optionsSource === "users") return { ...f, options: userNames };
      if (f.optionsSource === "hods") return { ...f, options: hodNames };
      return f;
    }),
    [cfg, userNames, hodNames]
  );

  useEffect(() => { setTab(cfg.tabs?.[0]?.key); setShown(false); }, [cfgKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr("");
    api.list(cfgKey)
      .then((d) => { if (alive) setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data, entriesCount: (r.data.followups || []).length, productsText: projProductsText(r.data.items), ...projCategoryCols(r.data.contacts) }))); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cfgKey]);

  const [fUser, setFUser] = useState("");
  const [fHod, setFHod] = useState("");
  const [fCity, setFCity] = useState("");
  const [fZone, setFZone] = useState("");
  const [fLead, setFLead] = useState("");
  const [fAssign, setFAssign] = useState("");
  const [fFrom, setFFrom] = useState("");
  /* app lo updates admin lo auto ga reflect avvadaniki — 60s refresh */
  useEffect(() => {
    const t = setInterval(() => { try { reload(); } catch {} }, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [cfgKey]);
  const [fTo, setFTo] = useState("");
  const [shown, setShown] = useState(false);   // projectProjection: show data only after "Show" clicked
  const [fSpec, setFSpec] = useState("");
  const [fSales, setFSales] = useState("");
  const [fStatus, setFStatus] = useState("");

  const knownTabs = (cfg.tabs || []).map((t) => t.key);
  const firstTab = cfg.tabs?.[0]?.key;

  const visible = useMemo(() => {
    let list = scopeRows(rows, allUsers);
    if (fUser) list = list.filter((r) => (r.createdBy || "") === fUser);
    if (fHod) list = list.filter((r) => (r.hod || "") === fHod);
    if (fSpec) list = list.filter((r) => (r.specPerson || "") === fSpec);
    if (fSales) list = list.filter((r) => (r.salesPerson || "") === fSales);
    if (fStatus) list = list.filter((r) => (r.status || "") === fStatus);
    /* date range (From/To) — r.date leda r.createdAt meeda */
    const parseD = (r) => {
      const raw = r.date || r.createdAt || "";
      const d = new Date(raw);
      return isNaN(d) ? null : d;
    };
    if (fFrom) { const a = new Date(fFrom); list = list.filter((r) => { const d = parseD(r); return d && d >= a; }); }
    if (fTo) { const b = new Date(fTo); b.setHours(23, 59, 59); list = list.filter((r) => { const d = parseD(r); return d && d <= b; }); }
    if (fCity) list = list.filter((r) => (r.city || "") === fCity);
    if (fZone) list = list.filter((r) => (r.zone || "") === fZone);
    if (fLead) list = list.filter((r) => (r.leadSource || "") === fLead);
    if (fAssign) list = list.filter((r) => (r.assignedTo || "") === fAssign || (r.specPerson || "") === fAssign || (r.salesPerson || "") === fAssign);
    if (!cfg.tabField || cfg.noTabFilter) return list;
    return list.filter((r) => {
      const st = String(r[cfg.tabField] ?? "");
      if (st === tab) return true;
      // records with unknown/old status appear under the first tab
      return tab === firstTab && !knownTabs.includes(st);
    });
  }, [rows, tab, cfg, fUser, fHod, fSpec, fSales, fStatus, fCity, fZone, fLead, fAssign, fFrom, fTo, allUsers]);

  const distinct = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];
  const hasCol = (key) => cfg.columns.some((c) => c.key === key);

  const [refreshing, setRefreshing] = useState(false);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [rejectDoc, setRejectDoc] = useState("");
  const [chatRow, setChatRow] = useState(null);
  const [projView, setProjView] = useState(null);
  const [fwdRow, setFwdRow] = useState(null);
  const [hiddenCols, setHiddenCols] = useState([]);
  const [showColCfg, setShowColCfg] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const reload = () => {
    setRefreshing(true); setErr("");
    api.list(cfgKey)
      .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data, entriesCount: (r.data.followups || []).length, productsText: projProductsText(r.data.items), ...projCategoryCols(r.data.contacts) }))))
      .catch((e) => setErr(e.message))
      .finally(() => setRefreshing(false));
  };

  const shownColumns = useMemo(() => cfg.columns.filter((c) => !hiddenCols.includes(c.key)), [cfg, hiddenCols]);

  const viewReport = () => {
    const w = window.open("", "_blank");
    const th = shownColumns.map((c) => `<th style="border:1px solid #ccc;padding:6px;background:#f0f2fa">${c.label}</th>`).join("");
    const trs = visible.map((r) => "<tr>" + shownColumns.map((c) => `<td style="border:1px solid #ccc;padding:6px">${r[c.key] ?? ""}</td>`).join("") + "</tr>").join("");
    w.document.write(`<html><head><title>${cfg.title} Report</title></head><body style="font-family:Arial"><h2>${cfg.title}</h2><p>${visible.length} records · ${new Date().toLocaleDateString("en-IN")}</p><table style="border-collapse:collapse;width:100%">${th ? "<tr>" + th + "</tr>" : ""}${trs}</table><script>window.print()</script></body></html>`);
    w.document.close();
  };

  const exportCsv = () => {
    const cols = cfg.columns.map((c) => c.key);
    const head = cfg.columns.map((c) => `"${c.label}"`).join(",");
    const lines = visible.map((r) => cols.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [head, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cfgKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  /* download a CSV template with the module's column headers (like Holidays) */
  const downloadFormat = () => {
    const labels = (cfg.form || []).map((f) => f.label || f.name).filter(Boolean);
    const heads = labels.length ? labels : (cfg.columns || []).map((c) => c.label);
    const csv = heads.join(",") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${cfgKey}-format.csv`; a.click();
  };

  const importCsv = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".csv";
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      const text = await file.text();
      const [headLine, ...dataLines] = text.split(/\r?\n/).filter(Boolean);
      const labels = headLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
      const keyByLabel = {}; cfg.columns.forEach((c) => { keyByLabel[c.label] = c.key; });
      let ok = 0;
      for (const line of dataLines) {
        const cells = line.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
        const data = {};
        labels.forEach((lab, i) => { if (keyByLabel[lab]) data[keyByLabel[lab]] = cells[i]; });
        if (Object.keys(data).length) { try { await api.create(cfgKey, data); ok++; } catch {} }
      }
      alert(`Imported ${ok} records`);
      reload();
    };
    inp.click();
  };

  const handleSave = async (values) => {
    const stamp = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    try {
      if (editing) {
        const data = { ...editing, ...values };
        delete data._id;
        await api.update(cfgKey, editing._id, data);
        setRows(rows.map((r) => (r._id === editing._id ? { _id: editing._id, ...data } : r)));
      } else {
        const seq = String(rows.length + 1).padStart(4, "0");
        const autoId = cfg.idPrefix ? `${cfg.idPrefix}-${seq}` : undefined;
        const data = {
          ...(autoId ? { id: autoId } : {}),
          createdAt: stamp,
          createdBy: (auth.user && auth.user.name) || "",
          ...(cfg.tabField && !cfg.noTabFilter ? { [cfg.tabField]: tab } : {}),
          status: tab,
          ...values,
        };
        const res = await api.create(cfgKey, data);
        setRows([{ _id: res.id, ...data }, ...rows]);
        /* Holidays/Announcements: select chesina audience ki matrame notification */
        if (cfg.notifyOnCreate) {
          try {
            const n = cfg.notifyOnCreate(data);
            await api.notify({
              ...n,
              audienceType: data.audienceType || "All",
              audienceValue: data.audienceValue || "",
              createdAt: new Date().toLocaleString("en-IN"),
            });
          } catch {}
        }
        /* GK-IT Support ticket → email the IT team */
        if (cfgKey === "tickets") {
          try {
            await api.sendMail({
              to: "technology@eurobondacp.com",
              html: true,
              subject: `New IT Support Ticket ${data.id || ""} — ${data.subject || ""}`,
              body: `<h3>New GK-IT Support Ticket</h3>
                <p><b>Ticket Id:</b> ${data.id || "-"}</p>
                <p><b>Raised By:</b> ${data.createdBy || "-"}</p>
                <p><b>Subject:</b> ${data.subject || "-"}</p>
                <p><b>Priority:</b> ${data.priority || "-"}</p>
                <p><b>Description:</b><br>${(data.desc || "-").replace(/\n/g, "<br>")}</p>
                <p><b>Created At:</b> ${data.createdAt || "-"}</p>
                <hr><p>Eurobond CRM — GK-IT Support</p>`,
            });
          } catch {}
        }
      }
      setShowForm(false); setEditing(null);
    } catch (e) {
      alert("Could not save: " + e.message);
    }
  };

  const setStatus = async (r, status) => {
    if (status === "Reject" || status === "Rejected") {
      setRejectFor({ r, status }); setRejectRemark(""); setRejectDoc("");
      return;
    }
    await applyStatus(r, status, "", "");
  };

  const applyStatus = async (r, status, remark, doc) => {
    try {
      const thread = [...(r.thread || [])];
      if (remark || doc) thread.push({ by: (auth.user && auth.user.name) || "Admin", text: remark, doc, at: new Date().toLocaleString("en-IN") });
      const data = { ...r, status, ...(remark ? { rejectRemark: remark } : {}), thread };
      delete data._id;
      await api.update(cfgKey, r._id, data);
      setRows(rows.map((x) => (x._id === r._id ? { ...x, status, rejectRemark: remark || x.rejectRemark, thread } : x)));
      if (r.createdBy && (cfgKey === "leave" || cfgKey === "specApproval" || cfgKey === "expense" || cfgKey === "outstation")) {
        try {
          const paidMsg = status === "Paid" ? " Amount will be credited to your account soon." : "";
          await api.notify({ to: r.createdBy, title: `${cfg.title} ${status}`, message: `Your ${cfg.crumb.toLowerCase()} ${r.id || ""} was ${status.toLowerCase()}.${remark ? " Reason: " + remark : ""}${paidMsg}`, link: "/app/m/" + cfgKey, createdAt: new Date().toLocaleString("en-IN") });
        } catch {}
      }
    } catch (e) { alert("Could not update: " + e.message); }
  };

  const handleDelete = async (r) => {
    if (!confirm("Delete this record?")) return;
    try {
      await api.remove(cfgKey, r._id);
      setRows(rows.filter((x) => x._id !== r._id));
    } catch (e) {
      alert("Could not delete: " + e.message);
    }
  };

  const handleBulkDelete = async (ids) => {
    if (!confirm(`Delete ${ids.length} selected records?`)) return;
    const failed = [];
    for (const id of ids) {
      try { await api.remove(cfgKey, id); }
      catch { failed.push(id); }
    }
    setRows(rows.filter((x) => !ids.includes(x._id) || failed.includes(x._id)));
    if (failed.length) alert(`${ids.length - failed.length} deleted. ${failed.length} could not be deleted — please try again.`);
  };

  return (
    <>
      <PageHead
        crumb={cfg.crumb}
        title={cfg.title}
        actions={
          <ToolButtons
            onAdd={cfg.form && cfg.addLabel ? () => { setEditing(null); setShowForm(true); } : null}
            addLabel={cfg.addLabel || "Add"}
            onRefresh={reload}
            refreshing={refreshing}
            onExport={exportCsv}
            onImport={cfg.form ? importCsv : null}
            onDownloadFormat={cfg.form ? downloadFormat : null}
            onHeaderConfig={() => setShowColCfg(true)}
            onLogs={() => setShowLogs(true)}
            onReport={viewReport}
          />
        }
      />
      {cfg.tabs && cfg.tabField && !cfg.noTabFilter && !loading && (
        <div className="stat-row">
          <StatCard label="Total" value={rows.length} sub="All records" color="#4a7bff" />
          {cfg.tabs.slice(0, 4).map((t, i) => (
            <StatCard key={t.key} label={t.label} value={rows.filter((r) => String(r[cfg.tabField]) === t.key).length} sub={t.label + " records"} color={["#8b5cf6", "#10b981", "#f59e0b", "#ec4899"][i % 4]} />
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="From date" style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} title="To date" style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
          {distinct("createdBy").length > 0 && (
            <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Users</option>
              {distinct("createdBy").map((u) => <option key={u}>{u}</option>)}
            </select>
          )}
          {["projectProjection", "salesToSpec", "specToSales"].includes(cfgKey) && distinct("hod").length > 0 && (
            <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All HOD</option>
              {distinct("hod").map((h) => <option key={h}>{h}</option>)}
            </select>
          )}
          {["salesToSpec"].includes(cfgKey) && distinct("specPerson").length > 0 && (
            <select value={fSpec} onChange={(e) => setFSpec(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Spec Persons</option>
              {distinct("specPerson").map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          {["specToSales"].includes(cfgKey) && distinct("salesPerson").length > 0 && (
            <select value={fSales} onChange={(e) => setFSales(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Sales Persons</option>
              {distinct("salesPerson").map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          {["projectProjection", "salesToSpec", "specToSales"].includes(cfgKey) && distinct("status").length > 0 && (
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Status</option>
              {distinct("status").map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
          {hasCol("city") && distinct("city").length > 0 && (
            <select value={fCity} onChange={(e) => setFCity(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Cities</option>
              {distinct("city").map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
          {hasCol("zone") && distinct("zone").length > 0 && (
            <select value={fZone} onChange={(e) => setFZone(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Zones</option>
              {distinct("zone").map((z) => <option key={z}>{z}</option>)}
            </select>
          )}
          {hasCol("leadSource") && distinct("leadSource").length > 0 && (
            <select value={fLead} onChange={(e) => setFLead(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Lead Sources</option>
              {distinct("leadSource").map((l) => <option key={l}>{l}</option>)}
            </select>
          )}
          {hasCol("assignedTo") && distinct("assignedTo").length > 0 && (
            <select value={fAssign} onChange={(e) => setFAssign(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Assignees</option>
              {distinct("assignedTo").map((a) => <option key={a}>{a}</option>)}
            </select>
          )}
          {["projectProjection", "salesToSpec", "specToSales"].includes(cfgKey) && (
            <button className="btn btn-primary" style={{ padding: "8px 20px", fontWeight: 700 }} onClick={() => setShown(true)}>Show</button>
          )}
        </div>
      )}

      {cfg.tabs && (
        <Tabs
          tabs={cfg.tabs.map((t) => ({
            ...t,
            count: cfg.tabField && !cfg.noTabFilter ? rows.filter((r) => String(r[cfg.tabField]) === t.key).length : null,
          }))}
          active={tab}
          onChange={setTab}
        />
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Loading…</div>
      ) : err ? (
        <div style={{ padding: 24, background: "#fdecec", color: "#c03636", borderRadius: 12, fontWeight: 600 }}>{err}</div>
      ) : (["projectProjection", "salesToSpec", "specToSales"].includes(cfgKey) && !shown) ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Set filters and click <b>Show</b> to view.</div>
      ) : (
        <DataTable
          extraActions={cfgKey === "projectProjection" ? (r) => (
            <span style={{ display: "inline-flex", gap: 4, marginRight: 6 }}>
              <button className="btn" style={{ padding: "3px 8px", fontSize: 11, background: "#e4e8ff", color: "#3949ab" }} onClick={(e) => { e.stopPropagation(); setProjView(r); }}>View</button>
              <button className="btn" style={{ padding: "3px 8px", fontSize: 11, background: "#efe7fb", color: "#8854d0" }} onClick={(e) => { e.stopPropagation(); setFwdRow(r); }}>Forward</button>
            </span>
          ) : cfg.approveFlow ? (r) => (
            <span style={{ display: "inline-flex", gap: 4, marginRight: 6 }}>
              {(cfg.approveFlow || []).filter((st) => st !== r.status).map((st) => (
                <button key={st} className="btn"
                  style={{ padding: "3px 8px", fontSize: 11, background: st.startsWith("Rej") || st === "Reject" ? "#fdecea" : st === "Paid" ? "#e4e8ff" : "#d7f5ea", color: st.startsWith("Rej") || st === "Reject" ? "#c03636" : st === "Paid" ? "#3949ab" : "#00885f" }}
                  onClick={(e) => { e.stopPropagation(); setStatus(r, st); }}>
                  {st}
                </button>
              ))}
            </span>
          ) : undefined}
          columns={shownColumns}
          rows={visible}
          actions={cfg.actions !== false}
          selectable
          onBulkDelete={handleBulkDelete}
          onBulkForward={cfgKey === "projectProjection" ? (ids) => setFwdRow({ bulk: ids.map((id) => rows.find((r) => r._id === id)).filter(Boolean) }) : null}
          onRowClick={cfgKey === "projectProjection" ? (r) => setProjView(r) : (cfg.approveFlow || cfg.isSpecThread) ? (r) => setChatRow(r) : null}
          onDelete={handleDelete}
          onEdit={(cfg.form && cfgKey !== "projectProjection") ? (r) => { setEditing(r); setShowForm(true); } : null}
        />
      )}

      {chatRow && <AdminChatModal row={chatRow} cfgKey={cfgKey} onClose={() => setChatRow(null)} onSent={(updated) => { setRows(rows.map((x) => (x._id === updated._id ? updated : x))); setChatRow(updated); }} />}
      {projView && <AdminProjectView rec={projView} onClose={() => setProjView(null)} />}
      {fwdRow && <AdminProjectForward rec={fwdRow} onClose={() => setFwdRow(null)} onSent={() => setFwdRow(null)} />}

      {rejectFor && (
        <div className="modal-mask" onClick={() => setRejectFor(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>Reject — reason</h3>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 12px" }}>This reason will be sent to {rejectFor.r.createdBy}.</p>
            <textarea rows={3} value={rejectRemark} onChange={(e) => setRejectRemark(e.target.value)} placeholder="Why is this rejected?" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 9, padding: 10, fontSize: 13, marginBottom: 10 }} />
            <label style={{ fontSize: 12.5, fontWeight: 700 }}>Attachment (optional)</label>
            <input type="file" onChange={async (e) => { const f = e.target.files[0]; if (f) { try { const u = await api.uploadPhoto(f, cfgKey); setRejectDoc(u.url); } catch (er) { alert(er.message); } } }} style={{ margin: "6px 0 12px" }} />
            {rejectDoc && <div style={{ fontSize: 12, color: "#1f9d55", marginBottom: 10 }}>✓ Attached</div>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setRejectFor(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { applyStatus(rejectFor.r, rejectFor.status, rejectRemark, rejectDoc); setRejectFor(null); }}>Reject & Send</button>
            </div>
          </div>
        </div>
      )}

      {showColCfg && (
        <div className="modal-mask" onClick={() => setShowColCfg(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3>Header Config — show/hide columns</h3>
            <div style={{ maxHeight: 340, overflowY: "auto", margin: "10px 0" }}>
              {cfg.columns.map((c) => (
                <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", fontSize: 13.5, fontWeight: 600 }}>
                  <input type="checkbox" checked={!hiddenCols.includes(c.key)}
                    onChange={() => setHiddenCols((h) => h.includes(c.key) ? h.filter((k) => k !== c.key) : [...h, c.key])} />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setHiddenCols([])}>Show All</button>
              <button className="btn btn-primary" onClick={() => setShowColCfg(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="modal-mask" onClick={() => setShowLogs(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3>Activity Log — {cfg.title}</h3>
            <div style={{ maxHeight: 360, overflowY: "auto", margin: "10px 0" }}>
              {rows.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>No records yet.</p> :
                rows.slice(0, 50).map((r, i) => (
                  <div key={i} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0", fontSize: 12.5 }}>
                    <b>{r.id || "#" + r._id}</b> · {r.createdBy || "—"} · {r.createdAt || "—"}
                    {r.status ? <span style={{ float: "right", color: "var(--accent)", fontWeight: 700 }}>{r.status}</span> : null}
                  </div>
                ))}
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => setShowLogs(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showForm && cfg.form && (
        <FormModal
          title={editing ? `Edit ${cfg.title}` : (cfg.addLabel || `Add ${cfg.title}`)}
          fields={formFields}
          initial={editing || {}}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function AdminChatModal({ row, cfgKey, onClose, onSent }) {
  const [rec, setRec] = useState(row);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const thread = rec.thread || [];

  const send = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let doc = "";
      if (file) { const u = await api.uploadPhoto(file, cfgKey); doc = u.url; }
      const newThread = [...thread, { by: (auth.user && auth.user.name) || "Admin", text: text.trim(), doc, at: new Date().toLocaleString("en-IN") }];
      const data = { ...rec, thread: newThread }; delete data._id;
      await api.update(cfgKey, rec._id, data);
      // notify the other party
      const other = rec.createdBy;
      if (other) { try { await api.notify({ to: other, title: "Reply on " + (rec.id || cfgKey), message: `${(auth.user && auth.user.name) || "Admin"}: ${text.trim() || "sent a document"}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {} }
      const updated = { ...rec, thread: newThread };
      setRec(updated); onSent(updated); setText(""); setFile(null);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, display: "flex", flexDirection: "column", maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>{rec.id} · {rec.project || rec.name || rec.category || rec.type || ""}</h3>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>{rec.createdBy} {rec.specPerson || rec.salesPerson ? "↔ " + (rec.specPerson || rec.salesPerson) : ""} {rec.help ? "· " + rec.help : ""}</div>
        <div style={{ background: "#f6f8fd", borderRadius: 10, padding: "9px 11px", fontSize: 12, display: "grid", gap: 4, marginBottom: 10 }}>
          {rec.category && <div><b>Category:</b> {rec.category}</div>}
          {rec.type && <div><b>Type:</b> {rec.type}</div>}
          {(rec.amount != null && rec.amount !== "") && <div><b>Amount:</b> ₹{Number(rec.amount).toLocaleString("en-IN")}</div>}
          {(rec.value) && <div><b>Value:</b> ₹{Number(rec.value).toLocaleString("en-IN")}</div>}
          {rec.date && <div><b>Date:</b> {rec.date}</div>}
          {rec.from && <div><b>From:</b> {rec.from}</div>}
          {rec.to && <div><b>To:</b> {rec.to}</div>}
          {rec.mode && <div><b>Mode:</b> {rec.mode}</div>}
          {rec.reason && <div><b>Reason:</b> {rec.reason}</div>}
          {rec.desc && rec.desc !== "--" && <div><b>Description:</b> {rec.desc}</div>}
          {rec.firm && <div><b>Firm:</b> {rec.firm}</div>}
          {rec.city && <div><b>City:</b> {rec.city}</div>}
          {rec.approvedBy && <div><b>Approved By:</b> {rec.approvedBy}</div>}
          {rec.status && <div><b>Status:</b> {rec.status}</div>}
        </div>
        {(rec.photo || (Array.isArray(rec.photos) && rec.photos.length)) && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {[rec.photo, ...(Array.isArray(rec.photos) ? rec.photos : [])].filter(Boolean).map((u, i) => (
              String(u).match(/\.pdf$/i)
                ? <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>📄 Attachment</a>
                : <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: "1px solid #dfe4f0" }} /></a>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "6px 0", minHeight: 160 }}>
          {thread.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 16 }}>No messages yet.</div>}
          {thread.map((m, i) => {
            const mine = m.by === ((auth.user && auth.user.name) || "Admin");
            return (
              <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                <div style={{ background: mine ? "var(--navy)" : "#f0f2fa", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "8px 12px", fontSize: 13 }}>
                  {m.text}
                  {m.doc && (String(m.doc).match(/\.pdf$/i)
                    ? <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 4, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}>📄 View PDF</a>
                    : <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 4 }}><img src={m.doc} alt="" style={{ maxWidth: 150, borderRadius: 8 }} /></a>)}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.by} · {m.at}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 8 }}>
          <label style={{ cursor: "pointer", color: "var(--muted)" }}>📎<input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} /></label>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={file ? file.name : "Type a reply…"} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 20, padding: "9px 14px", fontSize: 13, outline: "none" }} />
          <button className="btn btn-primary" disabled={busy} onClick={send} style={{ borderRadius: 20 }}>Send</button>
        </div>
      </div>
    </div>
  );
}

/* Full Project Projection detail (admin) — shows everything the app captured */
function AdminProjectView({ rec, onClose }) {
  const d = rec || {};
  const Row = ({ l, v }) => v ? <div style={{ marginBottom: 4 }}><b style={{ color: "#64708a" }}>{l}:</b> {v}</div> : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.5)", zIndex: 9999, display: "grid", placeItems: "center", padding: 18 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>{d.projectName || d.name || "Project"}</h2>
          <button className="btn" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <Row l="Project Id" v={d.id} />
          <Row l="Created By" v={d.createdBy} />
          <Row l="Created At" v={d.createdAt} />
          <Row l="Status" v={d.status || "Open"} />
          <Row l="Visit Date" v={d.visitDate} />
          <Row l="Project Type" v={d.projectType} />
          <Row l="City" v={d.city} />
          <Row l="Expected Month" v={d.expectedMonth} />
          <Row l="Approval Status" v={d.approvalStatus} />
          <Row l="Category (Specs)" v={d.category} />
          <Row l="Category Firm" v={d.categoryFirm} />
          <Row l="Spec Person" v={d.specPerson} />
          <Row l="Sales Person" v={d.salesPerson} />
          <Row l="Help / Work" v={d.helpNeeded} />
          <Row l="Sq.Mtr (Win)" v={d.winSqm} />
          <Row l="Sales Done (Win)" v={d.winSales ? "₹" + Number(d.winSales).toLocaleString("en-IN") : ""} />
          <Row l="Status Remark" v={d.statusRemark} />
        </div>

        {(d.contacts || []).length > 0 && <h4 style={{ margin: "14px 0 6px" }}>Contacts</h4>}
        {(d.contacts || []).map((c, i) => (
          <div key={i} style={{ background: "#f4f6fc", borderRadius: 8, padding: 10, marginBottom: 6, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700 }}>{c.category} · {c.firmName}</div>
            {(c.people || []).map((p, j) => <div key={j} style={{ color: "#64708a" }}>{p.person} {p.number ? "· " + p.number : ""} {p.email ? "· " + p.email : ""}</div>)}
          </div>
        ))}

        {(d.items || []).filter((it) => it.grade).length > 0 && <h4 style={{ margin: "14px 0 6px" }}>Products</h4>}
        {(d.items || []).map((it, i) => it.grade && <div key={i} style={{ fontSize: 12.5, color: "#64708a", marginBottom: 3 }}>{it.grade} · {it.colourCode} · Qty {it.qty}</div>)}

        {(d.followups || []).length > 0 && <h4 style={{ margin: "14px 0 6px" }}>Followup History ({d.followups.length})</h4>}
        {(d.followups || []).slice().reverse().map((fu, i) => (
          <div key={i} style={{ borderLeft: "3px solid #3949ab", background: "#f7f9ff", borderRadius: 7, padding: "7px 10px", marginBottom: 5 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>{fu.date}</div>
            <div style={{ fontSize: 12.5 }}>{fu.remark}</div>
            {fu.photo && <img src={fu.photo} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 7, marginTop: 4 }} />}
          </div>
        ))}

        {d.photo && <><h4 style={{ margin: "14px 0 6px" }}>Photo</h4><img src={d.photo} alt="" style={{ maxWidth: "100%", borderRadius: 10 }} /></>}
      </div>
    </div>
  );
}

/* Admin forward project to a user */
function AdminProjectForward({ rec, onClose, onSent }) {
  const projects = rec.bulk ? rec.bulk : [rec];
  const [users, setUsers] = useState([]);
  const [uq, setUq] = useState("");
  const [sel, setSel] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1).map((u) => u.name))).catch(() => {}); }, []);
  const toggle = (u) => setSel((s) => s.includes(u) ? s.filter((x) => x !== u) : [...s, u]);
  const send = async () => {
    if (!sel.length) { alert("Select at least one person"); return; }
    setBusy(true);
    try {
      for (const pr of projects) {
        const fwd = [...(pr.forwards || []), ...sel.map((to) => ({ to, note, by: "Admin", at: new Date().toLocaleString("en-IN") }))];
        await api.update("projectProjection", pr._id, { ...pr, forwards: fwd });
        for (const to of sel) { try { await api.create("notification", { title: "Project Forwarded", message: `Admin forwarded "${pr.projectName}"${note ? ": " + note : ""}`, to, link: "/app/m/projectProjection", at: new Date().toISOString() }); } catch {} }
      }
      onSent();
    } catch (e) { alert(e.message); setBusy(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.5)", zIndex: 9999, display: "grid", placeItems: "center", padding: 18 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 440, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Forward {projects.length > 1 ? projects.length + " Projects" : "Project"}</h3>
        <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>Forward to ({sel.length} selected)</label>
        <input value={uq} onChange={(e) => setUq(e.target.value)} placeholder="Search & pick people…" style={{ width: "100%", padding: "8px 11px", borderRadius: 9, border: "1.5px solid #d7dcef", fontSize: 13, marginBottom: 6 }} />
        {uq.trim() && (
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e3e8f5", borderRadius: 9, marginBottom: 8 }}>
            {users.filter((u) => u.toLowerCase().includes(uq.toLowerCase()) && !sel.includes(u)).map((u) => (
              <div key={u} onClick={() => { toggle(u); setUq(""); }} style={{ padding: "9px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f4f6fc" }}>{u}</div>
            ))}
          </div>
        )}
        {sel.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {sel.map((u) => (
              <span key={u} style={{ background: "#eef1ff", color: "var(--navy)", borderRadius: 16, padding: "5px 10px", fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {u} <span onClick={() => toggle(u)} style={{ cursor: "pointer", color: "#c03636" }}>✕</span>
              </span>
            ))}
          </div>
        )}
        <label style={{ fontWeight: 700, fontSize: 13 }}>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: "100%", padding: 10, borderRadius: 9, border: "1.5px solid #d7dcef", marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-primary" onClick={send} disabled={busy || !sel.length} style={{ flex: 1 }}>{busy ? "Sending…" : `Forward to ${sel.length}`}</button>
        </div>
      </div>
    </div>
  );
}
