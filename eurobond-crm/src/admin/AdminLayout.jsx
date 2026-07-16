import logoImg from "../assets/logo.jpg";
import { useState } from "react";
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
          { label: "Follow Up", to: "/admin/sfa/follow-up" },
          { label: "Customers", to: "/admin/sfa/customers" },
          { label: "Quotation", to: "/admin/sfa/quotation" },
          { label: "Site-Project", to: "/admin/sfa/site-project" },
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
          { label: "User & Team Access", to: "/admin/master/team-access" },
          { label: "Users", to: "/admin/master/users" },
          { label: "Leave Policy", to: "/admin/master/leave-policy" },
          { label: "Location Master", to: "/admin/master/location" },
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
            <button className="icon-btn" title="Notifications" onClick={() => nav("/admin/support/notification")}><Bell size={16} /></button>
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
