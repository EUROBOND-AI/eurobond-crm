/* The Refresh button, and the state that makes it spin.

   Pressing it rebuilds the screen that is open, which means the button itself is
   thrown away and built again — so "am I refreshing?" cannot live inside it, or
   the spinner would vanish the instant it started. It is kept here, outside the
   screen, and the button reads it. */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { clearApiCache } from "../lib/api.js";

let busy = false;
const listeners = new Set();

function setBusy(v) {
  busy = v;
  listeners.forEach((fn) => { try { fn(busy); } catch {} });
}

export function isRefreshing() { return busy; }

/* Reload the open screen, and keep spinning until the reloading is actually
   finished.

   The spinner used to run for a fixed moment and stop, whatever the screens
   were doing. On a weak connection that is the wrong way round: the button
   finished spinning while the answers were still on their way, so pressing
   Refresh looked like it only turned the icon and left the page as it was.

   Screens now hand back the work they start — see useAppRefresh — and the
   spinner waits for it. It stops as soon as everything has answered, or after
   fifteen seconds, so a request that never comes back cannot leave the button
   spinning for ever. */
export function startRefresh() {
  if (busy) return;
  setBusy(true);
  try { clearApiCache(); } catch {}

  const jobs = [];
  const track = (p) => { if (p && typeof p.then === "function") jobs.push(p); };

  try { track(window.__ebLoadLists && window.__ebLoadLists()); } catch {}

  /* every open screen reloads its own data and puts the work in `jobs` */
  try {
    window.dispatchEvent(new CustomEvent("eb-app-resumed", { detail: { jobs } }));
  } catch {
    try { window.dispatchEvent(new Event("eb-app-resumed")); } catch {}
  }

  /* and the screen itself is rebuilt, so screens that only load on opening
     load again too. This is the button, not a return from the background. */
  try { window.dispatchEvent(new Event("eb-refresh-pressed")); } catch {}

  const settled = Promise.allSettled(jobs);
  const capped = new Promise((done) => setTimeout(done, 15000));
  /* a floor of about half a second, or a fast reply makes the spin look like a
     flicker and leaves people unsure whether anything happened */
  const floor = new Promise((done) => setTimeout(done, 550));

  Promise.all([Promise.race([settled, capped]), floor])
    .then(() => setBusy(false))
    .catch(() => setBusy(false));
}

export default function RefreshBtn({ size = 17 }) {
  const [spinning, setSpinning] = useState(busy);
  useEffect(() => {
    listeners.add(setSpinning);
    setSpinning(busy);
    return () => listeners.delete(setSpinning);
  }, []);

  return (
    <button onClick={startRefresh} title="Refresh" aria-label="Refresh" disabled={spinning}
      style={{ background: "none", border: "none", cursor: spinning ? "default" : "pointer",
        padding: 4, display: "grid", placeItems: "center", color: "inherit" }}>
      <RefreshCw size={size} style={spinning ? { animation: "spin360 .8s linear infinite" } : undefined} />
    </button>
  );
}
