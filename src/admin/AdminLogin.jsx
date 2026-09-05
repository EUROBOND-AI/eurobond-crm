import logoImg from "../assets/logo.jpg";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Users, User, Eye, EyeOff, ArrowLeft, ShieldCheck } from "lucide-react";
import { api, auth } from "../lib/api.js";

/* Backend login. Two modes:
   - Backend Team: password login. Only users added in "Admin Users" (any role) can enter.
   - Individual: any app user can view their own login (role-limited). */
export default function AdminLogin() {
  const nav = useNavigate();
  const [tab, setTab] = useState("team");
  const [show, setShow] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!u || !p) { setErr(tab === "team" ? "Please enter username and password" : "Please enter mobile and password"); return; }
    setBusy(true); setErr("");
    try {
      /* built-in owner account — full access to every module incl. API Keys & System Health */
      if (tab === "team" && u.trim().toLowerCase() === "karthi g" && p === "818695") {
        auth.setOwner({ name: "Karthi G", username: "karthi.g", role: "Admin", owner: true });
        try { sessionStorage.setItem("eb_admin_session", "1"); } catch {}
        nav("/admin/dashboards/expense");
        return;
      }
      if (tab === "team") {
        /* Backend panel — username + password, validated against Admin Users (separate from app) */
        await api.adminLogin(u.trim(), p);
      } else {
        /* Individual — app account (mobile + password) */
        await api.login(u.trim(), p);
      }
      try { sessionStorage.setItem("eb_admin_session", "1"); } catch {}
      nav("/admin/dashboards/expense");
    } catch (e) {
      setErr(e.message || "Login failed");
      setBusy(false);
    }
  };

  const isTeam = tab === "team";
  /* dark = the blue 3D panel; it sits on the RIGHT for Backend Team and slides to the
     LEFT (behind the form) for Individual, so each mode feels different. */
  const dark = "linear-gradient(150deg, #0b1437 0%, #1e2a63 45%, #4f46e5 100%)";

  const ArtPanel = (
    <div className="admin-login-art" style={{
      position: "relative", overflow: "hidden", background: dark, height: "100%",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: "48px 5vw", color: "#fff", transition: "all .55s cubic-bezier(.22,1,.36,1)",
    }}>
      <div style={{ position: "absolute", top: -120, right: -120, width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,110,240,0.55), transparent 70%)" }} />
      <div style={{ position: "absolute", bottom: -140, left: -80, width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)" }} />
      {/* floating 3D glass cards */}
      <div style={{ position: "absolute", top: "16%", right: "12%", width: 150, height: 96, borderRadius: 18, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", boxShadow: "0 24px 50px rgba(0,0,0,.35)" }} />
      <div style={{ position: "absolute", bottom: "18%", right: "22%", width: 118, height: 76, borderRadius: 16, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", boxShadow: "0 20px 44px rgba(0,0,0,.3)" }} />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 440, transition: "transform .8s cubic-bezier(.22,1,.36,1)" }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 18px", textShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
          {isTeam ? <>Eurobond CRM<br />Command Center</> : <>Your Workspace,<br />Your Numbers</>}
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.82)", margin: 0 }}>
          {isTeam
            ? "The single source of truth for your field operations — live attendance and GPS, enquiries, quotations, expenses, project projections and team performance, governed in real time."
            : "Secure, role-based access. You see exactly what belongs to you — your customers, enquiries, targets and performance, nothing more."}
        </p>
        <div style={{ display: "flex", gap: 26, marginTop: 40 }}>
          {[["1000+", "Field Users"], ["32+", "Integrated Modules"], ["24/7", "Live GPS Tracking"]].map(([n, l]) => (
            <div key={l} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, padding: "14px 16px", backdropFilter: "blur(10px)", minWidth: 116 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{n}</div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 2, fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const FormPanel = (
    <div style={{
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      height: "100vh", padding: "32px 6vw", background: isTeam ? "#fff" : "#f6f8ff",
      transition: "background .8s ease", 
    }}>
      <div style={{
        transition: "box-shadow .6s ease, border-color .6s ease",
        background: "#fff", borderRadius: 22, padding: "30px 30px", width: "100%", maxWidth: 420,
        maxHeight: "92vh", overflowY: "auto",
        boxShadow: isTeam
          ? "0 30px 70px rgba(15,23,42,.12), 0 6px 18px rgba(15,23,42,.06)"
          : "0 30px 70px rgba(79,70,229,.22), 0 6px 18px rgba(79,70,229,.12)",
        border: "1px solid " + (isTeam ? "#eef2f7" : "#e0e5ff"),
      }}>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, fontWeight: 700, marginBottom: 22, textDecoration: "none" }}>
          <ArrowLeft size={15} /> Back to portal
        </Link>

        <img src={logoImg} alt="Eurobond" style={{ height: 42, marginBottom: 18, display: "block" }} />

        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a", margin: "0 0 6px" }}>
          Hey, welcome back <span style={{ display: "inline-block" }}>👋</span>
        </h1>
        <p style={{ color: "#64748b", fontSize: 14.5, margin: "0 0 22px", lineHeight: 1.5 }}>
          {isTeam ? "Sign in to the Eurobond CRM backend." : "Sign in with your app account."}
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "#f1f5f9", padding: 5, borderRadius: 12 }}>
          <button onClick={() => { setTab("team"); setErr(""); }} style={tabBtn(isTeam)}><Users size={15} /> Backend Team</button>
          <button onClick={() => { setTab("individual"); setErr(""); }} style={tabBtn(!isTeam)}><User size={15} /> Individual</button>
        </div>

        <label style={lbl}>{isTeam ? "Username" : "Mobile Number"}</label>
        <input value={u} onChange={(e) => { setU(e.target.value); setErr(""); }} placeholder={isTeam ? "Your admin username" : "Your mobile / employee code"} autoCapitalize="none" style={inp} />

        <label style={lbl}>Password</label>
        <div style={{ position: "relative", marginBottom: 6 }}>
          <input type={show ? "text" : "password"} placeholder="••••••••" value={p}
            onChange={(e) => { setP(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ ...inp, marginBottom: 0, paddingRight: 44 }} />
          <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {err && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 700, margin: "12px 0 0" }}>{err}</div>}

        <button onClick={submit} disabled={busy} style={{ ...btn(busy), marginTop: 20 }}>
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 12.5 }}>
          <ShieldCheck size={15} /> {isTeam ? "Username + password — added under Admin Users." : "App account (mobile). You'll only see your own data."}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", fontFamily: "Inter, system-ui, sans-serif", background: isTeam ? "#fff" : "#f6f8ff", transition: "background .8s ease" }} className="admin-login-shell">
      {/* form sits on its half; the blue panel SLIDES slowly to the other half */}
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: isTeam ? 1 : 2, transition: "all .8s cubic-bezier(.22,1,.36,1)" }}>{FormPanel}</div>
      </div>
      <div className="admin-login-slide" style={{
        position: "absolute", top: 0, bottom: 0, width: "50%",
        left: isTeam ? "50%" : "0%",
        transition: "left .8s cubic-bezier(.22,1,.36,1)",
        boxShadow: "0 0 80px rgba(11,20,55,.45)",
        borderRadius: isTeam ? "28px 0 0 28px" : "0 28px 28px 0",
        overflow: "hidden",
      }}>
        {/* glass sheen that sweeps across while the panel slides */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
          background: "linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 65%)",
          transform: isTeam ? "translateX(-30%)" : "translateX(30%)",
          transition: "transform .8s cubic-bezier(.22,1,.36,1)",
        }} />
        {ArtPanel}
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 };
const inp = { width: "100%", padding: "13px 16px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 15, outline: "none", marginBottom: 16, boxSizing: "border-box", background: "#f8fafc" };
const btn = (busy) => ({ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: busy ? "#6366f1" : "linear-gradient(135deg, #4f46e5, #6d5cf0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: busy ? "default" : "pointer", boxShadow: "0 8px 20px rgba(79,70,229,0.28)" });
const tabBtn = (active) => ({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, background: active ? "#fff" : "transparent", color: active ? "#4f46e5" : "#64748b", boxShadow: active ? "0 2px 6px rgba(0,0,0,0.08)" : "none" });
