/* Ten rows at a time. Long lists used to render every row at once, which is slow
   on a big month and hard to read. */
import { useEffect, useState } from "react";

export function usePager(rows, size = 10, resetKey = "") {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey, rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  return {
    page: current, setPage, pages, size,
    slice: rows.slice((current - 1) * size, current * size),
    total: rows.length,
  };
}

export function Pager({ pager }) {
  const { page, setPage, pages, size, total } = pager;
  if (total <= size) return null;
  const btn = (on) => ({
    minWidth: 34, padding: "6px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: "1px solid " + (on ? "#2b6fb8" : "#d7dcef"), background: on ? "#2b6fb8" : "#fff", color: on ? "#fff" : "#1f3a68",
  });
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
        Showing {(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <button style={btn(false)} disabled={page === 1} onClick={() => setPage(1)}>«</button>
        <button style={btn(false)} disabled={page === 1} onClick={() => setPage(page - 1)}>‹ Prev</button>
        {nums.map((n) => <button key={n} style={btn(n === page)} onClick={() => setPage(n)}>{n}</button>)}
        <button style={btn(false)} disabled={page === pages} onClick={() => setPage(page + 1)}>Next ›</button>
        <button style={btn(false)} disabled={page === pages} onClick={() => setPage(pages)}>»</button>
      </div>
    </div>
  );
}
