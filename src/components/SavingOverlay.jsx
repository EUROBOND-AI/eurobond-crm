/* "Saving…" while anything is being written.

   One badge for the whole app, driven by the request layer rather than by each
   screen deciding for itself — some screens said nothing at all, so a save on
   a slow connection looked like a button that had not worked and people
   pressed it twice.

   It waits a moment before appearing: a save that finishes in a blink should
   not make the screen flicker. It sits over everything and lets nothing
   through, because a second press while the first is still going is exactly
   what produced duplicate rows. */
import { useEffect, useState } from "react";
import { onSaving } from "../lib/api.js";

export default function SavingOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer = null;
    const off = onSaving((busy) => {
      if (busy) {
        if (!timer) timer = setTimeout(() => setShow(true), 180);
      } else {
        if (timer) { clearTimeout(timer); timer = null; }
        setShow(false);
      }
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2147483000,
      background: "rgba(10,16,40,.28)", display: "grid", placeItems: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "16px 22px",
        boxShadow: "0 18px 50px rgba(15,20,45,.3)",
        display: "flex", alignItems: "center", gap: 12,
        fontWeight: 800, fontSize: 14, color: "var(--navy, #1f3a68)",
        fontFamily: "inherit",
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          border: "2.5px solid #d7dcef", borderTopColor: "var(--navy, #1f3a68)",
          display: "inline-block", animation: "eb-save-spin .7s linear infinite",
        }} />
        Saving…
      </div>
      <style>{"@keyframes eb-save-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
