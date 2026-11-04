/* Tap a PERSON'S photo (a face drawn by the Avatar component — notifications,
   admin, dashboards, check-in, attendance) and it opens large in a circular
   view. Mounted once per shell. It fires ONLY for images marked
   data-userphoto, so product pictures, invoices, selfies and other attachments
   keep opening the normal way, exactly as before. */
import { useEffect, useState } from "react";

export default function PhotoZoom() {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const onClick = (e) => {
      const img = e.target && e.target.closest ? e.target.closest("img") : null;
      if (!img) return;
      if (img.closest("[data-euva]") || img.closest("[data-nozoom]")) return;
      /* only a user photo (Avatar). everything else is left to open as it did before */
      if (!img.hasAttribute("data-userphoto") && !img.closest("[data-userphoto]")) return;
      const s = img.currentSrc || img.src;
      if (!s) return;
      e.preventDefault(); e.stopPropagation();
      setSrc(s);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  if (!src) return null;
  const close = () => setSrc(null);
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(6,10,25,.86)", zIndex: 2147483600, display: "grid", placeItems: "center", padding: 20 }}>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(86vw, 440px)", height: "min(86vw, 440px)", objectFit: "cover", borderRadius: "50%", border: "5px solid #fff", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }} />
      <button onClick={close} aria-label="Close" style={{ position: "fixed", top: 18, right: 18, width: 44, height: 44, borderRadius: "50%", border: "none", background: "#fff", color: "#1a2236", fontSize: 24, lineHeight: "44px", cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,.4)" }}>×</button>
    </div>
  );
}
