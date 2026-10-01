/* Reloading a screen on a timer, but only while someone is looking at it.

   Several screens re-read from the server every minute. That timer used to keep
   running when the phone was in a pocket or the browser tab was in the
   background, so four hundred phones kept asking for lists nobody was reading —
   work the server was doing instead of answering the people who were actually
   using it, which is felt as the app being slow for everyone.

   This runs the reload once when the screen opens, then on its timer only while
   the screen is on show, and once more the moment someone comes back to it, so
   what they see is current without the idle traffic in between.

   This is only for reading lists. It has nothing to do with location tracking,
   which keeps its own timing and must keep running in the background. */
import { useEffect, useRef } from "react";

export function useVisiblePoll(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    let timer = null;
    const run = () => { try { ref.current && ref.current(); } catch {} };

    const start = () => { if (timer == null && ms > 0) timer = setInterval(run, ms); };
    const stop = () => { if (timer != null) { clearInterval(timer); timer = null; } };

    const onVis = () => {
      if (document.visibilityState === "visible") { run(); start(); } else stop();
    };

    run();
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [ms]);
}
