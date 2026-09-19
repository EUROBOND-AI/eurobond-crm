/* In-app camera for visiting cards.
   The phone's own camera app takes the whole frame, so the card ends up small
   and the text is hard to read. This shows a live preview with a card-shaped
   guide and crops to exactly that box, which makes the scan far more reliable. */
import { useEffect, useRef, useState } from "react";

export default function CardScanner({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const boxRef = useRef(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        setErr("Camera not available. Use the gallery option below.");
      }
    })();
    return () => {
      cancelled = true;
      try { streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
    };
  }, []);

  const shoot = () => {
    const v = videoRef.current, box = boxRef.current;
    if (!v || !box) return;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;

    /* map the on-screen guide box onto the real video frame */
    const vr = v.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const scale = Math.max(vw / vr.width, vh / vr.height);   // object-fit: cover
    const offX = (vw - vr.width * scale) / 2;
    const offY = (vh - vr.height * scale) / 2;
    const sx = Math.max(0, (br.left - vr.left) * scale + offX);
    const sy = Math.max(0, (br.top - vr.top) * scale + offY);
    const sw = Math.min(vw - sx, br.width * scale);
    const sh = Math.min(vh - sy, br.height * scale);

    const c = document.createElement("canvas");
    c.width = Math.round(sw); c.height = Math.round(sh);
    c.getContext("2d").drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], "card.jpg", { type: "image/jpeg" }));
      onClose();
    }, "image/jpeg", 0.92);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 900, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <video ref={videoRef} playsInline muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {/* card-shaped guide — a business card is roughly 85 x 55 mm */}
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div ref={boxRef}
            style={{ width: "86%", aspectRatio: "85 / 55", border: "3px solid #fff", borderRadius: 14, boxShadow: "0 0 0 4000px rgba(0,0,0,.55)" }}>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: -34, textAlign: "center", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>
              Place the card inside the box
            </div>
          </div>
        </div>

        {err && (
          <div style={{ position: "absolute", left: 16, right: 16, top: 16, background: "rgba(0,0,0,.75)", color: "#fff", padding: 12, borderRadius: 10, fontSize: 12.5 }}>
            {err}
          </div>
        )}
      </div>

      <div style={{ padding: "14px 16px calc(18px + env(safe-area-inset-bottom))", background: "#000", display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #444", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={shoot} disabled={!ready}
          style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: ready ? "#fff" : "#666", color: "#111", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          📷 Capture
        </button>
        <label style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #444", color: "#fff", fontWeight: 700, fontSize: 13, textAlign: "center", cursor: "pointer" }}>
          Gallery
          <input type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) { onCapture(f); onClose(); } }} />
        </label>
      </div>
    </div>
  );
}
