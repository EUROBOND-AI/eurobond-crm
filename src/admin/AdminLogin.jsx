import logoImg from "../assets/logo.jpg";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Users, User, Eye, EyeOff, ArrowLeft, ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";

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
      if (tab === "team") {
        /* Backend panel — username + password, validated against Admin Users (separate from app) */
        await api.adminLogin(u.trim(), p);
      } else {
        /* Individual — app account (mobile + password) */
        await api.login(u.trim(), p);
      }
      nav("/admin/dashboards/expense");
    } catch (e) {
      setErr(e.message || "Login failed");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", fontFamily: "Inter, system-ui, sans-serif" }} className="admin-login-shell">
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 8vw", background: "#fff" }}>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, fontWeight: 700, marginBottom: 40, textDecoration: "none" }}>
          <ArrowLeft size={15} /> Back to portal
        </Link>

        <img src={logoImg} alt="Eurobond" style={{ height: 46, marginBottom: 24, alignSelf: "flex-start" }} />

        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a", margin: "0 0 8px" }}>Welcome back</h1>
        <p style={{ color: "#64748b", fontSize: 15, margin: "0 0 26px", lineHeight: 1.5 }}>Sign in to the Eurobond CRM backend.</p>

        <div style={{ display: "flex", gap: 8, marginBottom: 22, background: "#f1f5f9", padding: 5, borderRadius: 12 }}>
          <button onClick={() => { setTab("team"); setErr(""); }} style={tabBtn(tab === "team")}><Users size={15} /> Backend Team</button>
          <button onClick={() => { setTab("individual"); setErr(""); }} style={tabBtn(tab === "individual")}><User size={15} /> Individual</button>
        </div>

        <label style={lbl}>{tab === "team" ? "Username" : "Mobile Number"}</label>
        <input value={u} onChange={(e) => { setU(e.target.value); setErr(""); }} placeholder={tab === "team" ? "Your admin username" : "Your mobile / employee code"} autoCapitalize="none" style={inp} />

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

        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", fontSize: 12.5 }}>
          <ShieldCheck size={15} /> {tab === "team" ? "Username + password — added under Admin Users." : "App account (mobile). You'll only see modules allowed for your role."}
        </div>
      </div>

      <div className="admin-login-art" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(150deg, #0b1437 0%, #1e2a63 45%, #4f46e5 100%)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 5vw", color: "#fff" }}>
        <div style={{ position: "absolute", top: -120, right: -120, width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,110,240,0.55), transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -140, left: -80, width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)" }} />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 440 }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 18px" }}>
            Eurobond CRM<br />Command Center
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.82)", margin: 0 }}>
            One backend for your entire field force — attendance & live GPS, enquiries, quotations, expenses, projects and team performance, all in real time.
          </p>
          <div style={{ display: "flex", gap: 26, marginTop: 40 }}>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>400+</div><div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>Field users</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>15+</div><div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>Modules</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 800 }}>24/7</div><div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>Live tracking</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 };
const inp = { width: "100%", padding: "13px 16px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 15, outline: "none", marginBottom: 16, boxSizing: "border-box", background: "#f8fafc" };
const btn = (busy) => ({ width: "100%", padding: "14px 20px", borderRadius: 12, border: "none", background: busy ? "#6366f1" : "linear-gradient(135deg, #4f46e5, #6d5cf0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: busy ? "default" : "pointer", boxShadow: "0 8px 20px rgba(79,70,229,0.28)" });
const tabBtn = (active) => ({ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, background: active ? "#fff" : "transparent", color: active ? "#4f46e5" : "#64748b", boxShadow: active ? "0 2px 6px rgba(0,0,0,0.08)" : "none" });
