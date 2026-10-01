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

export function startRefresh() {
  if (busy) return;
  setBusy(true);
  try { clearApiCache(); } catch {}
  try { window.__ebLoadLists && window.__ebLoadLists(); } catch {}
  try { window.dispatchEvent(new Event("eb-app-resumed")); } catch {}
  /* long enough to read as a refresh, short enough not to be in the way */
  setTimeout(() => setBusy(false), 1100);
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
