import logoImg from "./assets/logo.jpg";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Monitor, Smartphone } from "lucide-react";
import AdminLogin from "./admin/AdminLogin.jsx";
import AdminLayout from "./admin/AdminLayout.jsx";
import ExpenseDashboard from "./admin/ExpenseDashboard.jsx";
import UserReportCard from "./admin/UserReportCard.jsx";
import EnquiryDashboard from "./admin/EnquiryDashboard.jsx";
import ModulePage from "./admin/ModulePage.jsx";
import CheckinPage from "./admin/CheckinPage.jsx";
import RolePermission from "./admin/RolePermission.jsx";
import TeamAccess from "./admin/TeamAccess.jsx";
import AppSettings from "./admin/AppSettings.jsx";
import ContentMaster from "./admin/ContentMaster.jsx";
import UsersPage from "./admin/UsersPage.jsx";
import AttendancePage from "./admin/AttendancePage.jsx";
import { MODULES } from "./admin/moduleConfigs.jsx";
import FieldApp from "./field/FieldApp.jsx";

function Portal() {
  return (
    <div className="portal-shell">
      <div style={{ textAlign: "center", maxWidth: 760, width: "100%" }}>
        <div style={{ display: "inline-block", background: "#fff", borderRadius: 16, padding: "14px 26px", marginBottom: 4 }}>
          <img src={logoImg} alt="Eurobond" style={{ height: 46, display: "block" }} />
        </div>
        <p style={{ color: "#b9c0e4", marginTop: 6 }}>Sales Force Automation · Bonds that last</p>
        <div className="portal-grid">
          <Link to="/admin/login" className="portal-card">
            <div className="ic"><Monitor size={38} /></div>
            <h3>Admin Panel</h3>
            <p>Backend website — dashboards, attendance, enquiries, quotations, masters, roles &amp; every module for the back-office team.</p>
          </Link>
          <Link to="/app" className="portal-card">
            <div className="ic"><Smartphone size={38} /></div>
            <h3>Field App</h3>
            <p>Mobile app for sales executives — attendance with live GPS km tracking, check-ins, follow-ups, leave, expense &amp; targets.</p>
          </Link>
        </div>
        <p style={{ marginTop: 34, color: "#7c85b4", fontSize: 12.5 }}>Eurobond CRM v1.0.0</p>
      </div>
    </div>
  );
}

export default function App() {
  const isNative = typeof window !== "undefined" && window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform();
  return (
    <Routes>
      <Route path="/" element={isNative ? <Navigate to="/app" replace /> : <Portal />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboards/expense" replace />} />
        <Route path="dashboards/expense" element={<ExpenseDashboard />} />
        <Route path="dashboards/user-report" element={<UserReportCard />} />
        <Route path="dashboards/enquiry" element={<EnquiryDashboard />} />
        <Route path="sfa/checkin" element={<CheckinPage />} />
        <Route path="master/roles" element={<RolePermission />} />
        <Route path="master/team-access" element={<TeamAccess />} />
        <Route path="master/app-settings" element={<AppSettings />} />
        <Route path="master/content" element={<ContentMaster />} />
        <Route path="master/users" element={<UsersPage />} />
        <Route path="sfa/attendance" element={<AttendancePage />} />
        {Object.entries(MODULES).filter(([key]) => key !== "users").map(([key, cfg]) => (
          <Route key={key} path={cfg.path} element={<ModulePage cfgKey={key} />} />
        ))}
        <Route path="*" element={<Navigate to="dashboards/expense" replace />} />
      </Route>
      <Route path="/app/*" element={<FieldApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
