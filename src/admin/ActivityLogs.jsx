import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const sel = { padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12.5, background: "#fff" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12.5, borderTop: "1px solid #f0f2f8", whiteSpace: "nowrap" };

export default function ActivityLogs() {
  const today = new Date().toISOString().slice(0, 10);
  const [users, setUsers] = useState([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [user, setUser] = useState("");
  const [hod, setHod] = useState("");
  const [role, setRole] = useState("");
  const [tab, setTab] = useState("detail");        // detail | summary
  const [rows, setRows] = useState([]);
  const [sum, setSum] = useState([]);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(new Set());

  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const show = async () => {
    setBusy(true); setShown(true);
    try {
      const q = { from, to, user, hod, role };
      const [d, s] = await Promise.all([
        api.activityList(q).catch(() => ({ logs: [] })),
        api.activitySummary({ from, to }).catch(() => ({ summary: [] })),
      ]);
      setRows(d.logs || []);
      setSel(new Set());
      setSum(s.summary || []);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const hods = useMemo(() => [...new Set(users.map((u) => u.manager).filter(Boolean))].sort(), [users]);
  const roles = useMemo(() => [...new Set(users.map((u) => u.role).filter(Boolean))].sort(), [users]);

  const exportCsv = () => {
    const head = ["Date & Time", "User", "Role", "HOD", "State", "Module", "Screen", "Source"];
    const body = rows.map((r) => [r.opened_at, r.user_name, r.user_role, r.hod, r.state, r.module, r.screen, r.source]);
    const csv = [head, ...body].map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `activity-${from}-to-${to}.csv`;
    a.click();
  };

  return (
    <div>
      <PageHead crumb="Master / Logs" title="Activity Logs" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16, background: "#fff", padding: 12, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={sel} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={sel} />
        <select value={hod} onChange={(e) => setHod(e.target.value)} style={sel}>
          <option value="">All HOD</option>{hods.map((h) => <option key={h}>{h}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={sel}>
          <option value="">All Roles</option>{roles.map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={user} onChange={(e) => setUser(e.target.value)} style={sel}>
          <option value="">All Users</option>{users.map((u) => <option key={u.name}>{u.name}</option>)}
        </select>
        <button className="btn btn-primary" style={{ padding: "8px 22px", fontWeight: 700 }} onClick={show} disabled={busy}>
          {busy ? "Loading…" : "Show"}
        </button>
        {shown && <button className="btn btn-soft" onClick={exportCsv}>⬇ CSV</button>}
        {shown && sel.size > 0 && (
          <button className="btn btn-danger" onClick={async () => {
            if (!window.confirm(`Delete ${sel.size} selected log entr${sel.size === 1 ? "y" : "ies"}?`)) return;
            try { await api.activityDeleteMany([...sel]); setRows((x) => x.filter((y) => !sel.has(y.id))); setSel(new Set()); }
            catch (e) { alert(e.message); }
          }}>🗑 Delete Selected ({sel.size})</button>
        )}
      </div>

      {!shown ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
          Choose your filters and click <b>Show</b>.
        </div>
      ) : (
        <>
          <div style={{ display: "inline-flex", background: "#eef1ff", borderRadius: 10, padding: 3, marginBottom: 14 }}>
            {[["detail", `Detail (${rows.length})`], ["summary", `Per Person (${sum.length})`]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: tab === k ? "var(--navy)" : "transparent", color: tab === k ? "#fff" : "var(--navy)" }}>{label}</button>
            ))}
          </div>

          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
            {tab === "detail" ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f7f9ff" }}>
                  <tr>
                    <th style={th}>
                      <input type="checkbox"
                        checked={rows.length > 0 && sel.size === rows.length}
                        onChange={(e) => setSel(e.target.checked ? new Set(rows.map((x) => x.id)) : new Set())} />
                    </th>
                    {["Date & Time", "User", "Role", "HOD", "State", "Module", "Screen", "From", "Action"].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No activity for these filters.</td></tr>
                  ) : rows.map((r, i) => (
                    <tr key={i} style={{ background: sel.has(r.id) ? "#f2f6ff" : "transparent" }}>
                      <td style={td}>
                        <input type="checkbox" checked={sel.has(r.id)}
                          onChange={(e) => setSel((s2) => { const n = new Set(s2); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} />
                      </td>
                      <td style={td}>{String(r.opened_at || "").replace("T", " ")}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.user_name || "—"}</td>
                      <td style={td}>{r.user_role || "—"}</td>
                      <td style={td}>{r.hod || "—"}</td>
                      <td style={td}>{r.state || "—"}</td>
                      <td style={td}>{r.module || "—"}</td>
                      <td style={{ ...td, color: "var(--muted)" }}>{r.screen || "—"}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: r.source === "admin" ? "#e4f3ff" : "#e7f7ef", color: r.source === "admin" ? "#0b6cb0" : "#0f7a44" }}>
                          {r.source === "admin" ? "Admin" : "App"}
                        </span>
                      </td>
                      <td style={td}>
                        <button className="btn btn-danger" style={{ padding: "3px 9px", fontSize: 11 }}
                          onClick={async () => {
                            if (!window.confirm("Delete this log entry?")) return;
                            try { await api.activityDelete(r.id); setRows((x) => x.filter((y) => y.id !== r.id)); }
                            catch (e) { alert(e.message); }
                          }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f7f9ff" }}>
                  <tr>{["User", "Role", "HOD", "Screens Opened", "Modules Used", "Last Seen"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sum.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No activity for this period.</td></tr>
                  ) : sum.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 700 }}>{r.user_name || "—"}</td>
                      <td style={td}>{r.user_role || "—"}</td>
                      <td style={td}>{r.hod || "—"}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{r.opens}</td>
                      <td style={td}>{r.modules}</td>
                      <td style={td}>{String(r.last_seen || "").replace("T", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
