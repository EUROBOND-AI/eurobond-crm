import { PageHead } from "../components/ui.jsx";

/* Target Dashboard — now the Sales Review (Power BI) dashboard. The full
   dashboard lives in /powerbi.html (its own self-contained app, same origin so
   it can read the auth token and call the API); we embed it in an iframe so its
   styles never clash with the admin. Data is uploaded from the Targets module
   (Import Excel), this page is the read-only dashboard view. */
export default function TargetDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)" }}>
      <PageHead crumb="Dashboards" title="Target Dashboard" />
      <iframe
        src="/powerbi.html?view=dash"
        title="Target Dashboard"
        style={{ flex: 1, width: "100%", border: "1px solid var(--line)", borderRadius: 12, background: "#f0f2f5" }}
      />
    </div>
  );
}
