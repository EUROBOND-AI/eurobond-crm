import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CloudOff, RefreshCw, Plus, Upload, FileText, Trash2, Pencil, Eye, MessageSquare } from "lucide-react";
import { api } from "../lib/api.js";
import { visibleUsers } from "../lib/scope.js";
import { MultiPeople, MultiFiles } from "./FormBits.jsx";
import { can } from "../lib/perms.js";

export function PageHead({ crumb, title, actions, note }) {
  return (
    <div className="page-head">
      <div>
        <div className="crumb">
          <span className="back">‹ Back</span>
          <span>{crumb || title}</span>
        </div>
        <h1 className="page-title">{title}</h1>
        {/* a line under the title for pages that need to say who to go to */}
        {note && <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>{note}</div>}
      </div>
      <div className="head-actions">{actions}</div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-row">
      {tabs.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? "active" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, sub, color = "#6c5ce7" }) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <span className="glow" style={{ background: color }} />
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Pill({ status }) {
  const s = String(status).toLowerCase();
  let cls = "pill-gray";
  if (["approved", "win", "complete", "paid", "active", "published", "present"].some((k) => s.includes(k))) cls = "pill-green";
  else if (["pending", "inprocess", "hold", "medium", "draft", "upcoming"].some((k) => s.includes(k))) cls = "pill-amber";
  else if (["reject", "lost", "absent", "high", "close", "junk", "cancel"].some((k) => s.includes(k))) cls = "pill-red";
  else if (["low", "assigned", "submitted"].some((k) => s.includes(k))) cls = "pill-blue";
  return <span className={`pill ${cls}`}>{status}</span>;
}

export function EmptyState() {
  return (
    <div className="empty-state">
      <CloudOff size={44} style={{ opacity: 0.35, marginBottom: 10 }} />
      <h3>No data to display</h3>
      <p>Once data is available, it will appear here.</p>
    </div>
  );
}

// Generic filterable table used across every module
export function DataTable({ columns, rows, onDelete, onEdit, onView, onChat, onRowClick, onBulkDelete, onBulkForward, selectable, actions = true, extraActions }) {
  const [filters, setFilters] = useState({});
  const [sel, setSel] = useState(new Set());
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        columns.every((c) => {
          const f = (filters[c.key] || "").toLowerCase();
          if (!f) return true;
          return String(r[c.key] ?? "").toLowerCase().includes(f);
        })
      ),
    [rows, filters, columns]
  );
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = filtered.length > 0 && filtered.every((r) => sel.has(r._id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(filtered.map((r) => r._id)));

  return (
    <div className="card">
      {selectable && sel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "linear-gradient(135deg,#eef1ff,#f4ecff)", borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "var(--accent)" }}>{sel.size} selected</span>
          {onBulkDelete && <button className="btn btn-danger" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => { onBulkDelete([...sel]); setSel(new Set()); }}>Delete Selected</button>}
          {onBulkForward && <button className="btn" style={{ padding: "5px 12px", fontSize: 12, background: "#efe7fb", color: "#8854d0" }} onClick={() => onBulkForward([...sel])}>Forward Selected</button>}
          <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              {selectable && <th style={{ width: 40 }}><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>}
              <th style={{ width: 54 }}>S.No</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {actions && <th>Action</th>}
            </tr>
            <tr className="filter-row">
              {selectable && <th />}
              <th />
              {columns.map((c) => (
                <th key={c.key}>
                  {c.filter !== false && (
                    <input
                      placeholder="Search..."
                      value={filters[c.key] || ""}
                      onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}
                    />
                  )}
                </th>
              ))}
              {actions && <th />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className={onRowClick ? "row-click" : ""}>
                {selectable && <td><input type="checkbox" checked={sel.has(r._id)} onChange={() => toggle(r._id)} /></td>}
                <td onClick={() => onRowClick && onRowClick(r)} style={onRowClick ? { cursor: "pointer" } : undefined}>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key} onClick={() => onRowClick && onRowClick(r)} style={onRowClick ? { cursor: "pointer" } : undefined}>{c.render ? c.render(r[c.key], r) : r[c.key] ?? "--"}</td>
                ))}
                {actions && (
                  <td>
                  {extraActions && extraActions(r)}
                    <div style={{ display: "flex", gap: 7 }}>
                      {onView && <button className="btn btn-soft" style={{ padding: "6px 8px" }} onClick={() => onView(r)}><Eye size={14} /></button>}
                      {/* the conversation on this row — clicking the row opens
                          it too, but that is not something anyone can see */}
                      {onChat && (
                        <button className="btn btn-soft" title="Messages" style={{ padding: "6px 8px", background: "#eef1ff", color: "var(--accent)", position: "relative" }}
                          onClick={() => onChat(r)}>
                          <MessageSquare size={14} />
                          {(r.thread || []).length > 0 && (
                            <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 800 }}>{(r.thread || []).length}</span>
                          )}
                        </button>
                      )}
                      {onEdit && <button className="btn" style={{ padding: "6px 8px", background: "#e2f8f1", color: "#00b894" }} onClick={() => onEdit(r)}><Pencil size={14} /></button>}
                      {onDelete && <button className="btn btn-danger" style={{ padding: "6px 8px" }} onClick={() => onDelete(r)}><Trash2 size={14} /></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState />}
      </div>
      {/* the real pager sits under the table on each page — this row only
          looked like one and never paged anything */}
    </div>
  );
}

export function ToolButtons({ onAdd, addLabel = "Add", onRefresh, onExport, onImport, onDownloadFormat, onHeaderConfig, onLogs, onReport, refreshing, module }) {
  /* Roles & Permission decides which of these a role may use. Pass the module
     name and the buttons that are switched off simply do not appear. */
  const allow = (action) => (module ? can(module, action) : true);
  /* "Working…" while an import/export runs, so a slow one doesn't look stuck */
  const [runImp, setRunImp] = useState(false);
  const [runExp, setRunExp] = useState(false);
  const wrap = (fn, setFlag) => async () => {
    setFlag(true);
    try { await fn(); } catch (e) { alert(e.message || String(e)); }
    setFlag(false);
  };
  return (
    <>
      <button className="btn btn-pink" onClick={onHeaderConfig}><Eye size={14} /> Header Config</button>
      <button className="btn btn-soft" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw size={14} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh"}
      </button>
      {onReport && <button className="btn btn-ghost" onClick={onReport}><FileText size={14} /> View Report</button>}
      {onAdd && allow("Add") && <button className="btn btn-primary" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}
      {onImport && allow("Import") && <button className="btn btn-soft" disabled={runImp} onClick={wrap(onImport, setRunImp)}>
        <Upload size={14} /> {runImp ? "Importing…" : "Import"}
      </button>}
      {onDownloadFormat && allow("Import") && <button className="btn btn-ghost" onClick={onDownloadFormat}><Upload size={14} /> Download Format</button>}
      {onExport && allow("Export") && <button className="btn btn-soft" disabled={runExp} onClick={wrap(onExport, setRunExp)}>
        <FileText size={14} /> {runExp ? "Exporting…" : "Export"}
      </button>}
    </>
  );
}

// Generic modal form built from field definitions
export function FormModal({ title, fields, onClose, onSave, initial }) {
  const [values, setValues] = useState(initial || {});
  const [userPeople, setUserPeople] = useState([]);
  /* Narrowing a people field by state.

     Every person in the business was listed in one dropdown, which on a company
     this size means scrolling past hundreds of names to find one colleague. A
     form can offer a State field of its own (optionsSource "userStates"); once
     a state is chosen, the people field below it lists only the people in that
     state. Left blank it lists everyone, so nothing is forced. */
  const userStates = useMemo(
    () => [...new Set(userPeople.map((u) => (u.state || "").trim()).filter(Boolean))].sort(),
    [userPeople]
  );
  const byState = String(values.assignState || "").trim();
  const userOpts = useMemo(() => {
    const pick = byState ? userPeople.filter((u) => (u.state || "").trim() === byState) : userPeople;
    return [...new Set(pick.map((u) => u.name).filter(Boolean))].sort();
  }, [userPeople, byState]);
  const [upBusy, setUpBusy] = useState("");
  const [saving, setSaving] = useState(false);
  /* The required fields that were left empty on the last attempt to save.

     A required field was marked with a star and then not checked, so a form
     saved without it and the row arrived incomplete — a customer with no firm
     name, for instance, which nothing downstream could match. Save now stops
     and the fields that are missing are outlined in red. */
  const [missing, setMissing] = useState([]);

  useEffect(() => {
    if (fields.some((f) => f.optionsSource === "users")) {
      /* the whole person is kept, not just the name, so a field can be narrowed
         by their state (see byState below) */
      api.listUsers().then((d) => setUserPeople(visibleUsers((d.users || []).filter((u) => u.status == 1)))).catch(() => {});
    }
  }, []);

  const uploadFile = async (name, file) => {
    if (!file) return;
    setUpBusy(name);
    try { const u = await api.uploadPhoto(file, "form"); setValues((v) => ({ ...v, [name]: u.url })); }
    catch (e) { alert("Upload failed: " + e.message); }
    setUpBusy("");
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="form-grid">
          {fields.map((f) => (
            <div key={f.name} className={`field ${f.full ? "full" : ""}`}
              data-missing={missing.includes(f.name) ? "1" : undefined}>
              <label style={{ color: missing.includes(f.name) ? "#c0392b" : undefined }}>
                {f.label} {f.required && <b style={{ color: "#c0392b" }}>*</b>}
              </label>
              {f.type === "select" || f.optionsSource === "users" || f.optionsSource === "userStates" ? (
                <select value={values[f.name] || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    /* The state only decides which names are offered; whoever
                       has already been picked stays. It used to clear them,
                       which made it impossible to put people from two states on
                       the same task — choosing the second state dropped the
                       first person. */
                    setValues({ ...values, [f.name]: v });
                  }}>
                  <option value="">{f.optionsSource === "userStates" ? "All states" : "Select an option"}</option>
                  {(f.optionsSource === "users" ? userOpts
                    : f.optionsSource === "userStates" ? userStates
                    : (f.options || [])).map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : f.type === "multiuser" ? (
                <MultiPeople value={values[f.name]} listValue={values[f.name + "List"]}
                  options={userOpts}
                  onChange={(line, list) => setValues({ ...values, [f.name]: line, [f.name + "List"]: list })} />
              ) : f.type === "files" ? (
                <MultiFiles value={values[f.name]} onChange={(list) => setValues({ ...values, [f.name]: list })} />
              ) : f.type === "textarea" ? (
                <textarea rows={3} value={values[f.name] || ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              ) : f.type === "file" ? (
                <div>
                  <input type="file" onChange={(e) => uploadFile(f.name, e.target.files[0])} />
                  {upBusy === f.name && <span style={{ fontSize: 12, color: "var(--muted)" }}> Uploading…</span>}
                  {values[f.name] && <a href={values[f.name]} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 12, marginLeft: 6 }}>View</a>}
                </div>
              ) : (
                <input type={f.type || "text"} placeholder={f.label} value={values[f.name] || ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn btn-danger" onClick={onClose}>Cancel</button>
          {missing.length > 0 && (
            <div style={{ flex: 1, color: "#c0392b", fontSize: 12.5, fontWeight: 700, alignSelf: "center" }}>
              Please fill: {missing.map((n) => (fields.find((f) => f.name === n) || {}).label || n).join(", ")}
            </div>
          )}
          {/* Save waits for the save.

              It used to fire and forget: the button looked untouched while the
              row was on its way, so on a slow connection people pressed it
              again or left not knowing whether it had been added. */}
          <button className="btn btn-primary" disabled={saving || !!upBusy}
            onClick={async () => {
              if (!onSave) { onClose(); return; }
              const empty = fields.filter((f) => {
                if (!f.required) return false;
                const v = values[f.name];
                if (Array.isArray(v)) return v.length === 0;
                return v === undefined || v === null || String(v).trim() === "";
              }).map((f) => f.name);
              setMissing(empty);
              if (empty.length) {
                /* said out loud as well as marked: a message at the foot of a
                   long form is read after the scroll, not before */
                const names = empty.map((n) => (fields.find((f) => f.name === n) || {}).label || n);
                alert(names.length === 1
                  ? `${names[0]} is required.`
                  : `Please fill these fields:\n\n• ${names.join("\n• ")}`);
                return;
              }
              setSaving(true);
              try { await onSave(values); } finally { setSaving(false); }
            }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export function FooterNote() {
  return (
    <p className="footer-note">
      Copyright ©2026 <b>Eurobond CRM</b> · Developed and Designed by <b>Karthik G</b>
    </p>
  );
}


/* A long line kept to one row until it is asked for.

   Addresses and the "what is needed" notes run to a couple of hundred
   characters, which pushed every other column off the screen. The first words
   are shown with a "read more" that opens the rest in place. */
export function LongText({ text, at = 40 }) {
  const [open, setOpen] = useState(false);
  const t = String(text ?? "").trim();
  if (!t) return "—";
  if (t.length <= at) return t;
  /* Opened, the text wraps down the cell instead of running off to the right.
     Table cells are set never to wrap, which turned a three-hundred word note
     into one endless line and dragged the whole table sideways — so the rule is
     turned off here, inside a column of its own width. "read more" sits on its
     own line underneath. */
  return (
    <span data-longtext style={{ display: "inline-block", width: 240, maxWidth: 240, fontSize: 12.5, lineHeight: 1.55,
      whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" }}>
      {open ? t : t.slice(0, at) + "…"}
      <span onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{ display: "block", marginTop: 3, color: "var(--accent)", cursor: "pointer", fontWeight: 700, fontSize: 11.5 }}>
        {open ? "less" : "read more"}
      </span>
    </span>
  );
}
