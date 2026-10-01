/* The bar across the top of every screen in the app: Back arrow, title, and
   Refresh.

   Three screens — Beat Plan, Biltrax and the Meeting Calendar — used to draw
   their own version of this bar, with the Back arrow as a boxed "‹" instead of
   the arrow every other screen uses and Refresh pushed out to the far edge. It
   lives in one place now, so every screen gets the same arrow in the same spot
   and nothing can drift again. */
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import RefreshBtn from "./RefreshBtn.jsx";

/* Where the Back arrow goes, worked out from the address itself. Browser
   history used to send it into the form that was just saved, or to a screen
   that no longer had its data, and the page came up empty. Every destination
   below is a real screen, so that cannot happen. */
export function parentOf(path) {
  const p = String(path || "").replace(/\/+$/, "");
  let m;
  if ((m = p.match(/^(\/app\/m\/[^/]+)\/(new|edit).*$/))) return m[1];
  if (/^\/app\/expense\/(new|format)/.test(p)) return "/app/expense";
  if (/^\/app\/leave\/new/.test(p)) return "/app/leave";
  if (/^\/app\/(followup|customer)\//.test(p)) return "/app/customers";
  if (/^\/app\/project\/new/.test(p)) return "/app/m/projectProjection";
  return "/app";
}

export default function ScreenHead({ title, back = true, right = null, refresh = true }) {
  const nav = useNavigate();
  const loc = useLocation();
  const goBack = () => {
    const to = parentOf(loc.pathname);
    nav(to === loc.pathname ? "/app" : to, { replace: true });
  };
  return (
    <div className="f-screen-head">
      {back && (
        <button onClick={goBack} aria-label="Back"
          style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "grid", placeItems: "center" }}>
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="grow" style={{ fontFamily: "Bricolage Grotesque", fontWeight: 700, fontSize: 16 }}>{title}</div>
      {right}
      {/* pull the latest from the server without leaving the screen. The Profile
          screen is the one place it is left out — nothing on it changes while
          you are looking at it. */}
      {refresh && <RefreshBtn />}
    </div>
  );
}
