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
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Avatar } from "../lib/avatar.jsx";
import { visibleUsers, hodNamesOf, taskMatchesPlace } from "../lib/scope.js";

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
export function WeekBars({ days, height = 190, unit = "", fmt }) {
  const f = fmt || ((v) => String(v));
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
              onMouseMove={(e) => show(e, <>{d.full || d.label}<small>{f(v)}{unit ? " " + unit : ""}{d.note ? " · " + d.note : ""}</small></>)}>
              {/* the single direct label, above the best day */}
              {hasAny && i === best && v > 0 && (
                <div style={{ position: "absolute", bottom: h + 10, background: "var(--dx-card)", color: "var(--dx-ink)",
                  boxShadow: "0 0 0 1px var(--dx-ring-strong), 0 4px 10px rgba(15,27,51,.08)", borderRadius: 7,
                  padding: "2px 7px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", zIndex: 2 }}>
                  {f(v)}{unit ? " " + unit : ""}
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
          <div key={i} title={d.full || d.label} style={{ textAlign: "center", fontSize: 11.5, fontWeight: d.isToday ? 800 : 600,
            color: d.isToday ? "var(--dx-ink)" : "var(--dx-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
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
export function HalfDonut({ segments, center, centerLabel, size = 240, fmt }) {
  const ff = fmt || ((v) => (Number(v) || 0).toLocaleString("en-IN"));
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
        <path d={arc(Math.PI, 0)} fill="none" strokeWidth={W} style={{ stroke: "var(--dx-grid)" }} />
        {parts.filter((p) => p.span > 0).map((p, i) => {
          const g = p.span > GAP * 3 ? GAP : 0;
          return (
            <path key={i} d={arc(p.from - g / 2, p.to + g / 2)} fill="none" strokeWidth={W}
              style={{ stroke: p.color, cursor: "default", transition: "opacity .15s" }}
              onMouseMove={(e) => show(e, <>{p.label}<small>{ff(p.value)} · {total ? Math.round((p.value / total) * 100) : 0}%</small></>)} />
          );
        })}
        <text x={cx} y={cy - 14} textAnchor="middle" style={{ fontSize: 34, fontWeight: 800, fill: "var(--dx-ink)", fontFamily: "var(--font-body)" }}>{center}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 600, fill: "var(--dx-mute)", fontFamily: "var(--font-body)" }}>{centerLabel}</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
        {segments.map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dx-ink-2)", fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            {s.label} <b style={{ color: "var(--dx-ink)" }}>{ff(s.value)}</b>
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


/* ================================================================ shared page
   Every dashboard is the same frame: a title with a live time under it, the
   actions on the right, one row of filters, then the cards. */
export const ORD = ["var(--dx-o1)", "var(--dx-o2)", "var(--dx-o3)", "var(--dx-o4)"];

export const money = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 10000000) return "₹" + (v / 10000000).toFixed(2).replace(/\.?0+$/, "") + " Cr";
  if (Math.abs(v) >= 100000) return "₹" + (v / 100000).toFixed(2).replace(/\.?0+$/, "") + " L";
  return "₹" + Math.round(v).toLocaleString("en-IN");
};
export const num = (n) => (Number(n) || 0).toLocaleString("en-IN");
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function DxPage({ title, sub, actions, children }) {
  const now = useNow(1000);
  return (
    <div className="dx dx-plane">
      <div className="dx-head">
        <div>
          <div className="dx-title">{title}</div>
          <div className="dx-sub">{sub}{sub ? " — " : ""}{new Date(now).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</div>
        </div>
        {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return <div><label>{label}</label>{children}</div>;
}

export function RefreshBtn({ onClick, busy }) {
  return (
    <button className="dx-btn" onClick={onClick} disabled={busy}>
      <RefreshCw size={15} style={busy ? { animation: "ebspin .8s linear infinite" } : undefined} /> Refresh
    </button>
  );
}

/* Before anything is fetched: one card that says what pressing Show will do. */
export function ShowGate({ onShow, busy, what = "the dashboard" }) {
  return (
    <div className="dx-card" style={{ textAlign: "center", padding: "56px 20px" }}>
      <div style={{ width: 64, height: 64, margin: "0 auto 16px", borderRadius: 18, display: "grid", placeItems: "center",
        background: "var(--dx-info-bg)", color: "var(--dx-accent-ink)", fontSize: 28 }} aria-hidden="true">◔</div>
      <div style={{ fontWeight: 800, fontSize: 16, color: "var(--dx-ink)" }}>{busy ? "Loading " + what + "…" : "Choose your filters, then press Show"}</div>
      <div style={{ fontSize: 12.5, color: "var(--dx-mute)", marginTop: 6 }}>
        {busy ? "Reading the latest figures from the server" : "Nothing is downloaded until you ask — the panel stays quick for everyone."}
      </div>
      {!busy && <button className="dx-btn dx-btn-p" style={{ marginTop: 18, padding: "10px 34px" }} onClick={onShow}>Show</button>}
      {busy && <div className="eb-spin" style={{ margin: "18px auto 0" }} />}
    </div>
  );
}

/* ---------------------------------------------------------------- rank bars
   Who leads, as horizontal meters: a name, a light track, a deep fill and the
   figure in ink at the end. One series, so no legend — the title names it. */
export function RankBars({ items, fmt = num, limit = 8, photoOf, sub, empty = "Nothing to show." }) {
  const list = (items || []).slice(0, limit);
  const max = Math.max(1, ...list.map((x) => Number(x.value) || 0));
  if (!list.length) return <div className="dx-empty">{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {list.map((x, i) => (
        <div key={x.label + i} style={{ display: "grid", gridTemplateColumns: photoOf ? "30px minmax(0,1fr) auto" : "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}
          title={`${x.label}: ${fmt(x.value)}${x.note ? " · " + x.note : ""}`}>
          {photoOf && <Avatar name={x.label} photo={photoOf(x.label)} size={30} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--dx-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.label}</span>
              {(x.note || sub) && <span style={{ fontSize: 11, color: "var(--dx-mute)", whiteSpace: "nowrap" }}>{x.note || sub}</span>}
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "var(--dx-100)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.max(2, ((Number(x.value) || 0) / max) * 100) + "%", borderRadius: 99,
                background: i === 0 ? "var(--dx-600)" : "#86b6ef", transition: "width .6s cubic-bezier(.2,.7,.2,1)" }} />
            </div>
          </div>
          <b style={{ fontSize: 13, color: "var(--dx-ink)", fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" }}>{fmt(x.value)}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- pipeline
   Stages in the order work moves through them. Each tile is a step of the
   one blue ramp, deepest at the end, and between tiles sits the share that
   made it that far — so the drop-off reads without any arithmetic. */
export function Pipeline({ steps }) {
  const first = Number(steps[0] && steps[0].value) || 0;
  return (
    <div className="dx-pipe">
      {steps.map((s, i) => {
        const dark = i >= steps.length - 2;
        return (
          <div key={s.label} className="dx-pipe-step" style={{ background: s.color || ORD[steps.length - 1 - i] || ORD[3],
            color: dark ? "var(--dx-on-deep)" : "var(--dx-on-light)" }} title={s.note || ""}>
            <div className="dx-pipe-v">{num(s.value)}</div>
            <div className="dx-pipe-l">{s.label}</div>
            {i > 0 && first > 0 && <div className="dx-pipe-p">{pct(s.value, first)}% of all</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- recent list */
export function RowList({ rows, empty = "Nothing yet." }) {
  if (!rows || !rows.length) return <div className="dx-empty">{empty}</div>;
  return rows.map((r, i) => (
    <div key={r.key || i} className="dx-list-row">
      <Avatar name={r.avatar || r.title} photo={r.photo} size={30} />
      <div className="dx-list-main">
        <div className="dx-list-name">{r.title}</div>
        <div className="dx-list-meta">{r.meta}</div>
      </div>
      {r.right}
    </div>
  ));
}

/* a pill for any free-text status: the word always shows, the colour only helps */
export function WordPill({ text, tone = "info" }) {
  const icon = { good: "✓", bad: "×", warn: "!", info: "◷", mute: "–" }[tone] || "•";
  return <span className={"dx-pill " + tone}><span aria-hidden="true">{icon}</span>{text}</span>;
}

/* dd/mm/yyyy, yyyy-mm-dd, or anything Date can read */
export function readDate(v) {
  const raw = String(v || "").trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}
const MS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* the last n months ending this one, each with how many rows fell in it */
export function monthBars(rows, dateOf, n = 12, valueOf = () => 1) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth(), label: MS[d.getMonth()], full: MS[d.getMonth()] + " " + d.getFullYear(), value: 0, isToday: i === 0 });
  }
  (rows || []).forEach((r) => {
    const d = dateOf(r);
    if (!d) return;
    const b = out.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
    if (b) b.value += Number(valueOf(r)) || 0;
  });
  return out;
}
export function countBy(rows, keyOf, valueOf = () => 1) {
  const m = new Map();
  (rows || []).forEach((r) => {
    const k = String(keyOf(r) || "").trim() || "—";
    m.set(k, (m.get(k) || 0) + (Number(valueOf(r)) || 0));
  });
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/* ---------------------------------------------------------------- place filters
   Zone, State, HOD and Person, worked out from the people — a record only
   names who it belongs to, so the filters look that person up. The lists on
   offer are limited to the people this login can see. */
export function usePlaceFilter(users) {
  const [zone, setZone] = useState("");
  const [state, setState] = useState("");
  const [hod, setHod] = useState("");
  const [person, setPerson] = useState("");
  const vis = useMemo(() => visibleUsers(users || []).filter((u) => u.status == null || u.status == 1 || u.status === "1"), [users]);
  const zones = useMemo(() => [...new Set(vis.map((u) => String(u.zone || "").trim()).filter(Boolean))].sort(), [vis]);
  const states = useMemo(() => [...new Set(vis.flatMap((u) => [u.state, ...String(u.states || "").split(",")]).map((x) => String(x || "").trim()).filter(Boolean))].sort(), [vis]);
  const hods = useMemo(() => hodNamesOf(vis.length ? vis : users || []), [vis, users]);
  const any = !!(zone || state || hod || person);
  const match = (name) => {
    if (!any) return true;
    if (person && String(name || "").trim().toLowerCase() !== person.toLowerCase()) return false;
    return taskMatchesPlace({ assignee: String(name || "") }, users || [], { zone, state, hod });
  };
  /* a record that names several people matches when any of them does */
  const matchAny = (names) => !any || names.filter(Boolean).some((n) => match(n));
  const clear = () => { setZone(""); setState(""); setHod(""); setPerson(""); };
  const fields = (
    <>
      <Field label="Zone"><select value={zone} onChange={(e) => setZone(e.target.value)}><option value="">All zones</option>{zones.map((z) => <option key={z}>{z}</option>)}</select></Field>
      <Field label="State"><select value={state} onChange={(e) => setState(e.target.value)}><option value="">All states</option>{states.map((z) => <option key={z}>{z}</option>)}</select></Field>
      <Field label="HOD"><select value={hod} onChange={(e) => setHod(e.target.value)}><option value="">All HODs</option>{hods.map((z) => <option key={z}>{z}</option>)}</select></Field>
      <Field label="Person"><select value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Everyone</option>{vis.map((u) => <option key={u.id || u.name} value={u.name}>{u.name}</option>)}</select></Field>
    </>
  );
  return { zone, state, hod, person, any, match, matchAny, clear, fields, vis };
}

export function useDateRange() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inRange = (d) => {
    if (!from && !to) return true;
    if (!d) return false;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (from && k < from) return false;
    if (to && k > to) return false;
    return true;
  };
  const fields = (
    <>
      <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
    </>
  );
  return { from, to, any: !!(from || to), inRange, clear: () => { setFrom(""); setTo(""); }, fields };
}

/* the time of day, ticking — the night card's headline */
export function TodayClock({ label }) {
  const now = useNow(1000);
  const d = new Date(now);
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const two = (n) => String(n).padStart(2, "0");
  return (
    <div>
      <div className="dx-clock">{two(h)}<span className="sep">:</span>{two(d.getMinutes())}<span className="sep">:</span>{two(d.getSeconds())}
        <span style={{ fontSize: 16, marginLeft: 8, opacity: .7 }}>{ap}</span></div>
      <div style={{ fontSize: 12, color: "rgba(233,240,255,.65)", marginTop: 4 }}>
        {label || d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
      </div>
    </div>
  );
}

/* names in a night card — who is out right now, with one figure each */
export function NightList({ title, rows, empty }) {
  return (
    <div className="dx-also">
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(233,240,255,.5)", marginBottom: 2 }}>{title}</div>
      {rows.length === 0 ? <div className="dx-also-row">{empty}</div> : rows.map((r, i) => (
        <div key={r.label + i} className="dx-also-row">
          <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}><b>{r.label}</b>{r.sub && <span style={{ fontSize: 11 }}>{r.sub}</span>}</span>
          <span className="t">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
