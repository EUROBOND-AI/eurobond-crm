import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/ui.jsx";
import { api } from "../lib/api.js";

const sel = { padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12.5, background: "#fff" };
const th = { padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" };
const td = { padding: "9px 12px", fontSize: 12.5, borderTop: "1px solid #f0f2f8" };

/* turn a long user-agent into something readable */
function phoneOf(ua) {
  const s = String(ua || "");
  const m = s.match(/Android[^;)]*;\s*([^;)]+)\s*(?:Build|\))/i);
  if (m && m[1]) return m[1].trim();
  if (/iPhone/i.test(s)) return "iPhone";
  if (/Windows/i.test(s)) return "Windows PC";
  if (/Macintosh/i.test(s)) return "Mac";
  return s ? s.slice(0, 40) : "—";
}
const osOf = (ua) => (/Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : "—");

export default function LoginHistory() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [user, setUser] = useState("");
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [multi, setMulti] = useState({});
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.status == 1))).catch(() => {}); }, []);

  const show = async () => {
    setBusy(true); setShown(true);
    try {
      const d = await api.loginHistory({ from, to, user });
      setRows(d.logins || []);
      setMulti(d.multiDevice || {});
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const exportCsv = () => {
    const head = ["Date & Time", "User", "Phone / Device", "OS", "IP Address"];
    const body = rows.map((r) => [String(r.at || "").replace("T", " "), r.user_name, phoneOf(r.device), osOf(r.device), r.ip]);
    const csv = [head, ...body].map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `login-history-${from}-to-${to}.csv`;
    a.click();
  };

  const multiList = useMemo(() => Object.entries(multi), [multi]);

  return (
    <div>
      <PageHead crumb="Master / Logs" title="Login History" />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16, background: "#fff", padding: 12, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={sel} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={sel} />
        <select value={user} onChange={(e) => setUser(e.target.value)} style={sel}>
          <option value="">All Users</option>{users.map((u) => <option key={u.name}>{u.name}</option>)}
        </select>
        <button className="btn btn-primary" style={{ padding: "8px 22px", fontWeight: 700 }} onClick={show} disabled={busy}>
          {busy ? "Loading…" : "Show"}
        </button>
        {shown && rows.length > 0 && <button className="btn btn-soft" onClick={exportCsv}>⬇ CSV</button>}
      </div>

      {shown && multiList.length > 0 && (
        <div style={{ background: "#fff7e6", border: "1px solid #ffd591", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, color: "#ad6800", marginBottom: 6 }}>⚠️ Signed in from more than one device</div>
          <div style={{ fontSize: 13 }}>
            {multiList.map(([n, c]) => <span key={n} style={{ marginRight: 14 }}><b>{n}</b> — {c} devices</span>)}
          </div>
        </div>
      )}

      {!shown ? (
        <div style={{ padding: 50, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>
          Choose a date range and click <b>Show</b>.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "var(--shadow)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f7f9ff" }}>
              <tr>{["S.No", "Date & Time", "User", "Phone / Device", "OS", "IP Address"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>No logins in this period.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id || i}>
                  <td style={{ ...td, color: "var(--muted)", fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{String(r.at || "").replace("T", " ")}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{r.user_name || "—"}</td>
                  <td style={td}>{phoneOf(r.device)}</td>
                  <td style={td}>{osOf(r.device)}</td>
                  <td style={{ ...td, fontFamily: "monospace" }}>{r.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
