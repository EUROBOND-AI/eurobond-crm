import { PageHead } from "../components/ui.jsx";

/* Sales Review (Power BI) — the full dashboard lives in /powerbi.html (its own
   self-contained app, same origin so it can read the auth token and call the
   API). We embed it in an iframe so its styles never clash with the admin. */
export default function SalesReview() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 92px)" }}>
      <PageHead title="Sales Review" crumb="Power BI" />
      <iframe
        src="/powerbi.html"
        title="Sales Review"
        style={{ flex: 1, width: "100%", border: "1px solid var(--line)", borderRadius: 12, background: "#f0f2f5" }}
      />
    </div>
  );
}
