import logoImg from "../assets/logo.jpg";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Users, User, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { api } from "../lib/api.js";

export default function AdminLogin() {
  const nav = useNavigate();
  const [tab, setTab] = useState("team");
  const [show, setShow] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!u || !p) { setErr("Please enter username and password"); return; }
    setBusy(true); setErr("");
    try {
      const user = await api.login(u.trim(), p);
      if (!["ADMIN", "MANAGER", "SYSTEM"].includes(user.role)) {
        setErr("This login is for back-office staff only");
        api.logout();
        setBusy(false);
        return;
      }
      nav("/admin/dashboards/expense");
    } catch (e) {
      setErr(e.message || "Login failed");
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-form-col">
        <div className="login-card">
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 13, fontWeight: 700, marginBottom: 18 }}>
            <ArrowLeft size={15} /> Back to portal
          </Link>
          <img src={logoImg} alt="Eurobond" style={{ height: 44, marginBottom: 8, display: "block" }} />
          <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 22 }}>
            Sign in to the admin backend
          </p>

          <div className="login-tabs">
            <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>
              <Users size={16} /> Backend Team
            </button>
            <button className={tab === "individual" ? "active" : ""} onClick={() => setTab("individual")}>
              <User size={16} /> Individual
            </button>
          </div>

          <div className="f-form" style={{ padding: 0 }}>
            <label>Username <b>*</b></label>
            <input
              placeholder={tab === "team" ? "Team username" : "Employee code / email"}
              value={u}
              onChange={(e) => { setU(e.target.value); setErr(""); }}
              style={{ width: "100%", marginBottom: 14 }}
            />
            <label>Password <b>*</b></label>
            <div style={{ position: "relative", marginBottom: 6 }}>
              <input
                type={show ? "text" : "password"}
                placeholder="••••••••"
                value={p}
                onChange={(e) => { setP(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{ width: "100%", paddingRight: 42 }}
              />
              <button
                onClick={() => setShow(!show)}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {err && <div style={{ color: "#d64545", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{err}</div>}
            <div style={{ textAlign: "right", marginBottom: 18 }}>
              <span style={{ color: "var(--accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Forgot password?</span>
            </div>
            <button className="f-submit" style={{ width: "100%", opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={submit}>
              {busy ? "Signing in…" : "Sign In"}
            </button>
            <p style={{ marginTop: 16, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
              Use the username &amp; password given by your admin.
            </p>
          </div>
        </div>
      </div>

      <div className="login-art">
        <div style={{ zIndex: 2, display: "grid", gap: 8, justifyItems: "center" }}>
          <div className="panel-3d">
            <div className="panel-3d-face" />
            <div className="panel-3d-face two" />
            <div className="panel-3d-face three" />
          </div>
          <h2>CRM</h2>
          <p>Building Customer-Centric Platforms — attendance, enquiries, quotations, projects &amp; every field activity in one place.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <span className="store-badge">▶ Google Play</span>
            <span className="store-badge"> App Store</span>
          </div>
        </div>
      </div>
    </div>
  );
}
