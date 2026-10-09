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

const TINTS = [
  ["#4b5cf0", "#7b5cf0"], ["#0f9d58", "#34c38f"], ["#e8710a", "#f5a623"],
  ["#c2185b", "#e8578a"], ["#00838f", "#26c6da"], ["#5e35b1", "#9575cd"],
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
      fontFamily: "Bricolage Grotesque",
      fontSize: Math.max(10, Math.round(size * 0.38)),
      letterSpacing: 0.3,
    }}>
      {initialsOf(name)}
    </div>
  );
}
