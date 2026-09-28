/* Picking several rows and removing them in one go.

   Every master list had a delete on each row, which is fine for one mistake and
   painful for fifty imported rows. This keeps the selection in one place so all
   four lists behave the same way: a tick in the header takes everything that is
   currently on screen, the bar only appears once something is picked, and the
   count is spelled out before anything is removed. */
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

export function useBulk(rows, keyOf) {
  const [picked, setPicked] = useState(() => new Set());

  const keys = useMemo(() => (rows || []).map(keyOf), [rows, keyOf]);
  /* a row that has left the list (filtered away, or already deleted) must not
     stay selected — otherwise the count says six and four disappear */
  const live = useMemo(() => {
    const here = new Set(keys);
    return [...picked].filter((k) => here.has(k));
  }, [picked, keys]);

  const allOn = live.length > 0 && live.length === keys.length;

  return {
    count: live.length,
    keys: live,
    has: (k) => picked.has(k),
    toggle: (k) => setPicked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }),
    toggleAll: () => setPicked(() => (allOn ? new Set() : new Set(keys))),
    allOn,
    clear: () => setPicked(new Set()),
  };
}

/* the little tick in a header cell */
export function BulkHead({ bulk }) {
  return (
    <th style={{ padding: "10px 12px", width: 34 }}>
      <input type="checkbox" checked={bulk.allOn} onChange={bulk.toggleAll}
        title="Select everything listed" style={{ cursor: "pointer", width: 15, height: 15 }} />
    </th>
  );
}

/* the tick on a row */
export function BulkCell({ bulk, k }) {
  return (
    <td style={{ padding: "9px 12px", width: 34 }}>
      <input type="checkbox" checked={bulk.has(k)} onChange={() => bulk.toggle(k)}
        style={{ cursor: "pointer", width: 15, height: 15 }} />
    </td>
  );
}

/* the bar that appears once something is picked */
export function BulkBar({ bulk, noun = "row", onDelete }) {
  const [busy, setBusy] = useState(false);
  if (!bulk.count) return null;
  const many = bulk.count === 1 ? noun : noun + "s";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff4f4",
      border: "1px solid #f3c9c9", borderRadius: 11, padding: "10px 14px", marginBottom: 12 }}>
      <span style={{ fontWeight: 800, fontSize: 13, color: "#8c2f2f" }}>
        {bulk.count} {many} selected
      </span>
      <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12.5 }}
        onClick={bulk.clear}>Clear</button>
      <div style={{ flex: 1 }} />
      <button className="btn btn-danger" style={{ padding: "6px 14px", fontSize: 12.5 }} disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Delete ${bulk.count} ${many}? This cannot be undone.`)) return;
          setBusy(true);
          try { await onDelete(bulk.keys); bulk.clear(); }
          catch (e) { alert(e && e.message ? e.message : String(e)); }
          setBusy(false);
        }}>
        <Trash2 size={13} /> {busy ? "Deleting…" : `Delete ${bulk.count}`}
      </button>
    </div>
  );
}
