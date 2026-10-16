/* Two form fields that both the panel and the phone need, written once.

   A task can be given to more than one person, and can carry more than one
   photo or PDF. The panel builds its forms with FormModal and the phone builds
   its own, so either would have needed the same thing twice — and the two would
   have drifted. They share these. */
import { useState } from "react";

export const MAX_FILES = 5;

export const isPdfFile = (u) =>
  /^data:application\/pdf/i.test(String(u || "")) || /\.pdf($|\?)/i.test(String(u || ""));

/* Several people on one field.

   The chosen names are kept two ways: `value` as one readable line ("Ravi,
   Suresh") for lists and exports, and `<name>List` as a real list, which is
   what a lookup for "tasks assigned to me" can match exactly. Matching against
   the readable line alone would never find one person inside it. */
export function MultiPeople({ value, listValue, options, onChange, placeholder = "Add person…" }) {
  const chosen = Array.isArray(listValue) && listValue.length
    ? listValue
    : String(value || "").split(",").map((x) => x.trim()).filter(Boolean);

  const set = (names) => onChange(names.join(", "), names);
  const left = (options || []).filter((o) => !chosen.includes(o));

  return (
    <div>
      <select value="" onChange={(e) => { const v = e.target.value; if (v) set([...chosen, v]); }}
        style={{ width: "100%" }}>
        <option value="">{placeholder}</option>
        {left.map((o) => <option key={o}>{o}</option>)}
      </select>
      {chosen.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
          {chosen.map((n) => (
            <span key={n} style={{ background: "#eef2ff", color: "#3949ab", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
              {n}
              <span onClick={() => set(chosen.filter((x) => x !== n))}
                style={{ cursor: "pointer", marginLeft: 6 }}>×</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* Several photos or PDFs on one field.

   Each file is read into the record itself, so an attachment cannot be lost by
   an upload that quietly failed. A photo is shrunk first — a few straight from
   a phone camera would be several megabytes — while a PDF is kept as it is. */
export function MultiFiles({ value, onChange, max = MAX_FILES }) {
  const files = Array.isArray(value) ? value : (value ? [value] : []);
  const [busy, setBusy] = useState(false);

  const read = (file) => new Promise((done) => {
    const rd = new FileReader();
    rd.onload = () => done(rd.result);
    rd.onerror = () => done(null);
    rd.readAsDataURL(file);
  });

  const add = async (picked) => {
    const room = max - files.length;
    if (room <= 0) { alert(`You can attach up to ${max} files.`); return; }
    if (picked.length > room) alert(`Only ${room} more can be attached — the rest were left out.`);
    setBusy(true);
    const out = [];
    for (const file of picked.slice(0, room)) {
      let use = file;
      if (!isPdfFile(file.name) && !/pdf$/i.test(file.type || "")) {
        try {
          const { compressImage } = await import("../lib/api.js");
          use = await compressImage(file, 1280, 0.7);
        } catch { use = file; }
      }
      const url = await read(use);
      if (url) out.push(url);
    }
    setBusy(false);
    if (out.length) onChange([...files, ...out].slice(0, max));
  };

  return (
    <div>
      <input type="file" accept="image/*,application/pdf" multiple disabled={busy}
        onChange={(e) => { const p = Array.from(e.target.files || []); e.target.value = ""; if (p.length) add(p); }} />
      {busy && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12.5, color: "var(--accent)", fontWeight: 700 }}>
          <span className="eb-spin" style={{ width: 13, height: 13, borderWidth: 2 }} /> Attaching…
        </div>
      )}
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {files.map((u, i) => (
            <div key={i} style={{ position: "relative" }}>
              {isPdfFile(u) ? (
                <div onClick={() => window.dispatchEvent(new CustomEvent("app-photo", { detail: u }))}
                  style={{ width: 60, height: 60, borderRadius: 9, border: "1px solid #d7dcef", background: "#fdf2f2", color: "#c0392b", display: "grid", placeItems: "center", cursor: "pointer", fontSize: 10.5, fontWeight: 800 }}>
                  📄 PDF
                </div>
              ) : (
                <img src={u} alt={`Attachment ${i + 1}`}
                  onClick={() => window.dispatchEvent(new CustomEvent("app-photo", { detail: u }))}
                  style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 9, border: "1px solid #d7dcef", cursor: "pointer" }} />
              )}
              <button type="button" aria-label="Remove"
                onClick={() => onChange(files.filter((_, k) => k !== i))}
                style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#d64545", color: "#fff", fontSize: 12, lineHeight: 1, cursor: "pointer", fontWeight: 800 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
        {files.length}/{max} attached — photos or PDFs
      </div>
    </div>
  );
}


/* Who an announcement goes to.

   The audience used to be typed in by hand — "North, Mumbai" or a list of
   names — against a label that had to explain which of those the box wanted.
   Nothing checked the spelling, so one wrong letter sent the notice to nobody
   and there was no way to tell from the screen. The choices are now read from
   the people themselves: pick Zone and the zones on record are offered, pick
   State and the states are, pick Users and the names are. More than one can be
   picked, and what is stored is still the same comma-separated line, so
   everything that already reads it carries on unchanged. */
export function AudiencePick({ type, people, value, onChange }) {
  const uniq = (xs) => [...new Set(xs.map((x) => String(x || "").trim()).filter(Boolean))].sort();
  const options =
      type === "Zone"  ? uniq(people.map((u) => u.zone))
    : type === "State" ? uniq(people.flatMap((u) => [u.state, ...String(u.states || "").split(",")]))
    : type === "City"  ? uniq(people.map((u) => u.city))
    : type === "Users" ? uniq(people.map((u) => u.name))
    : [];

  if (!type || type === "All") {
    return <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "9px 2px" }}>
      {type === "All" ? "Goes to everyone — nothing to choose." : "Choose Send To first."}
    </div>;
  }

  const chosen = String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
  const set = (list) => onChange(list.join(", "));
  const left = options.filter((o) => !chosen.some((c) => c.toLowerCase() === o.toLowerCase()));
  const label = type === "Users" ? "person" : type.toLowerCase();

  /* how many people this reaches, so nobody sends to an empty audience */
  const reach = chosen.length === 0 ? 0 : people.filter((u) => {
    const has = (v) => chosen.some((c) => c.toLowerCase() === String(v || "").trim().toLowerCase());
    if (type === "Zone") return has(u.zone);
    if (type === "City") return has(u.city);
    if (type === "Users") return has(u.name);
    if (type === "State") return [u.state, ...String(u.states || "").split(",")].some(has);
    return false;
  }).length;

  return (
    <div>
      <select value="" onChange={(e) => { const v = e.target.value; if (v) set([...chosen, v]); }} style={{ width: "100%" }}>
        <option value="">{options.length ? `Add ${label}…` : `No ${label} found in App Users`}</option>
        {left.map((o) => <option key={o}>{o}</option>)}
      </select>
      {chosen.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
          {chosen.map((n) => (
            <span key={n} style={{ background: "#eef2ff", color: "#3949ab", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
              {n}
              <span onClick={() => set(chosen.filter((x) => x !== n))} style={{ cursor: "pointer", marginLeft: 6 }}>×</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: reach === 0 && chosen.length ? "#c0392b" : "var(--muted)", marginTop: 6, fontWeight: 600 }}>
        {chosen.length === 0
          ? `Pick one or more — ${options.length} available`
          : reach === 0 ? "No one matches this — nobody would receive it"
          : `${reach} person${reach === 1 ? "" : "s"} will receive this`}
      </div>
    </div>
  );
}
