/* Biltrax projects assigned to this person. Read-only detail view — the field
   team sees the project information they need on site, nothing else. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../lib/api.js";

const inp = { width: "100%", marginBottom: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid #d7dcef", fontSize: 13 };
const lbl = { fontSize: 12, fontWeight: 700 };

const CU = () => auth.user || {};
const card = { background: "#fff", borderRadius: 13, padding: 13, marginBottom: 9, boxShadow: "var(--shadow)" };
const line = (k, v) => v ? (
  <div key={k} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f2f4fa", fontSize: 12.5 }}>
    <div style={{ width: 132, color: "var(--muted)", fontWeight: 700 }}>{k}</div>
    <div style={{ flex: 1 }}>{v}</div>
  </div>
) : null;

export default function BiltraxList() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("All");
  const [view, setView] = useState(null);
  const [winFor, setWinFor] = useState(null);
  const [fupFor, setFupFor] = useState(null);
  const [mentionFor, setMentionFor] = useState(null);

  const reload = () => api.list("biltrax", false).then((d) => {
    const me = CU().name;
    setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data })).filter((r) => r.assignPerson === me));
  }).catch(() => {});

  /* send everything we know into a new customer entry */
  const convert = (r) => {
    try {
      const contacts = [r.professional1, r.professional2, r.professional3, r.professional4].filter(Boolean);
      const first = String(contacts[0] || "");
      window.__EB_CUST_PREFILL = {
        name: r.projectName || "", address: r.address || "", state: r.state || "",
        notes: [r.latestSubStatus, r.associatedCompanies, r.buildingUse].filter(Boolean).join(" · "),
        enquiryFrom: "Biltrax",
        mobile: (first.match(/\d{10}/) || [""])[0],
      };
      localStorage.setItem("eb_biltrax_prefill", JSON.stringify(window.__EB_CUST_PREFILL));
    } catch {}
    nav("/app/followup/new?from=biltrax");
  };

  useEffect(() => {
    api.list("biltrax", false).then((d) => {
      const me = CU().name;
      setRows((d.records || []).map((r) => ({ _id: r.id, ...r.data }))
        .filter((r) => r.assignPerson === me));
    }).catch(() => setRows([]));
  }, []);

  const list = useMemo(() => {
    if (!rows) return null;
    if (tab === "All") return rows;
    return rows.filter((r) => (r.biltraxType || "Requested") === tab);
  }, [rows, tab]);

  return (
    <>
      <div className="f-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => nav(-1)} aria-label="Back"
          style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid #d7dcef", background: "#fff", fontSize: 18, lineHeight: 1, cursor: "pointer", fontWeight: 800, color: "var(--navy)" }}>‹</button>
        <h2 style={{ margin: 0, fontSize: 17 }}>Biltrax</h2>
      </div>

      <div className="f-seg" style={{ margin: "12px 18px" }}>
        {["All", "Requested", "Appointment"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="f-list-pad">
        {!list ? <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        : list.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            No Biltrax projects assigned to you.
          </div>
        ) : list.map((r) => (
          <div key={r._id} style={card} onClick={() => setView(r)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{r.projectName || "Project"}</div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
                background: r.biltraxType === "Appointment" ? "#fff4e5" : "#eef2ff",
                color: r.biltraxType === "Appointment" ? "#ad6800" : "#4f46e5" }}>
                {r.biltraxType || "Requested"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
              {[r.landmark, r.address].filter(Boolean).join(" · ")}
            </div>
            {r.biltraxType === "Appointment" && r.appointmentDate && (
              <div style={{ fontSize: 11.5, color: "#ad6800", fontWeight: 700, marginTop: 4 }}>📅 {r.appointmentDate}</div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setView(r)} style={btn("#0b3c8c", "#e8f0ff")}>👁 View</button>
              {r.status !== "Win" && <button onClick={() => setWinFor(r)} style={btn("#0f7a44", "#e7f7ef")}>🏆 Win</button>}
              <button onClick={() => convert(r)} style={btn("#c07f00", "#fef3e2")}>👤 Customer</button>
              <button onClick={() => setFupFor(r)} style={btn("#5b3fd6", "#f3efff")}>📝 Follow-up</button>
              <button onClick={() => setMentionFor(r)} style={btn("#0b6cb0", "#e4f3ff")}>🔗 Mention</button>
            </div>
          </div>
        ))}
      </div>

      {winFor && <BiltraxWin r={winFor} onClose={() => setWinFor(null)} onDone={reload} />}
      {fupFor && <BiltraxFollowUp r={fupFor} onClose={() => setFupFor(null)} onDone={reload} />}
      {mentionFor && <BiltraxMention r={mentionFor} onClose={() => setMentionFor(null)} onDone={reload} />}

      {view && (
        <div onClick={() => setView(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.55)", zIndex: 300, display: "grid", placeItems: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 18, maxHeight: "86vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>{view.projectName || "Biltrax Project"}</h3>
            {line("Type", view.biltraxType || "Requested")}
            {line("Latest Sub Status", view.latestSubStatus)}
            {line("Landmark", view.landmark)}
            {line("Address", view.address)}
            {line("Associated Companies", view.associatedCompanies)}
            {line("Building Use", view.buildingUse)}
            {line("Professional Detail 1", view.professional1)}
            {line("Professional Detail 2", view.professional2)}
            {line("Professional Detail 3", view.professional3)}
            {line("Professional Detail 4", view.professional4)}
            {view.biltraxType === "Appointment" && line("Appointment Date", view.appointmentDate)}
            {view.status === "Win" && (
              <div style={{ marginTop: 12, background: "#e5f9f1", borderRadius: 11, padding: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: "#0f7a44", marginBottom: 6 }}>
                  🏆 {view.winType === "Specification" ? "Specification Win" : "Sales Win"}
                </div>
                {line("Sq. Meter", view.winSqm)}
                {line("Sales Amount", view.winAmount ? `₹${Number(view.winAmount).toLocaleString("en-IN")}` : "")}
                {line("Grade", view.specGrade)}
                {line("Colour", view.specColour)}
                {line("Remark", view.winRemark)}
              </div>
            )}
            {Array.isArray(view.followups) && view.followups.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>📋 Follow-up History</div>
                {view.followups.map((f, i) => (
                  <div key={i} style={{ background: "#f7f9fc", borderRadius: 9, padding: "8px 10px", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--navy)" }}>{f.date}</div>
                    <div style={{ fontSize: 12.5 }}>{f.remark}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{f.by}</div>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(view.chat) && view.chat.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>💬 Messages</div>
                {view.chat.map((m, i) => (
                  <div key={i} style={{ background: "#f4f7ff", borderRadius: 9, padding: "8px 10px", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--navy)" }}>{m.by}</div>
                    <div style={{ fontSize: 12.5 }}>{m.text}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{m.at}</div>
                  </div>
                ))}
              </div>
            )}
            <button className="f-submit" style={{ width: "100%", marginTop: 14 }} onClick={() => setView(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

const btn = (color, bg) => ({
  background: bg, color, border: "none", borderRadius: 9,
  padding: "7px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
});

function Sheet({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.55)", zIndex: 400, display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 18, maxHeight: "86vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* Win: a sales person records the order, a specification person records the
   grade and colour that were approved. */
function BiltraxWin({ r, onClose, onDone }) {
  const me = CU();
  const isSpec = /spec/i.test(`${me.role || ""} ${me.designation || ""}`);
  const [sqm, setSqm] = useState("");
  const [amount, setAmount] = useState("");
  const [grades, setGrades] = useState([]);
  const [colours, setColours] = useState([]);
  const [grade, setGrade] = useState("");
  const [colour, setColour] = useState("");
  const [remark, setRemark] = useState("");
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSpec) return;
    api.productNames && api.productNames().then((d) => setGrades(d.names || [])).catch(() => {});
  }, [isSpec]);
  useEffect(() => {
    if (!isSpec || !grade) { setColours([]); return; }
    api.productsByName(grade).then((d) => setColours(d.rows || [])).catch(() => setColours([]));
  }, [grade, isSpec]);

  const save = async () => {
    if (isSpec ? !grade : (!sqm || !amount)) { alert("Please fill the required fields"); return; }
    setBusy(true);
    try {
      await api.update("biltrax", r._id, {
        ...r, status: "Win", winType: isSpec ? "Specification" : "Sales",
        winAttachment: file, winRemark: remark,
        ...(isSpec
          ? { specGrade: grade, specColour: colour, specWonBy: me.name, specWonAt: new Date().toLocaleString("en-IN") }
          : { winSqm: sqm, winAmount: amount, salesWonBy: me.name, wonAt: new Date().toLocaleString("en-IN") }),
      });
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Sheet title={`🏆 ${isSpec ? "Specification" : "Sales"} Win`} onClose={onClose}>
      {isSpec ? (
        <>
          <label style={lbl}>Approved Grade *</label>
          <select value={grade} onChange={(e) => { setGrade(e.target.value); setColour(""); }} style={inp}>
            <option value="">— Select Grade —</option>{grades.map((g) => <option key={g}>{g}</option>)}
          </select>
          <label style={lbl}>Colour</label>
          <select value={colour} onChange={(e) => setColour(e.target.value)} style={inp} disabled={!grade}>
            <option value="">{grade ? "— Select Colour —" : "Select a grade first"}</option>
            {colours.map((c, i) => (
              <option key={i} value={`${c.code ? c.code + " · " : ""}${c.colour || ""}`}>
                {c.code ? c.code + " · " : ""}{c.colour}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label style={lbl}>Order (Sq. Meter) *</label>
          <input value={sqm} inputMode="decimal" onChange={(e) => setSqm(e.target.value.replace(/[^\d.]/g, ""))} style={inp} />
          <label style={lbl}>Sales Amount (₹) *</label>
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} style={inp} />
        </>
      )}
      <label style={lbl}>Remark</label>
      <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} style={inp} />
      <label style={lbl}>{isSpec ? "Attachment" : "Invoice / Attachment"}</label>
      <input type="file" accept="image/*,application/pdf" style={{ marginBottom: 8 }}
        onChange={async (e) => {
          const f = e.target.files && e.target.files[0]; if (!f) return;
          try { const u = await api.uploadCompressed(f, "biltrax"); setFile(u.url || u.path || ""); }
          catch (er) { alert("Upload failed: " + er.message); }
        }} />
      {file && <div style={{ fontSize: 12, color: "#1f9d55", marginBottom: 8 }}>✓ Attached</div>}
      <button className="f-submit" style={{ width: "100%" }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Mark Win"}</button>
    </Sheet>
  );
}

/* A follow-up is a date plus a remark, kept on the project. */
function BiltraxFollowUp({ r, onClose, onDone }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!remark.trim()) { alert("Enter a remark"); return; }
    setBusy(true);
    const entry = { date, remark: remark.trim(), by: CU().name, at: new Date().toLocaleString("en-IN") };
    try {
      await api.update("biltrax", r._id, { ...r, followups: [...(r.followups || []), entry] });
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Sheet title="📝 Add Follow-up" onClose={onClose}>
      <label style={lbl}>Follow-up Date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
      <label style={lbl}>Remark *</label>
      <textarea rows={4} value={remark} onChange={(e) => setRemark(e.target.value)} style={inp} />
      <button className="f-submit" style={{ width: "100%" }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save Follow-up"}</button>
    </Sheet>
  );
}

/* Mention the other side; it lands in their Sales↔Spec list marked as Biltrax. */
function BiltraxMention({ r, onClose, onDone }) {
  const me = CU();
  const iAmSpec = /spec/i.test(`${me.role || ""} ${me.designation || ""}`);
  const want = iAmSpec ? "sales" : "spec";
  const [people, setPeople] = useState([]);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listUsers().then((d) => {
      setPeople((d.users || []).filter((u) => u.status == 1)
        .filter((u) => new RegExp(want, "i").test(`${u.role || ""} ${u.designation || ""}`))
        .map((u) => u.name));
    }).catch(() => {});
  }, []);

  const send = async () => {
    if (!pick) { alert("Select a person"); return; }
    setBusy(true);
    const mod = iAmSpec ? "specToSales" : "salesToSpec";
    try {
      await api.create(mod, {
        source: "Biltrax", biltraxId: r._id, biltraxLink: r.projectLink || "",
        projectName: r.projectName, city: r.landmark || r.address,
        helpNeeded: note || r.latestSubStatus || "",
        contacts: [r.professional1, r.professional2, r.professional3, r.professional4].filter(Boolean).map((p) => ({ name: p })),
        salesPerson: iAmSpec ? pick : me.name, specPerson: iAmSpec ? me.name : pick,
        status: "Pending", createdBy: me.name,
        createdAt: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      });
      try {
        await api.create("notification", {
          title: "Biltrax Project Mentioned",
          message: `${me.name} mentioned "${r.projectName}" to you.`,
          to: pick, link: `/app/m/${mod}`, at: new Date().toISOString(),
        });
      } catch {}
      onDone(); onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Sheet title={`🔗 Mention to ${iAmSpec ? "Sales" : "Specification"} Person`} onClose={onClose}>
      <label style={lbl}>Person</label>
      <select value={pick} onChange={(e) => setPick(e.target.value)} style={inp}>
        <option value="">— Select —</option>{people.map((n) => <option key={n}>{n}</option>)}
      </select>
      <label style={lbl}>Note (optional)</label>
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} style={inp} />
      <button className="f-submit" style={{ width: "100%" }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Mention"}</button>
    </Sheet>
  );
}
