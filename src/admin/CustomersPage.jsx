import { useEffect, useMemo, useState } from "react";
import { Phone, MapPin, Eye, X } from "lucide-react";
import { PageHead, StatCard, ToolButtons } from "../components/ui.jsx";
import { scopeRows, visibleUsers } from "../lib/scope.js";
import { canDelete, canModify } from "../lib/perms.js";
import { api } from "../lib/api.js";
import { usePager, Pager } from "../components/Pager.jsx";

/* Address cell — chinnaga chupinchi "read more" tho expand */
function AddressCell({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return <td style={{ padding: "11px 14px" }}>—</td>;
  const short = text.length > 40;
  return (
    <td style={{ padding: "11px 14px", maxWidth: 200, fontSize: 12.5 }}>
      {open || !short ? text : text.slice(0, 40) + "… "}
      {short && <span onClick={() => setOpen((v) => !v)} style={{ color: "var(--accent)", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>{open ? " less" : "read more"}</span>}
    </td>
  );
}

/* Customers (admin) — follow-up entries nunchi automatic ga aggregate ayina
   customer directory. Enquiry-style layout (count cards + tools + column search). */
export default function CustomersPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [colSearch, setColSearch] = useState({});
  const [busy, setBusy] = useState(false);
  /* how far a large import has got — a lakh rows take a while and a frozen
     screen with no number on it looks like a crash */
  const [progress, setProgress] = useState(null);
  const [view, setView] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [fwdOpen, setFwdOpen] = useState(null);
  const [users, setUsers] = useState([]);
  const CUST_COLS = ["Customer", "Category", "Contact", "Mobile", "Email", "Projects", "State", "Place", "Address", "New Entry", "Follow-up Entry", "Enquiry From", "By", "HOD"];
  const [hiddenCols, setHiddenCols] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("cust_hidden_cols") || "[]")); } catch { return new Set(); } });
  const [cfgOpen, setCfgOpen] = useState(false);
  const toggleCol = (c) => setHiddenCols((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); localStorage.setItem("cust_hidden_cols", JSON.stringify([...n])); return n; });
  const colVisible = (c) => !hiddenCols.has(c);
  /* filters */
  const [fState, setFState] = useState("");
  const [fHod, setFHod] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fDup, setFDup] = useState("");
  const [applied, setApplied] = useState(null);   // Show clicked -> filters applied

  /* how many follow-up entries the list was built from — proof on screen that
     nothing was left behind, now that there is no row cap */
  const [entries, setEntries] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const load = () => {
    setBusy(true); setLoadErr("");
    api.customers("")
      .then((d) => { setRows(d.customers || []); setEntries(d.entries ?? null); })
      .catch((e) => { setRows([]); setLoadErr(e && e.message ? e.message : "Could not load customers"); })
      .finally(() => setBusy(false));
  };
  useEffect(load, []);
  useEffect(() => { api.listUsers().then((d) => setUsers((d.users || []).filter((u) => u.role !== "Admin"))).catch(() => {}); }, []);

  const applyShow = () => setApplied({ state: fState, hod: fHod, person: fPerson, from: fFrom, to: fTo, dup: fDup });

  /* What this login may see. The rows went through this, but the State and HOD
     lists were built from the raw fetch, so they offered every state and every
     HOD in the business while the table showed one team's customers. */
  const visibleRows = useMemo(() => scopeRows(rows || [], users, ["by", "createdBy", "salesPerson"]), [rows, users]);

  const toggleSel = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const list = useMemo(() => {
    let l = scopeRows(rows || [], users, ["by", "createdBy", "salesPerson"]);
    if (!applied && !q.trim()) return [];   // nothing until Show is clicked (or a search typed)
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      l = l.filter((r) =>
        (r.name || "").toLowerCase().includes(ql) ||
        (r.mobile || "").includes(ql) ||
        (r.place || "").toLowerCase().includes(ql) ||
        (r.by || "").toLowerCase().includes(ql));
    }
    /* applied filters (Show button) */
    if (applied) {
      if (applied.state) l = l.filter((r) => (r.state || "").toLowerCase() === applied.state.toLowerCase());
      if (applied.hod) l = l.filter((r) => (r.hod || "").toLowerCase().includes(applied.hod.toLowerCase()));
      if (applied.person) l = l.filter((r) => (r.by || "").toLowerCase().includes(applied.person.toLowerCase()));
      if (applied.from) l = l.filter((r) => { const d = (r.last_followup || "").slice(0, 10); return d && d >= applied.from; });
      if (applied.to) l = l.filter((r) => { const d = (r.last_followup || "").slice(0, 10); return d && d <= applied.to; });
      /* The same customer entered twice.

         Two people covering one area both add the firm, or the same person
         adds it again months later, and nothing on this screen showed it. The
         phone number is what makes two rows the same customer — a name is
         spelled a dozen ways, a number is not — so rows are grouped by the
         digits of the number and a group of more than one is a duplicate.
         Only the rows on screen are compared, so narrowing by state or person
         first asks the question within that group. */
      if (applied.dup) {
        const digits = (x) => String(x || "").replace(/\D/g, "").slice(-10);
        const seen = new Map();
        l.forEach((r) => {
          const k = digits(r.mobile);
          if (k.length < 10) return;      // nothing to compare on
          seen.set(k, (seen.get(k) || 0) + 1);
        });
        const isDup = (r) => { const k = digits(r.mobile); return k.length === 10 && (seen.get(k) || 0) > 1; };
        l = applied.dup === "only" ? l.filter(isDup) : l.filter((r) => !isDup(r));
      }
    }
    Object.entries(colSearch).forEach(([k, v]) => {
      if (!v) return;
      const vv = v.toLowerCase();
      l = l.filter((r) => String(r[k] ?? "").toLowerCase().includes(vv));
    });
    return l;
  }, [rows, q, colSearch, applied, users]);
  const pager = usePager(list, 10, q || "");

  const importCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { alert("CSV is empty."); setBusy(false); return; }
      const parse = (line) => { const out = []; let cur = "", inQ = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out; };
      const head = parse(lines[0]).map((h) => h.trim().toLowerCase());
      const idx = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const ci = {
        name: idx(["customer name", "customer", "firm", "party"]),
        category: idx(["category"]),
        contactName: idx(["contact person", "contact name"]),
        mobile: idx(["mobile", "phone"]),
        email: idx(["email"]),
        state: idx(["state"]),
        city: idx(["city", "place"]),
        address: idx(["address"]),
        projects: idx(["project"]),
        contactName2: idx(["contact person 2", "contact name 2"]),
        mobile2: idx(["mobile 2", "phone 2"]),
        email2: idx(["email 2"]),
        contactName3: idx(["contact person 3", "contact name 3"]),
        mobile3: idx(["mobile 3", "phone 3"]),
        email3: idx(["email 3"]),
        enquiryFrom: idx(["enquiry from", "lead from", "source"]),
        remark: idx(["remark", "note"]),
        /* the employee code identifies the person now; an older sheet that
           still has a typed name keeps working, so both are looked for */
        empCode: idx(["employee code", "emp code", "employee id", "emp id", "code"]),
        createdBy: idx(["sales person", "created by", "owner"]),
        date: idx(["date"]),
      };
      const get = (c, k) => (ci[k] >= 0 ? (c[ci[k]] || "").trim() : "");
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parse(lines[i]);
        const partyName = get(c, "name");
        if (!partyName) continue;
        /* up to three contacts per row; more than that go on another row for the
           same customer, which also becomes that customer's next follow-up entry */
        const contacts = [];
        [["contactName", "mobile", "email"],
         ["contactName2", "mobile2", "email2"],
         ["contactName3", "mobile3", "email3"]].forEach(([n, m, e]) => {
          const nm = get(c, n), mo = get(c, m), em = get(c, e);
          if (nm || mo || em) contacts.push({ name: nm, mobile: mo, email: em, whatsapp: mo });
        });
        rows.push({
          partyName, category: get(c, "category"),
          contacts,
          contactName: get(c, "contactName"), mobile: get(c, "mobile"), email: get(c, "email"),
          state: get(c, "state"), city: get(c, "city"), address: get(c, "address"),
          /* "Tower A | Tower B | Mall" -> four separate projects */
          projects: get(c, "projects").split(/[|;]/).map((x) => x.trim()).filter(Boolean),
          enquiryFrom: get(c, "enquiryFrom"), remark: get(c, "remark"),
          empCode: get(c, "empCode"), createdBy: get(c, "createdBy"), date: get(c, "date"),
        });
      }
      if (!rows.length) { alert("No usable rows found."); setBusy(false); return; }
      /* Sent in batches.

         A sheet of a few hundred went up in one request, which was fine. A
         sheet of a lakh is tens of megabytes and tens of thousands of inserts:
         the request runs past the server's time limit and the whole load is
         lost with nothing to show for it. The rows go up a batch at a time
         instead, so what has gone in stays in, and the count on screen moves
         while it works. */
      const CHUNK = 400;
      let saved = 0, skipped = 0;
      const unknown = new Set();
      const startedAt = Date.now();
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK);
        /* the clock as well as the count: a lakh of rows is several minutes,
           and a bar that only creeps tells nobody whether to wait or to go
           and do something else */
        setProgress({ done: i, total: rows.length, saved, startedAt, now: Date.now() });
        /* one retry, because a single dropped batch should not end the load */
        let r = null;
        for (let t = 0; t < 2 && !r; t++) {
          try { r = await api.customersImport(part); }
          catch (e) { if (t) throw new Error(`Stopped after ${saved} row(s): ${e.message}`); }
        }
        saved += r.saved || 0;
        skipped += r.skipped || 0;
        (r.unknownOwners || []).forEach((x) => unknown.add(x));
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length, saved, startedAt, now: Date.now() });
      }
      setProgress(null);
      let msg = `${saved} customer(s) imported.`;
      if (skipped) msg += `\n${skipped} skipped.`;
      if (unknown.size) {
        msg += `\n\nThese employee codes did not match any App User:\n` +
               [...unknown].slice(0, 15).join(", ") +
               (unknown.size > 15 ? ` …and ${unknown.size - 15} more` : "");
      }
      alert(msg);
      load();
    } catch (e) { alert("Import failed: " + e.message); }
    setProgress(null);
    setBusy(false);
  };

  const downloadFormat = () => {
    const head = ["Customer Name", "Category",
      "Contact Person", "Mobile", "Email",
      "Contact Person 2", "Mobile 2", "Email 2",
      "Contact Person 3", "Mobile 3", "Email 3",
      "State", "City", "Address", "Projects", "Enquiry From", "Remark", "Employee Code", "Date"];
    /* two rows for the same customer = two follow-up entries */
    const s1 = ["ABC Constructions", "Distributor",
      "Ramesh Kumar", "9876543210", "ramesh@example.com",
      "Suresh Patil", "9876500011", "suresh@example.com",
      "Anita Rao", "9876500022", "anita@example.com",
      "Maharashtra", "Mumbai", "Andheri East",
      "Tower A | Tower B | Mall Project | Villa Site",
      "IndiaMart", "First visit - shared price list", "EPP1042", "10 Sep 2026"];
    const s2 = ["ABC Constructions", "Distributor",
      "Ramesh Kumar", "9876543210", "ramesh@example.com",
      "", "", "", "", "", "",
      "Maharashtra", "Mumbai", "Andheri East",
      "Tower A", "IndiaMart", "Second visit - sample given", "EPP1042", "14 Sep 2026"];
    const csv = [head, s1, s2].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers-format.csv"; a.click();
  };


  /* Export uses the SAME columns as the import format, so a file taken out here
     can be edited and loaded straight back in. */
  const exportCsv = () => {
    const head = ["Customer Name", "Category",
      "Contact Person", "Mobile", "Email",
      "Contact Person 2", "Mobile 2", "Email 2",
      "Contact Person 3", "Mobile 3", "Email 3",
      "State", "City", "Address", "Projects", "Enquiry From", "Remark",
      "New Entry", "Follow-up Entry",
      "Employee Code", "Sales Person", "HOD", "Date"];
    const con = (r, i) => (Array.isArray(r.contacts) && r.contacts[i]) ? r.contacts[i] : {};
    const body = list.map((r) => {
      const c1 = con(r, 0), c2 = con(r, 1), c3 = con(r, 2);
      const projects = Array.isArray(r.projects) ? r.projects.join(" | ") : (r.projectName || "");
      return [
        r.name || "", r.category || r.type || "",
        c1.name || r.contactName || "", c1.mobile || r.mobile || "", c1.email || r.email || "",
        c2.name || "", c2.mobile || "", c2.email || "",
        c3.name || "", c3.mobile || "", c3.email || "",
        r.state || "", r.place || "", r.address || "",
        projects, r.enquiryFrom || "", r.notes || r.remark || "",
        r.newEntries ?? "", r.followupEntries ?? "",
        r.empCode || "", r.by || "", r.hod || "", (r.last_followup || r.createdAt || "").slice(0, 16),
      ];
    });
    const csv = [head, ...body].map((row) => row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv"; a.click();
  };

  /* every total counts what the filters leave, so the cards match the list */
  const statRows = list || [];
  const withMobile = statRows.filter((r) => r.mobile).length;
  /* duplicate detection: same mobile appearing more than once */
  const mobileCounts = {};
  statRows.forEach((r) => { if (r.mobile) mobileCounts[r.mobile] = (mobileCounts[r.mobile] || 0) + 1; });
  const dupMobiles = new Set(Object.keys(mobileCounts).filter((m) => mobileCounts[m] > 1));
  const dupCount = statRows.filter((r) => r.mobile && dupMobiles.has(r.mobile)).length;
  const totalNew = statRows.reduce((s, r) => s + (r.newEntries || 0), 0);
  const totalFollow = statRows.reduce((s, r) => s + (r.followupEntries || 0), 0);

  return (
    <div style={{ padding: "0 4px 40px" }}>
      <PageHead
        crumb="SFA"
        title="Customers List"
        actions={
          <ToolButtons module="Customers"
            onRefresh={load}
            refreshing={busy}
            onExport={exportCsv}
            onImport={() => document.getElementById("cust-import-file").click()}
            onDownloadFormat={downloadFormat}
            onHeaderConfig={() => setCfgOpen(true)}
            onReport={exportCsv}
          />
        }
      />
      <input id="cust-import-file" type="file" accept=".csv" hidden onChange={(e) => { importCsv(e.target.files[0]); e.target.value = ""; }} />

      {loadErr && (
        <div style={{ background: "#fdecec", color: "#c03636", border: "1px solid #f3c6c6", borderRadius: 10, padding: "10px 13px", marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          {loadErr}
        </div>
      )}
      {entries != null && rows && rows.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 10 }}>
          {rows.length.toLocaleString("en-IN")} customers, built from {entries.toLocaleString("en-IN")} follow-up entries.
        </div>
      )}
      {progress && (() => {
        const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);
        const secs = Math.max(1, Math.round(((progress.now || Date.now()) - progress.startedAt) / 1000));
        const rate = progress.done / secs;                       // rows a second
        const leftS = rate > 0 ? Math.round((progress.total - progress.done) / rate) : 0;
        const clock = (t) => (t >= 3600
          ? `${Math.floor(t / 3600)} h ${Math.floor((t % 3600) / 60)} min`
          : t >= 60 ? `${Math.floor(t / 60)} min ${t % 60} sec` : `${t} sec`);
        return (
          <div style={{ background: "#fff", border: "1px solid #dfe5f3", borderRadius: 12, padding: "13px 16px", marginBottom: 14, boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 13, fontWeight: 700, marginBottom: 8, flexWrap: "wrap" }}>
              <span>Importing customers… keep this tab open</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {progress.done.toLocaleString("en-IN")} / {progress.total.toLocaleString("en-IN")}
                <span style={{ color: "var(--muted)", fontWeight: 800, marginLeft: 8 }}>{pct}%</span>
              </span>
            </div>
            <div style={{ height: 9, borderRadius: 99, background: "#e8edf9", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, background: "#2b6fb8", width: pct + "%", transition: "width .3s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: 11.5, color: "var(--muted)", fontWeight: 600, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
              <span>⏱ {clock(secs)} elapsed · {Math.round(rate).toLocaleString("en-IN")} rows/sec</span>
              <span>{progress.saved.toLocaleString("en-IN")} saved</span>
              <span>{progress.done >= progress.total ? "finishing…" : `about ${clock(leftS)} left`}</span>
            </div>
          </div>
        );
      })()}

      {sel.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "linear-gradient(135deg,#eef1ff,#f4ecff)", borderRadius: 12, marginBottom: 14 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "var(--accent)" }}>{sel.size} selected</span>
          {canModify("Customers") && (
            <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12.5 }}
              onClick={() => {
                const selRows = (rows || []).filter((r) => sel.has(r.mobile || r.name));
                setFwdOpen({ mobiles: selRows.map((r) => r.mobile).filter(Boolean), names: selRows.map((r) => r.name).filter(Boolean) });
              }}>➡ Forward to…</button>
          )}
          {/* Deleting the selection. Each row was already deletable on its own,
              so picking twenty and having nothing but Forward to offer meant
              doing it twenty times over. */}
          {canDelete("Customers") && (
          <button className="btn btn-danger" style={{ padding: "6px 14px", fontSize: 12.5 }} disabled={bulkBusy}
            onClick={async () => {
              const selRows = (rows || []).filter((r) => sel.has(r.mobile || r.name));
              if (!selRows.length) return;
              if (!window.confirm(`Delete ${selRows.length} customer(s)? This removes their entries and cannot be undone.`)) return;
              setBulkBusy(true);
              /* the whole selection goes up in one request: one request per
                 customer meant the server read the entire table once for each
                 of them, and a large selection simply ran out of time with
                 part of it still undeleted */
              try {
                const r = await api.deleteCustomers(selRows.map((x) => ({ mobile: x.mobile, name: x.name })));
                alert(`${(r.deleted || 0).toLocaleString("en-IN")} entr${(r.deleted || 0) === 1 ? "y" : "ies"} deleted for ${selRows.length} customer(s).`);
              } catch (e) {
                alert("Could not delete: " + (e && e.message ? e.message : e));
              }
              setBulkBusy(false);
              setSel(new Set());
              load();
            }}>🗑 {bulkBusy ? "Deleting…" : `Delete ${sel.size}`}</button>
          )}
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {/* count cards — Enquiry style */}
      <div className="stat-row">
        <StatCard label="Total" value={statRows.length} sub="Matching customers" />
        <StatCard label="New Entries" value={totalNew} sub="Customers added" />
        <StatCard label="Follow-up Entries" value={totalFollow} sub="Visits logged" color="#0f7a44" />
        <StatCard label="With Mobile" value={withMobile} sub="Have contact number" />
        <StatCard label="Duplicates" value={dupCount} sub="Same mobile repeated" color={dupCount > 0 ? "#ef4444" : "#94a3b8"} />
        <StatCard label="In Database" value={rows ? rows.length : 0} sub="All customers" color="#94a3b8" />
      </div>

      {/* filters + Show */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "14px 0", background: "#fff", padding: 14, borderRadius: 12, boxShadow: "var(--shadow)" }}>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>State</label>
          <select value={fState} onChange={(e) => setFState(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 130 }}>
            <option value="">All States</option>
            {[...new Set(visibleRows.map((r) => r.state).filter(Boolean))].sort().map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>HOD</label>
          <select value={fHod} onChange={(e) => setFHod(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 130 }}>
            <option value="">All HODs</option>
            {[...new Set(visibleRows.map((r) => r.hod).filter(Boolean))].sort().map((h) => <option key={h}>{h}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Sales Person</label>
          <select value={fPerson} onChange={(e) => setFPerson(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 150 }}>
            <option value="">All</option>
            {/* The rows were already limited to this login's team, but this list
                offered every name in the company. The full list is still held
                for working out who reports to whom. */}
            {visibleUsers(users).map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>From Date</label>
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} /></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>To Date</label>
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5 }} /></div>
        <div><label style={{ fontSize: 11.5, fontWeight: 700, display: "block", marginBottom: 4 }}>Duplicates</label>
          <select value={fDup} onChange={(e) => setFDup(e.target.value)} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dde2ef", fontSize: 12.5, minWidth: 150 }}>
            <option value="">All customers</option>
            <option value="only">Duplicates only</option>
            <option value="unique">Hide duplicates</option>
          </select></div>
        <button className="btn" style={{ background: "#22a45d", color: "#fff", borderColor: "transparent" }} onClick={applyShow}>Show</button>
        {applied && <button className="btn btn-soft" onClick={() => { setApplied(null); setFState(""); setFHod(""); setFPerson(""); setFFrom(""); setFTo(""); setFDup(""); }}>Clear</button>}
      </div>

      <div style={{ position: "relative", margin: "14px 0" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / mobile / place / sales person…"
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" }} />
      </div>

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f4f6fc", textAlign: "left" }}>
                <th style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578" }}>
                  <input type="checkbox" title="Select all"
                    checked={list.length > 0 && list.every((r) => sel.has(r.mobile || r.name))}
                    onChange={(e) => setSel(e.target.checked ? new Set(list.map((r) => r.mobile || r.name)) : new Set())} />
                </th>
                {["Customer", "Category", "Contact", "Mobile", "Email", "Projects", "State", "Place", "Address", "New Entry", "Follow-up Entry", "Enquiry From", "By", "HOD"].filter(colVisible).concat(["Action"]).map((h) => (
                  <th key={h} style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: "#4a5578", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
              <tr style={{ background: "#fafbff" }}>
                {[[null], ["name", "Customer"], ["category", "Category"], ["contactName", "Contact"], ["mobile", "Mobile"], ["email", "Email"], [null, "Projects"], ["state", "State"], ["place", "Place"], ["address", "Address"], [null, "New Entry"], [null, "Follow-up Entry"], ["by", "By"], [null, "HOD"], [null, "Action"]].filter(([, col]) => !col || col === "Action" || colVisible(col)).map(([k], i) => (
                  <th key={i} style={{ padding: "6px 10px" }}>
                    {k && <input value={colSearch[k] || ""} onChange={(e) => setColSearch((c) => ({ ...c, [k]: e.target.value }))} placeholder="Search…"
                      style={{ width: "100%", padding: "5px 8px", borderRadius: 7, border: "1px solid var(--line)", fontSize: 11.5, background: "#fff", fontWeight: 400 }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  {applied || q.trim() ? "No customers found for the selected filter." : "Use filters and click Show to load customers (or type in search)."}
                </td></tr>
              ) : pager.slice.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eef1f8" }}>
                  <td style={{ padding: "11px 14px" }}><input type="checkbox" checked={sel.has(r.mobile || r.name)} onChange={() => toggleSel(r.mobile || r.name)} /></td>
                  {colVisible("Customer") && <td style={{ padding: "11px 14px", fontWeight: 700 }}>
                    <span onClick={() => setView(r)} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>{r.name}</span>
                    {r.mobile && dupMobiles.has(r.mobile) && <span title="Duplicate mobile" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#ef4444", background: "#fdeceb", padding: "1px 6px", borderRadius: 6 }}>DUP</span>}
                  </td>}
                  {colVisible("Category") && <td style={{ padding: "11px 14px" }}>{r.category ? <span style={{ fontSize: 11, background: "#f1ebff", color: "#7c3aed", fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>{r.category}</span> : "—"}</td>}
                  {colVisible("Contact") && <td style={{ padding: "11px 14px" }}>{r.contactName || (Array.isArray(r.contacts) && r.contacts[0] && r.contacts[0].name) || "—"}</td>}
                  {colVisible("Mobile") && <td style={{ padding: "11px 14px" }}>{r.mobile ? <span style={{ color: "var(--accent)" }}><Phone size={12} /> {r.mobile}</span> : "—"}</td>}
                  {colVisible("Email") && <td style={{ padding: "11px 14px" }}>{r.email || (Array.isArray(r.contacts) && r.contacts[0] && r.contacts[0].email) || "—"}</td>}
                  {colVisible("Projects") && <td style={{ padding: "11px 14px", maxWidth: 180 }}>{r.projectName || (Array.isArray(r.projects) ? r.projects.join(", ") : "") || "—"}</td>}
                  {colVisible("State") && <td style={{ padding: "11px 14px" }}>{r.state || (users.find((u) => u.name === r.by)?.state) || "—"}</td>}
                  {colVisible("Place") && <td style={{ padding: "11px 14px" }}>{r.place ? <span><MapPin size={12} /> {r.place}</span> : "—"}</td>}
                  {colVisible("Address") && <AddressCell text={r.address} />}
                  {colVisible("New Entry") && <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700 }}>{r.newEntries ?? "—"}</td>}
                  {colVisible("Follow-up Entry") && <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700, color: (r.followupEntries || 0) > 0 ? "#0f7a44" : undefined }}>{r.followupEntries ?? "—"}</td>}
                  {colVisible("Enquiry From") && <td style={{ padding: "11px 14px" }}>{r.enquiryFrom || "—"}</td>}
                  {colVisible("By") && <td style={{ padding: "11px 14px", color: "var(--muted)" }}>{r.by || "—"}</td>}
                  {colVisible("HOD") && <td style={{ padding: "11px 14px", color: "var(--muted)" }}>{r.hod || (users.find((u) => u.name === r.by)?.manager) || "—"}</td>}
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setView(r)}><Eye size={12} /> View</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12, background: "#e4e8ff", color: "#3949ab" }}
                        onClick={() => {
                          /* carry this customer into the quotation form (same fields as the app) */
                          try {
                            localStorage.setItem("eb_quote_prefill", JSON.stringify({
                              customer: r.name, party: r.name, mobile: r.mobile, email: r.email,
                              contactName: r.contactName, state: r.state, city: r.place, address: r.address,
                            }));
                          } catch {}
                          window.location.href = "/admin/sfa/quotation?prefill=1";
                        }}>📄 Quotation</button>
                      {canModify("Customers") && <button className="btn btn-soft" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setFwdOpen({ mobiles: r.mobile ? [r.mobile] : [], names: [r.name] })}>➡ Forward</button>}
                      {/* only for roles the grid allows to delete Customers */}
                      {canDelete("Customers") && (
                        <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={async () => {
                            if (!window.confirm(`Delete customer ${r.name}? This removes their entries.`)) return;
                            try { await api.deleteCustomer(r.mobile, r.name); load(); } catch (e) { alert(e.message); }
                          }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Pager pager={pager} />

      {cfgOpen && (
        <div className="modal-mask" onClick={() => setCfgOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Show / Hide Columns</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setCfgOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {CUST_COLS.map((c) => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={colVisible(c)} onChange={() => toggleCol(c)} style={{ width: 16, height: 16 }} />
                  {c}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)" }}>Your choice is saved on this device.</div>
          </div>
        </div>
      )}

      {view && (
        <div className="modal-mask" onClick={() => setView(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{view.name}</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setView(null)}><X size={16} /></button>
            </div>
            <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
              {view.category && <div><b>Category:</b> {view.category}</div>}
              {view.mobile && <div><b>Mobile:</b> {view.mobile}</div>}
              {(view.projectName || (view.projects && view.projects.length)) && <div><b>Projects:</b> {view.projectName || (view.projects || []).join(", ")}</div>}
              {view.address && <div><b>Address:</b> {view.address}</div>}
              {Array.isArray(view.contacts) && view.contacts.length > 0 && (
                <div><b>Contacts:</b> {view.contacts.map((c) => `${c.name || ""} (${c.mobile || ""})`).join(", ")}</div>
              )}
              <div><b>Entries:</b> {view.followups}</div>
              {view.last_followup && <div><b>Last Entry:</b> {String(view.last_followup).slice(0, 16)}</div>}
              {view.by && <div><b>Created By:</b> {view.by}</div>}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => {
                /* pre-fill quotation with this customer, open the quotation admin */
                try { localStorage.setItem("eb_quote_prefill", JSON.stringify({ customer: view.name, mobile: view.mobile, email: view.email, state: view.state, city: view.place, address: view.address })); } catch {}
                window.location.href = "/admin/sfa/quotation?prefill=1";
              }}>📄 Add Quotation</button>
            </div>

            {Array.isArray(view.updates) && view.updates.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>📋 Follow-up History</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {view.updates.slice().reverse().map((u, i) => (
                    <div key={i} style={{ borderLeft: "3px solid var(--accent)", background: "#f6f8fd", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <b>{u.type || "Follow Up"}</b>
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>{u.date || (u.at ? String(u.at).slice(0, 10) : "")}</span>
                      </div>
                      {u.remark && <div style={{ fontSize: 11.5, marginTop: 2 }}>{u.remark}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {fwdOpen && (
        <div className="modal-mask" onClick={() => setFwdOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Forward Customers</h3>
              <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setFwdOpen(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
              Forwarding {fwdOpen.names.length} customer(s) — all their entries move to the selected person (use when someone resigns).
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 700 }}>Forward to</label>
            <select id="fwd-user" style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid var(--line)", margin: "6px 0 14px" }}>
              <option value="">— Select person —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            <button className="btn btn-primary" style={{ width: "100%" }}
              onClick={async () => {
                const toId = document.getElementById("fwd-user").value;
                if (!toId) { alert("Select a person"); return; }
                try {
                  const r = await api.forwardCustomers(fwdOpen.mobiles, fwdOpen.names, Number(toId));
                  alert(`Forwarded ${r.forwarded} entries.`);
                  setFwdOpen(null); setSel(new Set()); load();
                } catch (e) { alert(e.message); }
              }}>Forward</button>
          </div>
        </div>
      )}
    </div>
  );
}
