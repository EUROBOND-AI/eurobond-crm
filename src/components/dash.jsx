/* The dashboard kit — one set of pieces every dashboard is built from.

   Colours are steps of one blue ramp, checked with the palette validator
   rather than chosen by eye:
     gauge   #184f95 / #3987e5 / #86b6ef  — ordinal, passes in light and dark
     bars    #86b6ef (other days) / #184f95 (today) — ordinal, passes
   On-time green and late red fail the colour-blind check against each other
   (they always do), so they are never used alone: every status carries an
   icon and a word as well.

   Figures — the big numbers — stay in the body sans like all the other text.
   The display face is for page titles only. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

/* ---------------------------------------------------------------- numbers */
export const fmtInt = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 100000) return (v / 100000).toFixed(1).replace(/\.0$/, "") + "L";
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
};

/* ---------------------------------------------------------------- KPI card */
export function KpiCard({ label, value, sub, chip, hero = false, onClick, title }) {
  return (
    <div className={"dx-card" + (hero ? " dx-hero" : "")} onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }} title={title}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, position: "relative", zIndex: 1 }}>
        <div className="dx-kpi-label">{label}</div>
        <span className="dx-arrow" aria-hidden="true"><ArrowUpRight size={16} strokeWidth={2.2} /></span>
      </div>
      <div className="dx-kpi-value" style={{ position: "relative", zIndex: 1 }}>{value}</div>
      {(sub || chip) && (
        <div className="dx-kpi-sub" style={{ position: "relative", zIndex: 1 }}>
          {chip != null && <span className="dx-chip">{chip}</span>}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- panel */
export function Panel({ title, sub, action, children, className = "", night = false, style }) {
  return (
    <div className={"dx-card " + (night ? "dx-night " : "") + className} style={style}>
      {(title || action) && (
        <div className="dx-card-h" style={{ position: "relative", zIndex: 1 }}>
          <div>
            {title && <div className="dx-card-t" style={night ? { color: "#e9f0ff" } : undefined}>{title}</div>}
            {sub && <div className="dx-card-s" style={night ? { color: "rgba(233,240,255,.65)" } : undefined}>{sub}</div>}
          </div>
          {action}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- status */
/* Never colour alone: an icon and a word ride along every time. */
const STATUS = {
  ontime:   { cls: "good", icon: "✓", word: "On time" },
  late:     { cls: "bad",  icon: "!", word: "Late" },
  overdue:  { cls: "bad",  icon: "⏱", word: "Overdue" },
  open:     { cls: "info", icon: "◷", word: "Open" },
  soon:     { cls: "warn", icon: "⚑", word: "Due soon" },
  done:     { cls: "good", icon: "✓", word: "Done" },
  none:     { cls: "mute", icon: "–", word: "No deadline" },
  rejected: { cls: "mute", icon: "×", word: "Rejected" },
};
export function StatusPill({ kind, text }) {
  const s = STATUS[kind] || STATUS.none;
  return <span className={"dx-pill " + s.cls}><span aria-hidden="true">{s.icon}</span>{text || s.word}</span>;
}

/* ---------------------------------------------------------------- tooltip */
function useTip() {
  const [tip, setTip] = useState(null);
  const host = useRef(null);
  const show = (e, content) => {
    const box = host.current ? host.current.getBoundingClientRect() : { left: 0, top: 0 };
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content });
  };
  return { tip, host, show, hide: () => setTip(null) };
}

/* ---------------------------------------------------------------- week bars
   A meter per day: the track is a light step of the blue ramp, the fill
   carries the count. Today is the deep step, the other days the light one —
   one series, so no legend; the panel title says what it is. Exactly one
   value is labelled on the chart (the best day), the rest live in the hover.
*/
export function WeekBars({ days, height = 190, unit = "" }) {
  const { tip, host, show, hide } = useTip();
  const max = Math.max(1, ...days.map((d) => Number(d.value) || 0));
  const best = days.reduce((bi, d, i) => ((Number(d.value) || 0) > (Number(days[bi].value) || 0) ? i : bi), 0);
  const hasAny = days.some((d) => Number(d.value) > 0);
  return (
    <div ref={host} style={{ position: "relative" }} onMouseLeave={hide}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)`, alignItems: "end", gap: 10, height }}>
        {days.map((d, i) => {
          const v = Number(d.value) || 0;
          const h = Math.round((v / max) * (height - 28));
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", position: "relative" }}
              onMouseMove={(e) => show(e, <>{d.full || d.label}<small>{v}{unit ? " " + unit : ""}{d.note ? " · " + d.note : ""}</small></>)}>
              {/* the single direct label, above the best day */}
              {hasAny && i === best && v > 0 && (
                <div style={{ position: "absolute", bottom: h + 10, background: "var(--dx-card)", color: "var(--dx-ink)",
                  boxShadow: "0 0 0 1px var(--dx-ring-strong), 0 4px 10px rgba(15,27,51,.08)", borderRadius: 7,
                  padding: "2px 7px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", zIndex: 2 }}>
                  {v}{unit ? " " + unit : ""}
                </div>
              )}
              {/* track */}
              <div style={{ width: "100%", maxWidth: 40, height: height - 28, borderRadius: 999, background: "var(--dx-100)",
                position: "relative", overflow: "hidden" }}>
                {/* fill */}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, borderRadius: 999,
                  background: d.isToday ? "var(--dx-600)" : "#86b6ef", transition: "height .6s cubic-bezier(.2,.7,.2,1)" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 10, marginTop: 8 }}>
        {days.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11.5, fontWeight: d.isToday ? 800 : 600,
            color: d.isToday ? "var(--dx-ink)" : "var(--dx-mute)" }}>{d.label}</div>
        ))}
      </div>
      {tip && <div className="dx-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- half donut
   Part of a whole, as a semicircle. Segments are separated by a 2px gap in
   the surface colour rather than outlined. Two or more parts, so there is a
   legend underneath — a dot beside each word, the word itself in ink.
*/
export function HalfDonut({ segments, center, centerLabel, size = 240 }) {
  const { tip, host, show, hide } = useTip();
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const R = size / 2 - 16;
  const W = 28;
  const cx = size / 2;
  const cy = size / 2;
  const GAP = 2 / R;               // 2px of arc, in radians
  const arc = (a0, a1) => {
    const p = (a) => [cx + R * Math.cos(a), cy - R * Math.sin(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };
  let a = Math.PI;
  const parts = total > 0
    ? segments.map((s) => {
        const span = ((Number(s.value) || 0) / total) * Math.PI;
        const from = a;
        a -= span;
        return { ...s, from, to: a, span };
      })
    : [];
  return (
    <div ref={host} style={{ position: "relative" }} onMouseLeave={hide}>
      <svg viewBox={`0 0 ${size} ${size / 2 + 10}`} style={{ width: "100%", maxWidth: size, display: "block", margin: "0 auto" }} role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {/* the empty track, so a zero reads as zero and not as missing */}
        <path d={arc(Math.PI, 0)} fill="none" stroke="var(--dx-grid)" strokeWidth={W} />
        {parts.filter((p) => p.span > 0).map((p, i) => {
          const g = p.span > GAP * 3 ? GAP : 0;
          return (
            <path key={i} d={arc(p.from - g / 2, p.to + g / 2)} fill="none" stroke={p.color} strokeWidth={W}
              style={{ cursor: "default", transition: "opacity .15s" }}
              onMouseMove={(e) => show(e, <>{p.label}<small>{p.value} · {total ? Math.round((p.value / total) * 100) : 0}%</small></>)} />
          );
        })}
        <text x={cx} y={cy - 14} textAnchor="middle" style={{ fontSize: 34, fontWeight: 800, fill: "var(--dx-ink)", fontFamily: "var(--font-body)" }}>{center}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 600, fill: "var(--dx-mute)", fontFamily: "var(--font-body)" }}>{centerLabel}</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
        {segments.map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dx-ink-2)", fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            {s.label} <b style={{ color: "var(--dx-ink)" }}>{s.value}</b>
          </span>
        ))}
      </div>
      {tip && <div className="dx-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- live clock
   Counts down to a moment, every second, while the screen is open. Once the
   moment has passed it keeps counting — upward — so how late something is
   stays visible instead of freezing at zero.
*/
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function splitClock(msLeft) {
  const past = msLeft < 0;
  let s = Math.floor(Math.abs(msLeft) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const two = (n) => String(n).padStart(2, "0");
  return { past, d, hh: two(h), mm: two(m), ss: two(s) };
}

export function LiveClock({ target, now }) {
  const t = target ? new Date(target).getTime() : NaN;
  if (!t || isNaN(t)) return <div className="dx-clock" style={{ opacity: .5 }}>--<span className="sep">:</span>--<span className="sep">:</span>--</div>;
  const c = splitClock(t - now);
  return (
    <div className="dx-clock" style={{ color: c.past ? "#ff9b9b" : undefined }}>
      {c.past && <span style={{ fontSize: 26, verticalAlign: "middle", marginRight: 4 }}>+</span>}
      {c.d > 0 && <span>{c.d}<span style={{ fontSize: 20, opacity: .7, marginRight: 8 }}>d</span></span>}
      {c.hh}<span className="sep">:</span>{c.mm}<span className="sep">:</span>{c.ss}
    </div>
  );
}

/* ---------------------------------------------------------------- misc */
export function useWeek(now = new Date()) {
  return useMemo(() => {
    const out = [];
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    /* the week that ends today, so today is always the last, deep bar */
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      out.push(d);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [new Date(now).toDateString()]);
}
