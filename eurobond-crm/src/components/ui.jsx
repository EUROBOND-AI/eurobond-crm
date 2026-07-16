import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CloudOff, RefreshCw, Plus, Upload, FileText, Trash2, Pencil, Eye } from "lucide-react";
import { api } from "../lib/api.js";

export function PageHead({ crumb, title, actions }) {
  return (
    <div className="page-head">
      <div>
        <div className="crumb">
          <span className="back">‹ Back</span>
          <span>{crumb || title}</span>
        </div>
        <h1 className="page-title">{title}</h1>
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
    <div className="stat-card">
      <span className="glow" style={{ background: color }} />
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
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
export function DataTable({ columns, rows, onDelete, onEdit, onView, actions = true, extraActions }) {
  const [filters, setFilters] = useState({});
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

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 54 }}>S.No</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {actions && <th>Action</th>}
            </tr>
            <tr className="filter-row">
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
              <tr key={i}>
                <td>{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r[c.key], r) : r[c.key] ?? "--"}</td>
                ))}
                {actions && (
                  <td>
                  {extraActions && extraActions(r)}
                    <div style={{ display: "flex", gap: 7 }}>
                      {onView && <button className="btn btn-soft" style={{ padding: "6px 8px" }} onClick={() => onView(r)}><Eye size={14} /></button>}
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
      <div className="table-foot">
        Showing <b>1</b> to <b>{filtered.length}</b> of <b>{filtered.length}</b> entries →
        <div className="pager">
          <ChevronLeft size={16} /> Go to <input defaultValue={1} /> page <ChevronRight size={16} />
        </div>
      </div>
    </div>
  );
}

export function ToolButtons({ onAdd, addLabel = "Add", onRefresh, onExport, onImport, onHeaderConfig, onLogs, onReport, refreshing }) {
  return (
    <>
      <button className="btn btn-pink" onClick={onHeaderConfig}><Eye size={14} /> Header Config</button>
      <button className="btn btn-soft" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw size={14} className={refreshing ? "spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh"}
      </button>
      <button className="btn btn-ghost" onClick={onLogs}><FileText size={14} /> Logs</button>
      {onAdd && <button className="btn btn-primary" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}
      {onImport && <button className="btn btn-soft" onClick={onImport}><Upload size={14} /> Import</button>}
      {onExport && <button className="btn btn-soft" onClick={onExport}><FileText size={14} /> Export</button>}
      <button className="btn btn-soft" onClick={onReport}><FileText size={14} /> View Report</button>
    </>
  );
}

// Generic modal form built from field definitions
export function FormModal({ title, fields, onClose, onSave, initial }) {
  const [values, setValues] = useState(initial || {});
  const [userOpts, setUserOpts] = useState([]);
  const [upBusy, setUpBusy] = useState("");

  useEffect(() => {
    if (fields.some((f) => f.optionsSource === "users")) {
      api.listUsers().then((d) => setUserOpts((d.users || []).map((u) => u.name))).catch(() => {});
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
            <div key={f.name} className={`field ${f.full ? "full" : ""}`}>
              <label>{f.label} {f.required && <b>*</b>}</label>
              {f.type === "select" || f.optionsSource === "users" ? (
                <select value={values[f.name] || ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                  <option value="">Select an option</option>
                  {(f.optionsSource === "users" ? userOpts : (f.options || [])).map((o) => <option key={o}>{o}</option>)}
                </select>
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
          <button className="btn btn-primary" onClick={() => { onSave ? onSave(values) : onClose(); }}>Save</button>
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
