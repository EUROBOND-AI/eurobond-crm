/* Tap any photo anywhere (notifications, admin, dashboards, check-in,
   attendance, forms) and it opens large in a circular view. Mounted once per
   shell; it listens for clicks on real photos (uploaded images / data URLs),
   not icons or logos, and shows only the zoom so an underlying card does not
   also fire. */
import { useEffect, useState } from "react";

const isPhoto = (img) => {
  const s = img.currentSrc || img.src || "";
  if (!s) return false;
  if (/^data:image\//i.test(s) || /^blob:/i.test(s)) return true;
  if (/(upload|\/photos?\/|attach|selfie|invoice|avatar|\.(jpe?g|png|webp|heic))/i.test(s)) return true;
  return false;
};

export default function PhotoZoom() {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const onClick = (e) => {
      const img = e.target && e.target.closest ? e.target.closest("img") : null;
      if (!img) return;
      if (img.closest("[data-euva]") || img.closest("[data-nozoom]")) return;
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      if (/logo|brand|icon|flag/.test(alt)) return;
      let r; try { r = img.getBoundingClientRect(); } catch { return; }
      if (r.width < 34 || r.height < 34) return;         // skip tiny icons / avatars
      if (!isPhoto(img)) return;
      const s = img.currentSrc || img.src;
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
