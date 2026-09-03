import logoImg from "../assets/logo.jpg";
import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, Navigate } from "react-router-dom";
import {
  Search, Bell, Moon, Maximize, Settings, LayoutDashboard, Megaphone, Users,
  BarChart3, Boxes, LifeBuoy, BellRing, ChevronDown, LogOut,
} from "lucide-react";
import { FooterNote } from "../components/ui.jsx";
import { auth, api } from "../lib/api.js";
import { MODULES } from "./moduleConfigs.jsx";

const NAV = [
  {
    group: "Analytics",
    items: [
      {
        label: "Analytics Hub", icon: <LayoutDashboard size={17} />, children: [
          { label: "Dashboard", to: "/admin/dashboards/home" },
          { label: "Expense Dashboard", to: "/admin/dashboards/expense" },
          { label: "User Report Card", to: "/admin/dashboards/user-report" },
          { label: "Enquiry Dashboard", to: "/admin/dashboards/enquiry" },
        ],
      },
      { label: "Task", icon: <Megaphone size={17} />, to: "/admin/sfa/task" },
    ],
  },
  {
    group: "App Modules",
    items: [
      {
        label: "SFA", icon: <BarChart3 size={17} />, children: [
          { label: "Attendance", to: "/admin/sfa/attendance" },
          { label: "Attendance Sheet", to: "/admin/sfa/attendance-sheet" },
          { label: "Checkin", to: "/admin/sfa/checkin" },
          { label: "Expense", to: "/admin/sfa/expense" },
          { label: "Leave", to: "/admin/sfa/leave" },
          { label: "Enquiry", to: "/admin/sfa/enquiry" },
          { label: "Customers", to: "/admin/sfa/customers" },
          { label: "Quotation", to: "/admin/sfa/quotation" },
          { label: "Project Projection", to: "/admin/sfa/project-projection" },
          { label: "Targets", to: "/admin/sfa/target" },
          { label: "Sales to Spec", to: "/admin/sfa/sales-to-spec" },
          { label: "Spec to Sales", to: "/admin/sfa/spec-to-sales" },
        ],
      },
    ],
  },
  {
    group: "Master Modules",
    items: [
      {
        label: "Masters", icon: <Boxes size={17} />, children: [
          { label: "Admin Roles & Permission", to: "/admin/master/roles" },
          { label: "App user & Team Access", to: "/admin/master/team-access" },
          { label: "App Users", to: "/admin/master/users" },
          { label: "Admin Users", to: "/admin/master/admin-users" },
          { label: "Holidays", to: "/admin/master/holidays" },
          { label: "Areas", to: "/admin/master/areas" },
          { label: "Products", to: "/admin/master/products" },
        ],
      },
    ],
  },
  {
    group: "Support Modules",
    items: [
      { label: "Announcement", icon: <Megaphone size={17} />, to: "/admin/support/announcement" },
      { label: "GK - IT Support", icon: <LifeBuoy size={17} />, to: "/admin/support/tickets" },
      { label: "Notification", icon: <BellRing size={17} />, to: "/admin/support/notification" },
    ],
  },
];

const CHILD_COLORS = ["#4a7bff", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#6366f1", "#ef4444", "#14b8a6", "#f97316", "#a855f7", "#0ea5e9", "#22c55e", "#eab308"];

function SideParent({ item }) {
  const [open, setOpen] = useState(true);
  if (!item.children)
    return (
      <NavLink to={item.to} className={({ isActive }) => `side-item ${isActive ? "active" : ""}`}>
        {item.icon} {item.label}
      </NavLink>
    );
  return (
    <>
      <button className="side-item" style={{ width: "100%", background: "none", border: "none", color: "inherit", textAlign: "left" }} onClick={() => setOpen(!open)}>
        {item.icon} {item.label}
        <ChevronDown size={15} className={`side-caret ${open ? "open" : ""}`} />
      </button>
      {open && item.children.map((c, i) => (
        <NavLink key={c.to} to={c.to} className={({ isActive }) => `side-item side-sub ${isActive ? "active" : ""}`}>
          {c.label}
        </NavLink>
      ))}
    </>
  );
}

function ModuleSearch({ nav }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const extra = [
    { title: "Customers", path: "sfa/customers" }, { title: "Quotation", path: "sfa/quotation" },
    { title: "Products", path: "master/products" }, { title: "Attendance", path: "sfa/attendance" },
    { title: "Attendance Sheet", path: "sfa/attendance-sheet" }, { title: "Users", path: "master/users" },
  ];
  const all = [...Object.values(MODULES).map((m) => ({ title: m.title, path: m.path })), ...extra];
  const ql = q.trim().toLowerCase();
  const hits = ql ? all.filter((m) => (m.title || "").toLowerCase().includes(ql) || (m.path || "").toLowerCase().includes(ql)).slice(0, 8) : [];

  const go = (path) => { nav("/admin/" + path); setQ(""); setOpen(false); };

  return (
    <div className="side-search" style={{ position: "relative", flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <Search size={15} />
        <input
          value={q}
          placeholder="Search module here ..."
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) go(hits[0].path); }}
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "inherit", fontSize: 13 }}
        />
      </div>
      {open && ql && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, background: "#fff", borderRadius: 10, boxShadow: "0 12px 30px rgba(20,25,60,.25)", zIndex: 50, overflow: "hidden", maxHeight: 300, overflowY: "auto" }}>
          {hits.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "#8a93a8", fontSize: 12.5 }}>No module found</div>
          ) : hits.map((m) => (
            <div key={m.path} onClick={() => go(m.path)} style={{ padding: "10px 12px", cursor: "pointer", fontSize: 13, color: "#2a3350", borderBottom: "1px solid #f0f2f8" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f6fc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
              {m.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const nav = useNavigate();
  useEffect(() => { if (localStorage.getItem("eb_admin_dark") === "1") document.body.classList.add("dark-admin"); }, []);

  /* IndiaMart auto lead sync — runs on load + every 10 min while any admin page is open.
     For fully unattended sync (even when no one is logged in), set a Hostinger cron on:
     https://eurobondsealant.com/crm-api/indiamart.php?action=sync&key=eurobond-setup-2026 */
  useEffect(() => {
    const run = () => { api.indiamartSync().catch(() => {}); };
    run();
    const t = setInterval(run, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const [showPass, setShowPass] = useState(false);
  const [pw, setPw] = useState({ old: "", nw: "" });
  const [lightbox, setLightbox] = useState(null);
  const [allowedNav, setAllowedNav] = useState(null);   // null = admin/all; Set = allowed module labels

  /* Role-based nav: Admin sees everything; other roles see only modules ticked in Role & Permission */
  useEffect(() => {
    const u = auth.user || {};
    const role = String(u.role || "");
    if (/admin/i.test(role) || u.bootstrap) { setAllowedNav(null); return; }   // admin → all
    api.list("roles", false).then((d) => {
      const rec = (d.records || []).map((r) => r.data).find((r) => r && r.name === role);
      if (!rec || !rec.grid) { setAllowedNav(new Set()); return; }              // no grid → nothing extra
      const allow = new Set();
      Object.entries(rec.grid).forEach(([mod, perms]) => {
        if (perms && Object.values(perms).some((v) => v === true)) allow.add(mod);
      });
      setAllowedNav(allow);
    }).catch(() => setAllowedNav(new Set()));
  }, []);

  useEffect(() => {
    const h = (e) => setLightbox(e.detail);
    window.addEventListener("crm-lightbox", h);
    return () => window.removeEventListener("crm-lightbox", h);
  }, []);

  /* ADMIN SESSION: log out after 15 min of inactivity, and require login again
     whenever the browser tab was fully closed & reopened (sessionStorage marker). */
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!sessionStorage.getItem("eb_admin_session")) { setExpired(true); return; }
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => setExpired(true), 15 * 60 * 1000); };
    const evs = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(timer); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }, []);

  if (expired) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,40,.6)", zIndex: 99999, display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, maxWidth: 360, width: "100%", padding: 26, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <h2 style={{ margin: "0 0 6px" }}>Session Expired</h2>
          <p style={{ color: "#64708a", fontSize: 13.5, marginBottom: 18 }}>You've been logged out for security. Please log in again to continue.</p>
          <button className="btn btn-primary" style={{ width: "100%", padding: "12px", fontWeight: 800, fontSize: 15 }}
            onClick={() => { try { sessionStorage.removeItem("eb_admin_session"); } catch {} auth.clear(); window.location.href = "/admin/login"; }}>
            Login — Click here
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isLoggedIn) return <Navigate to="/admin/login" replace />;
  const admin = auth.user || { name: "User" };

  const savePassword = async () => {
    if (!pw.old || pw.nw.length < 6) { alert("Enter old password and a new password (min 6 chars)"); return; }
    try {
      await api.changePassword(pw.old, pw.nw);
      alert("Password changed successfully");
      setShowPass(false); setPw({ old: "", nw: "" });
    } catch (e) { alert(e.message); }
  };
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand" style={{ padding: "14px 14px 10px" }}>
          <span style={{ background: "#fff", borderRadius: 10, padding: "7px 10px", display: "inline-block" }}>
            <img src={logoImg} alt="Eurobond" style={{ height: 26, display: "block" }} />
          </span>
        </div>
        <ModuleSearch nav={nav} />
        {NAV.map((g) => {
          /* filter children/items by role permission (Admin: allowedNav === null → show all) */
          const items = g.items.map((it) => {
            if (allowedNav === null) return it;
            if (it.children) {
              const kids = it.children.filter((c) => allowedNav.has(c.label));
              return kids.length ? { ...it, children: kids } : null;
            }
            return allowedNav.has(it.label) ? it : null;
          }).filter(Boolean);
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="side-group">{g.group}</div>
              {items.map((it) => <SideParent key={it.label} item={it} />)}
            </div>
          );
        })}
        <div style={{ height: 30 }} />
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="top-search">
            <Search size={15} />
            <input
              placeholder="Search module… (e.g. enquiry, quotation)"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const q = e.target.value.trim().toLowerCase();
                if (!q) return;
                const extra = [
                  { title: "Customers", path: "sfa/customers" }, { title: "Quotation", path: "sfa/quotation" },
                  { title: "Products", path: "master/products" }, { title: "Attendance", path: "sfa/attendance" },
                  { title: "Attendance Sheet", path: "sfa/attendance-sheet" }, { title: "Users", path: "master/users" },
                ];
                const all = [...Object.values(MODULES), ...extra];
                const hit = all.find((m) => (m.title || "").toLowerCase().includes(q) || (m.path || "").toLowerCase().includes(q));
                if (hit) { nav("/admin/" + hit.path); e.target.value = ""; }
                else alert("No module found for: " + q);
              }}
            />
          </div>
          <div className="top-right">
            <div className="welcome">
              <small>Welcome</small><br />
              <strong>{admin.name}</strong>
            </div>
            <AdminBell nav={nav} />
            <button className="icon-btn" title="Dark / Light" onClick={() => {
              const dark = document.body.classList.toggle("dark-admin");
              localStorage.setItem("eb_admin_dark", dark ? "1" : "0");
            }}><Moon size={16} /></button>
            <button className="icon-btn" title="Fullscreen" onClick={() => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }}><Maximize size={16} /></button>
            <button className="icon-btn" title="Change password" onClick={() => setShowPass(true)}><Settings size={16} /></button>
            <button className="icon-btn" title="Logout" onClick={() => { api.logout(); nav("/"); }}><LogOut size={16} /></button>
          </div>
        </header>
        {lightbox && (
          <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 9999, display: "grid", placeItems: "center", padding: 24 }}>
            <button onClick={() => setLightbox(null)} style={{ position: "absolute", top: 20, right: 24, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 42, height: 42, borderRadius: "50%", fontSize: 24, cursor: "pointer" }}>×</button>
            {String(lightbox).match(/\.pdf$/i)
              ? <iframe src={lightbox} title="Attachment" style={{ width: "90vw", height: "88vh", border: "none", borderRadius: 8, background: "#fff" }} />
              : <img src={lightbox} alt="attachment" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8 }} />}
          </div>
        )}

        {showPass && (
          <div className="modal-mask" onClick={() => setShowPass(false)}>
            <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
              <h3>Change Password</h3>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Current Password</label>
                <input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
              </div>
              <div className="field">
                <label>New Password (min 6 chars)</label>
                <input type="password" value={pw.nw} onChange={(e) => setPw({ ...pw, nw: e.target.value })} />
              </div>
              <div className="modal-foot">
                <button className="btn btn-danger" onClick={() => setShowPass(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={savePassword}>Update</button>
              </div>
            </div>
          </div>
        )}
        <main className="content">
          <Outlet />
          <FooterNote />
        </main>
      </div>
    </div>
  );
}


/* ---------------- ADMIN NOTIFICATION BELL ----------------
   App users replies (name tho) ikkada vastayi; click cheste aa module open. */
function AdminBell({ nav }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const readKey = "eb_admin_notif_read";
  const getRead = () => { try { return new Set(JSON.parse(localStorage.getItem(readKey) || "[]")); } catch { return new Set(); } };

  const load = () => {
    api.list("notification", false).then((d) => {
      const list = (d.records || []).map((r) => ({ _id: String(r.id), ...r.data }))
        .filter((n) => n.to === "ADMIN").slice(0, 30);
      setRows(list);
    }).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const read = getRead();
  const unread = rows.filter((n) => !read.has(n._id)).length;

  const openItem = (n) => {
    const s = getRead(); s.add(n._id);
    localStorage.setItem(readKey, JSON.stringify([...s].slice(-300)));
    setOpen(false);
    if (n.adminLink) nav(n.adminLink.replace(/^\/admin/, "/admin"));
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="icon-btn" title="Notifications" onClick={() => setOpen((v) => !v)} style={{ position: "relative" }}>
        <Bell size={16} />
        {unread > 0 && <span style={{ position: "absolute", top: -4, right: -5, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#e5484d", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", right: 0, top: "115%", width: 330, maxHeight: 420, overflowY: "auto", background: "#fff", borderRadius: 14, boxShadow: "0 18px 50px rgba(15,20,45,.22)", zIndex: 61, border: "1px solid #e6eaf4" }}>
            <div style={{ padding: "11px 14px", fontWeight: 800, fontSize: 13, borderBottom: "1px solid #eef1f8", fontFamily: "Bricolage Grotesque" }}>Notifications</div>
            {rows.length === 0 ? (
              <div style={{ padding: 22, textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>No notifications yet</div>
            ) : rows.map((n, i) => {
              const isUnread = !read.has(n._id);
              return (
                <div key={i} onClick={() => openItem(n)} style={{ padding: "11px 14px", borderBottom: "1px solid #f2f4fa", cursor: "pointer", background: isUnread ? "#f5f8ff" : "#fff" }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    {isUnread && <span style={{ width: 7, height: 7, borderRadius: 4, background: "#e5484d", flexShrink: 0 }} />}
                    <div style={{ fontWeight: isUnread ? 800 : 600, fontSize: 12.5, flex: 1 }}>{n.title}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>{n.createdAt}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
