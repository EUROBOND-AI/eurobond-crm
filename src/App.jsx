import logoImg from "./assets/logo.jpg";
import { useEffect, useRef, lazy, Suspense } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { api, auth } from "./lib/api.js";
import { Monitor, Smartphone } from "lucide-react";
import AdminLogin from "./admin/AdminLogin.jsx";
import AdminLayout from "./admin/AdminLayout.jsx";
const HomeDashboard = lazy(() => import("./admin/HomeDashboard.jsx"));
const DealPipeline = lazy(() => import("./admin/DealPipeline.jsx"));
const AreasPage = lazy(() => import("./admin/AreasPage.jsx"));
const ExpenseDashboard = lazy(() => import("./admin/ExpenseDashboard.jsx"));
const ExpenseApprovals = lazy(() => import("./admin/ExpenseApprovals.jsx"));
const UserReportCard = lazy(() => import("./admin/UserReportCard.jsx"));
const EnquiryDashboard = lazy(() => import("./admin/EnquiryDashboard.jsx"));
const ModulePage = lazy(() => import("./admin/ModulePage.jsx"));
const CheckinPage = lazy(() => import("./admin/CheckinPage.jsx"));
const TourReport = lazy(() => import("./admin/TourReport.jsx"));
const ApiKeysPage = lazy(() => import("./admin/ApiKeysPage.jsx"));
const HealthPage = lazy(() => import("./admin/HealthPage.jsx"));
const ActivityLogs = lazy(() => import("./admin/ActivityLogs.jsx"));
const BiltraxPage = lazy(() => import("./admin/BiltraxPage.jsx"));
const BiltraxDashboard = lazy(() => import("./admin/BiltraxDashboard.jsx"));
const LoginHistory = lazy(() => import("./admin/LoginHistory.jsx"));
const CustomersDashboard = lazy(() => import("./admin/CustomersDashboard.jsx"));
const TargetDashboard = lazy(() => import("./admin/TargetDashboard.jsx"));
const ProjectDashboard = lazy(() => import("./admin/ProjectDashboard.jsx"));
const RolePermission = lazy(() => import("./admin/RolePermission.jsx"));
const TeamAccess = lazy(() => import("./admin/TeamAccess.jsx"));
const AppSettings = lazy(() => import("./admin/AppSettings.jsx"));
const CustomersPage = lazy(() => import("./admin/CustomersPage.jsx"));
const AttendanceSheet = lazy(() => import("./admin/AttendanceSheet.jsx"));
const UsersPage = lazy(() => import("./admin/UsersPage.jsx"));
const AdminUsersPage = lazy(() => import("./admin/AdminUsersPage.jsx"));
const AttendancePage = lazy(() => import("./admin/AttendancePage.jsx"));
const QuotationAdmin = lazy(() => import("./admin/QuotationAdmin.jsx"));
const ProductsPage = lazy(() => import("./admin/ProductsPage.jsx"));
const HolidaysPage = lazy(() => import("./admin/HolidaysPage.jsx"));
const EnquiryPage = lazy(() => import("./admin/EnquiryPage.jsx"));
import { MODULES } from "./admin/moduleConfigs.jsx";
const FieldApp = lazy(() => import("./field/FieldApp.jsx"));

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
        <p style={{ marginTop: 34, color: "#7c85b4", fontSize: 12.5 }}>Eurobond CRM v{__APP_VERSION__} · {__BUILD_DATE__}</p>
      </div>
    </div>
  );
}

/* record every screen the person opens, so admin can see real usage */
function useActivityLogger() {
  const loc = useLocation();
  const last = useRef("");
  useEffect(() => {
    const path = loc.pathname;
    if (!path || path === last.current) return;
    last.current = path;
    if (!auth.isLoggedIn) return;
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "admin") return;             // admin panel usage only
    const module = parts[parts.length - 1] || parts[1] || "home";
    api.activityLog(module, path, "admin").catch(() => {});
  }, [loc.pathname]);
}

export default function App() {
  useActivityLogger();
  const isNative = typeof window !== "undefined" && window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform();
  return (
    <Suspense fallback={<div className="eb-loading" style={{ minHeight: "60vh" }}><div className="eb-spin" />Loading…</div>}>
    <Routes>
      <Route path="/" element={isNative ? <Navigate to="/app" replace /> : <Portal />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboards/home" replace />} />
        <Route path="dashboards/home" element={<HomeDashboard />} />
        <Route path="sfa/pipeline" element={<DealPipeline />} />
        <Route path="master/areas" element={<AreasPage />} />
        <Route path="dashboards/expense" element={<ExpenseDashboard />} />
        <Route path="dashboards/user-report" element={<UserReportCard />} />
        <Route path="dashboards/enquiry" element={<EnquiryDashboard />} />
        <Route path="dashboards/customers" element={<CustomersDashboard />} />
        <Route path="dashboards/target" element={<TargetDashboard />} />
        <Route path="dashboards/project" element={<ProjectDashboard />} />
        <Route path="sfa/biltrax" element={<BiltraxPage />} />
        <Route path="dashboards/biltrax" element={<BiltraxDashboard />} />
        <Route path="master/logs" element={<ActivityLogs />} />
        <Route path="master/login-history" element={<LoginHistory />} />
        <Route path="sfa/checkin" element={<CheckinPage />} />
        <Route path="sfa/tour-report" element={<TourReport />} />
        <Route path="master/roles" element={<RolePermission />} />
        <Route path="master/team-access" element={<TeamAccess />} />
        <Route path="master/app-settings" element={<AppSettings />} />
        <Route path="master/users" element={<UsersPage />} />
        <Route path="master/admin-users" element={<AdminUsersPage />} />
        <Route path="sfa/attendance" element={<AttendancePage />} />
        <Route path="sfa/customers" element={<CustomersPage />} />
        <Route path="sfa/quotation" element={<QuotationAdmin />} />
        <Route path="master/products" element={<ProductsPage />} />
        <Route path="master/holidays" element={<HolidaysPage />} />
        <Route path="master/api-keys" element={<ApiKeysPage />} />
        <Route path="master/health" element={<HealthPage />} />
        <Route path="sfa/enquiry" element={<EnquiryPage />} />
        <Route path="sfa/expense" element={<ExpenseApprovals />} />
        <Route path="sfa/attendance-sheet" element={<AttendanceSheet />} />
        {Object.entries(MODULES).filter(([key]) => key !== "users" && key !== "quotation" && key !== "products" && key !== "enquiry" && key !== "expense").map(([key, cfg]) => (
          <Route key={key} path={cfg.path} element={<ModulePage cfgKey={key} />} />
        ))}
        <Route path="*" element={<Navigate to="dashboards/home" replace />} />
      </Route>
      <Route path="/app/*" element={<FieldApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
