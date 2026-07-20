import { useEffect, useMemo, useState } from "react";

import { MODULES } from "./moduleConfigs.jsx";
import { PageHead, Tabs, DataTable, ToolButtons, FormModal, StatCard } from "../components/ui.jsx";
import { api, auth } from "../lib/api.js";

export default function ModulePage({ cfgKey }) {
  const cfg = MODULES[cfgKey];
  const [tab, setTab] = useState(cfg.tabs?.[0]?.key);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [userNames, setUserNames] = useState([]);

  useEffect(() => {
    if (!(cfg.form || []).some((f) => f.optionsSource === "users")) return;
    api.listUsers().then((d) => setUserNames((d.users || []).filter((u) => u.status == 1).map((u) => u.name))).catch(() => {});
  }, [cfgKey]);

  const formFields = useMemo(
    () => (cfg.form || []).map((f) => (f.optionsSource === "users" ? { ...f, options: userNames } : f)),
    [cfg, userNames]
  );

  useEffect(() => { setTab(cfg.tabs?.[0]?.key); }, [cfgKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr("");
    api.list(cfgKey)
      .then((d) => { if (alive) setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cfgKey]);

  const [fUser, setFUser] = useState("");
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

  const knownTabs = (cfg.tabs || []).map((t) => t.key);
  const firstTab = cfg.tabs?.[0]?.key;

  const visible = useMemo(() => {
    let list = rows;
    if (fUser) list = list.filter((r) => (r.createdBy || "") === fUser);
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
    if (fAssign) list = list.filter((r) => (r.assignedTo || "") === fAssign);
    if (!cfg.tabField || cfg.noTabFilter) return list;
    return list.filter((r) => {
      const st = String(r[cfg.tabField] ?? "");
      if (st === tab) return true;
      // records with unknown/old status appear under the first tab
      return tab === firstTab && !knownTabs.includes(st);
    });
  }, [rows, tab, cfg, fUser, fCity, fZone, fLead, fAssign, fFrom, fTo]);

  const distinct = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];
  const hasCol = (key) => cfg.columns.some((c) => c.key === key);

  const [refreshing, setRefreshing] = useState(false);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [rejectDoc, setRejectDoc] = useState("");
  const [chatRow, setChatRow] = useState(null);
  const [hiddenCols, setHiddenCols] = useState([]);
  const [showColCfg, setShowColCfg] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const reload = () => {
    setRefreshing(true); setErr("");
    api.list(cfgKey)
      .then((d) => setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))))
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
            onHeaderConfig={() => setShowColCfg(true)}
            onLogs={() => setShowLogs(true)}
            onReport={viewReport}
          />
        }
      />
      {cfg.tabs && cfg.tabField && !cfg.noTabFilter && !loading && (
        <div className="stat-row">
          <StatCard label="Total" value={rows.length} sub="All records" />
          {cfg.tabs.slice(0, 4).map((t) => (
            <StatCard key={t.key} label={t.label} value={rows.filter((r) => String(r[cfg.tabField]) === t.key).length} sub={t.label + " records"} />
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="From date" style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} title="To date" style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
          {distinct("createdBy").length > 0 && (
            <select value={fUser} onChange={(e) => setFUser(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }}>
              <option value="">All Sales Persons</option>
              {distinct("createdBy").map((u) => <option key={u}>{u}</option>)}
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
      ) : (
        <DataTable
          extraActions={(cfg.approveFlow || cfg.isSpecThread) ? (r) => (
            <span style={{ display: "inline-flex", gap: 4, marginRight: 6 }}>
              {cfg.isSpecThread && (
                <button className="btn" style={{ padding: "3px 8px", fontSize: 11, background: "#eef1ff", color: "#3949ab" }} onClick={() => setChatRow(r)}>💬 Chat</button>
              )}
              {(cfg.approveFlow || []).filter((st) => st !== r.status).map((st) => (
                <button key={st} className="btn"
                  style={{ padding: "3px 8px", fontSize: 11, background: st.startsWith("Rej") || st === "Reject" ? "#fdecea" : st === "Paid" ? "#e4e8ff" : "#d7f5ea", color: st.startsWith("Rej") || st === "Reject" ? "#c03636" : st === "Paid" ? "#3949ab" : "#00885f" }}
                  onClick={() => setStatus(r, st)}>
                  {st}
                </button>
              ))}
            </span>
          ) : undefined}
          columns={shownColumns}
          rows={visible}
          actions={cfg.actions !== false}
          onDelete={handleDelete}
          onEdit={cfg.form ? (r) => { setEditing(r); setShowForm(true); } : null}
        />
      )}

      {chatRow && <AdminChatModal row={chatRow} cfgKey={cfgKey} onClose={() => setChatRow(null)} onSent={(updated) => { setRows(rows.map((x) => (x._id === updated._id ? updated : x))); setChatRow(updated); }} />}

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
        <h3 style={{ marginBottom: 4 }}>{rec.id} · {rec.project || ""}</h3>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>{rec.createdBy} ↔ {rec.specPerson || rec.salesPerson || ""} · {rec.help || ""}</div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "6px 0", minHeight: 160 }}>
          {thread.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: 16 }}>No messages yet.</div>}
          {thread.map((m, i) => {
            const mine = m.by === ((auth.user && auth.user.name) || "Admin");
            return (
              <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                <div style={{ background: mine ? "var(--navy)" : "#f0f2fa", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "8px 12px", fontSize: 13 }}>
                  {m.text}
                  {m.doc && <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 4, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}>📎 View document</a>}
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
