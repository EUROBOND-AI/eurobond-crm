import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Paperclip, CheckCircle2, XCircle, FileText } from "lucide-react";
import { PageHead, Pill } from "../components/ui.jsx";
import { api, auth } from "../lib/api.js";

export default function SpecApprovalPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("Pending");

  const load = () => {
    setLoading(true);
    api.list("specApproval")
      .then((d) => {
        const rs = (d.records || []).map((r) => ({ _id: r.id, ...r.data }));
        setRows(rs);
        setActive((a) => (a ? rs.find((x) => x._id === a._id) || null : null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = rows.filter((r) => (r.status || "Pending") === tab);

  return (
    <>
      <PageHead crumb="SFA / Spec Approval" title="Specification Approvals" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["Pending", "Approved", "Rejected"].map((t) => (
          <button key={t} className={"btn " + (tab === t ? "btn-primary" : "btn-ghost")} onClick={() => setTab(t)}>
            {t} ({rows.filter((r) => (r.status || "Pending") === t).length})
          </button>
        ))}
      </div>

      {loading ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
      : filtered.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>No {tab.toLowerCase()} spec requests.</div>
      : (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((r) => (
              <button key={r._id} onClick={() => setActive(r)}
                className="chart-card card-pad" style={{ textAlign: "left", cursor: "pointer", border: active && active._id === r._id ? "2px solid var(--navy)" : "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <b style={{ fontSize: 13.5 }}>{r.id} · {r.project}</b>
                  <Pill status={r.status || "Pending"} />
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  From {r.createdBy} → {r.specPerson}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.help}</div>
              </button>
            ))}
          </div>
          {active ? <SpecThread key={active._id} rec={active} onChange={load} /> : (
            <div className="chart-card card-pad" style={{ display: "grid", placeItems: "center", color: "var(--muted)", minHeight: 300 }}>
              Select a request to view the conversation
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SpecThread({ rec, onChange }) {
  const me = auth.user || {};
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const thread = rec.thread || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [rec]);

  const send = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    try {
      let docUrl = "";
      if (file) { const u = await api.uploadPhoto(file, "specApproval"); docUrl = u.url; }
      const msg = { by: me.name, role: "spec", text: text.trim(), doc: docUrl, at: new Date().toLocaleString("en-IN") };
      const newThread = [...thread, msg];
      await api.update("specApproval", rec._id, { ...stripId(rec), thread: newThread });
      // notify the sales person who raised it
      try { await api.notify({ to: rec.createdBy, title: "Reply on spec " + rec.id, message: `${me.name}: ${text.trim() || "sent a document"}`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
      setText(""); setFile(null);
      onChange();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const decide = async (status) => {
    setBusy(true);
    try {
      await api.update("specApproval", rec._id, { ...stripId(rec), status });
      try { await api.notify({ to: rec.createdBy, title: "Spec " + rec.id + " " + status, message: `Your specification request for "${rec.project}" was ${status.toLowerCase()}.`, createdAt: new Date().toLocaleString("en-IN") }); } catch {}
      onChange();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div className="chart-card card-pad" style={{ display: "flex", flexDirection: "column", minHeight: 460 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 12 }}>
        <div>
          <h4 style={{ margin: 0 }}>{rec.id} · {rec.project}</h4>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>Raised by {rec.createdBy} · Tagged: {rec.specPerson}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}><b>Help needed:</b> {rec.help}</div>
        </div>
        <Pill status={rec.status || "Pending"} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, maxHeight: 320 }}>
        {thread.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 20 }}>No messages yet. Start the conversation below.</div>}
        {thread.map((m, i) => {
          const mine = m.by === me.name;
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
              <div style={{ background: mine ? "var(--navy)" : "#f0f2fa", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "9px 13px", fontSize: 13 }}>
                {m.text}
                {m.doc && <a href={m.doc} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, color: mine ? "#cfe0ff" : "var(--accent)", fontSize: 12, fontWeight: 700 }}><FileText size={13} /> View document</a>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.by} · {m.at}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {(rec.status || "Pending") === "Pending" && (
        <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
          <button className="btn" style={{ background: "#d7f5ea", color: "#00885f", flex: 1 }} disabled={busy} onClick={() => decide("Approved")}><CheckCircle2 size={15} /> Approve</button>
          <button className="btn btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => decide("Rejected")}><XCircle size={15} /> Reject</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <label style={{ cursor: "pointer", color: "var(--muted)" }}>
          <Paperclip size={18} />
          <input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files[0])} />
        </label>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={file ? file.name : "Type a reply…"} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 20, padding: "10px 14px", fontSize: 13, outline: "none" }} />
        <button className="btn btn-primary" disabled={busy} onClick={send} style={{ borderRadius: 20 }}><Send size={15} /></button>
      </div>
    </div>
  );
}

function stripId(r) { const c = { ...r }; delete c._id; return c; }
