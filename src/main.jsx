import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

/* Global error boundary — shows a friendly message instead of a white screen */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("App error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui", minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", background: "#f5f7fc" }}>
          <div style={{ maxWidth: 340 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>⚠️</div>
            <h2 style={{ margin: "0 0 8px", color: "#0b3c8c" }}>Something went wrong</h2>
            <p style={{ color: "#667", fontSize: 14, marginBottom: 18 }}>
              Please try again. If it keeps happening, close and reopen the app.
            </p>
            <pre style={{ background: "#fff0f0", color: "#c03636", fontSize: 11, padding: 10, borderRadius: 8, textAlign: "left", overflow: "auto", maxHeight: 120, marginBottom: 14 }}>{String(this.state.error && this.state.error.message || this.state.error)}</pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/app"; }}
              style={{ background: "#0b3c8c", color: "#fff", border: "none", borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 15 }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);

/* Auto-recover from stale/failed asset (chunk) loads after a new deploy.
   If a script/style fails to load once, hard-reload from server (once per session). */
window.addEventListener("error", (e) => {
  const t = e.target;
  if (t && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
    if (!sessionStorage.getItem("chunkReloaded")) {
      sessionStorage.setItem("chunkReloaded", "1");
      window.location.reload();
    }
  }
}, true);
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason && e.reason.message || e.reason || "");
  if (/dynamically imported module|Loading chunk|Failed to fetch/i.test(msg)) {
    if (!sessionStorage.getItem("chunkReloaded")) {
      sessionStorage.setItem("chunkReloaded", "1");
      window.location.reload();
    }
  }
});
