/* Shared building blocks for the analytics dashboards — filters, stat boxes,
   a lightweight bar/line chart and a donut (pie) chart. No external chart lib. */
import { useMemo } from "react";

export const CARD = { background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 6px 20px rgba(15,23,42,.06)", border: "1px solid #eef1f8" };
export const selS = { padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, background: "#fff" };

export function StatBox({ label, value, sub, tone = "#3949ab" }) {
  return (
    <div style={{ ...CARD, padding: 16, borderTop: `3px solid ${tone}` }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)", marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

export function BarChart({ data, height = 220, color = "#3949ab", money = false }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (v) => money ? "₹" + Number(v).toLocaleString("en-IN") : Number(v).toLocaleString("en-IN");
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, padding: "10px 4px", overflowX: "auto" }}>
      {data.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No data</div> : data.map((d, i) => (
        <div key={i} style={{ flex: "1 0 42px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 42 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--navy)" }}>{d.value ? fmt(d.value) : ""}</div>
          <div title={`${d.label}: ${fmt(d.value)}`} style={{
            width: "100%", height: Math.max(3, (d.value / max) * (height - 60)),
            background: `linear-gradient(180deg, ${color}, ${color}bb)`, borderRadius: "8px 8px 4px 4px", transition: "height .4s ease",
          }} />
          <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Donut({ data, size = 190 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const segs = useMemo(() => {
    let acc = 0;
    return data.map((d) => {
      const frac = total ? d.value / total : 0;
      const seg = { ...d, from: acc * 360, to: (acc + frac) * 360, pct: Math.round(frac * 100) };
      acc += frac; return seg;
    });
  }, [data, total]);
  const bg = segs.length && total
    ? `conic-gradient(${segs.map((s) => `${s.color} ${s.from}deg ${s.to}deg`).join(", ")})`
    : "conic-gradient(#e6eaf5 0deg 360deg)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size, borderRadius: "50%", background: bg, flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: size * 0.22, background: "#fff", borderRadius: "50%", display: "grid", placeItems: "center", boxShadow: "inset 0 2px 8px rgba(0,0,0,.05)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)" }}>{total.toLocaleString("en-IN")}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>TOTAL</div>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, minWidth: 160 }}>
        {segs.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: "var(--navy)", flex: 1 }}>{s.label}</span>
            <span style={{ color: "var(--muted)", fontWeight: 700 }}>{s.value} · {s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* month key helpers shared by the dashboards */
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
