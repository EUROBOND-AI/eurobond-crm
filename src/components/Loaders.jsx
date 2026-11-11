/* Shared loaders used across the admin panel and the field app.
   Six kinds, one place: Spinner, Skeleton, ProgressBar, PulsingBar,
   ButtonLoader and FullScreenLoader. Keyframes are injected once. */
import { useEffect } from "react";

let injected = false;
function useLoaderCss() {
  useEffect(() => {
    if (injected || typeof document === "undefined") return;
    injected = true;
    const s = document.createElement("style");
    s.id = "eb-loader-css";
    s.textContent = `
@keyframes eb-spin{to{transform:rotate(360deg)}}
@keyframes eb-shimmer{0%{background-position:-480px 0}100%{background-position:480px 0}}
@keyframes eb-pulse{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes eb-indet{0%{left:-40%;width:40%}50%{width:55%}100%{left:100%;width:40%}}
@keyframes eb-bardots{0%,80%,100%{transform:scaleY(.4);opacity:.5}40%{transform:scaleY(1);opacity:1}}
.eb-skel{background:linear-gradient(90deg,#eef1f7 25%,#e3e8f2 37%,#eef1f7 63%);background-size:480px 100%;animation:eb-shimmer 1.3s ease-in-out infinite;border-radius:8px}
@media (prefers-color-scheme:dark){.eb-skel{background:linear-gradient(90deg,#1e2433 25%,#283049 37%,#1e2433 63%);background-size:480px 100%}}
`;
    document.head.appendChild(s);
  }, []);
}

/* 1 — Spinner: a simple ring, size & color configurable */
export function Spinner({ size = 22, stroke = 3, color = "var(--accent, #6c5ce7)", style }) {
  useLoaderCss();
  return (
    <span aria-label="Loading" role="status" style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      border: `${stroke}px solid rgba(120,130,160,.25)`, borderTopColor: color,
      animation: "eb-spin .7s linear infinite", ...style,
    }} />
  );
}

/* 2 — Skeleton: shimmering placeholder block (or a stack of lines) */
export function Skeleton({ w = "100%", h = 14, r = 8, lines = 1, gap = 8, style }) {
  useLoaderCss();
  if (lines > 1) {
    return (
      <div style={{ display: "grid", gap, ...style }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="eb-skel" style={{ width: i === lines - 1 ? "70%" : w, height: h, borderRadius: r }} />
        ))}
      </div>
    );
  }
  return <div className="eb-skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

/* a ready-made skeleton for a table/list while it loads */
export function SkeletonList({ rows = 6, style }) {
  return (
    <div style={{ display: "grid", gap: 10, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px", gap: 12, alignItems: "center" }}>
          <Skeleton w={40} h={40} r={10} />
          <Skeleton lines={2} />
          <Skeleton w={70} h={24} r={8} />
        </div>
      ))}
    </div>
  );
}

/* 3 — ProgressBar: determinate (value 0–100) or indeterminate (value undefined) */
export function ProgressBar({ value, height = 10, color = "var(--navy, #0b3c8c)", track = "rgba(120,130,160,.18)", style }) {
  useLoaderCss();
  const indet = value == null || isNaN(value);
  return (
    <div style={{ position: "relative", height, borderRadius: 99, background: track, overflow: "hidden", ...style }}>
      {indet
        ? <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 99, background: color, animation: "eb-indet 1.1s ease-in-out infinite" }} />
        : <div style={{ height: "100%", width: Math.max(0, Math.min(100, value)) + "%", borderRadius: 99, background: color, transition: "width .25s ease" }} />}
    </div>
  );
}

/* 4 — PulsingBar: equaliser-style bars that pulse (a lively "working" cue) */
export function PulsingBar({ color = "var(--accent, #6c5ce7)", size = 22, style }) {
  useLoaderCss();
  return (
    <span role="status" aria-label="Loading" style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, height: size, ...style }}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: 4, height: "100%", borderRadius: 3, background: color, transformOrigin: "bottom", animation: `eb-bardots 1s ease-in-out ${i * 0.12}s infinite` }} />
      ))}
    </span>
  );
}

/* 5 — ButtonLoader: inline spinner + label, for a button's busy state.
   Usage: <button disabled={busy}>{busy ? <ButtonLoader label="Saving…"/> : "Save"}</button> */
export function ButtonLoader({ label = "", color = "currentColor", size = 15 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Spinner size={size} stroke={2} color={color} />
      {label}
    </span>
  );
}

/* 6 — FullScreenLoader: centred overlay for first loads / route transitions */
export function FullScreenLoader({ label = "Loading…", fixed = true, blur = true }) {
  useLoaderCss();
  return (
    <div style={{
      position: fixed ? "fixed" : "absolute", inset: 0, zIndex: 9999,
      display: "grid", placeItems: "center",
      background: "rgba(245,247,252,.72)", backdropFilter: blur ? "blur(6px)" : "none",
      WebkitBackdropFilter: blur ? "blur(6px)" : "none",
    }}>
      <div style={{ display: "grid", gap: 14, justifyItems: "center" }}>
        <Spinner size={42} stroke={4} />
        {label && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy, #0b3c8c)" }}>{label}</div>}
      </div>
    </div>
  );
}
