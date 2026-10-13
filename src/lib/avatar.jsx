/* Faces — one place, so the panel and the phone draw them the same way.

   A photo is stored as the path upload.php gave back ("uploads/ab12.jpg"), not
   as the picture itself, so it has to be turned back into a full address before
   an <img> can load it; a relative path alone shows nothing on the phone, where
   the app is not served from the same place as the API.

   Where there is no photo the initials stand in, on a colour derived from the
   name so the same person always gets the same one. */

import { API_BASE } from "./api.js";

export function fileUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  return `${API_BASE.replace(/\/$/, "")}/${s.replace(/^\//, "")}`;
}

export function initialsOf(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/* One family of blues, so a row of faces sits inside the brand instead of
   on top of it. Each pair is distinct enough that two neighbours read as two
   people; the initials carry the identity, the colour only separates. */
const TINTS = [
  ["#184f95", "#3987e5"], ["#0d366b", "#256abf"], ["#1c5cab", "#6da7ec"],
  ["#0e5e7a", "#2a9bc4"], ["#3b4fb8", "#6f83e8"], ["#1f3f73", "#4f7fc4"],
];
export function tintFor(name) {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return TINTS[h % TINTS.length];
}

/* One round face. size is the diameter in pixels. */
export function Avatar({ name, photo, size = 40, ring = "" }) {
  const src = fileUrl(photo);
  const [a, b] = tintFor(name);
  const base = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: "50%",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxShadow: ring ? `0 0 0 2px ${ring}` : "none",
  };
  if (src) {
    return (
      <div style={base}>
        <img src={src} alt={name || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{
      ...base,
      background: `linear-gradient(135deg,${a},${b})`,
      color: "#fff",
      fontWeight: 800,
      /* the fallback matters: without one, a moment before the web font
         arrives the initials were drawn in the browser's serif */
      fontFamily: "var(--font-body), system-ui, sans-serif",
      fontSize: Math.max(10, Math.round(size * 0.38)),
      letterSpacing: 0.3,
    }}>
      {initialsOf(name)}
    </div>
  );
}
