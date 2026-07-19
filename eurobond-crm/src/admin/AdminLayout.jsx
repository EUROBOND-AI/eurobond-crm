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
          { label: "Sales Entries", to: "/admin/sfa/sales-entries" },
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
          { label: "User & Team Access", to: "/admin/master/team-access" },
          { label: "Users", to: "/admin/master/users" },
          { label: "Holidays", to: "/admin/master/holidays" },
          { label: "Products", to: "/admin/master/products" },
          { label: "App Settings", to: "/admin/master/app-settings" },
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
      {open && item.children.map((c) => (
        <NavLink key={c.to} to={c.to} className={({ isActive }) => `side-item side-sub ${isActive ? "active" : ""}`}>
          – {c.label}
        </NavLink>
      ))}
    </>
  );
}

export default function AdminLayout() {
  const nav = useNavigate();
  const [showPass, setShowPass] = useState(false);
  const [pw, setPw] = useState({ old: "", nw: "" });
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
        <div className="side-search">
          <Search size={15} />
          <input placeholder="Search module here ..." />
        </div>
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="side-group">{g.group}</div>
            {g.items.map((it) => <SideParent key={it.label} item={it} />)}
          </div>
        ))}
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
                const hit = Object.values(MODULES).find((m) => m.title.toLowerCase().includes(q) || m.path.toLowerCase().includes(q));
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
            <button className="icon-btn" title="Fullscreen" onClick={() => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }}><Maximize size={16} /></button>
            <button className="icon-btn" title="Change password" onClick={() => setShowPass(true)}><Settings size={16} /></button>
            <button className="icon-btn" title="Logout" onClick={() => { api.logout(); nav("/"); }}><LogOut size={16} /></button>
          </div>
        </header>
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
