/* If a screen throws, React unmounts everything under it and the page goes
   blank. This catches that, shows what happened and offers a way back instead
   of leaving a white screen. */
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    /* keep the details in the console for a developer, not on the screen */
    // eslint-disable-next-line no-console
    console.error("Screen error:", err, info);
  }

  /* The error is NOT cleared when the address changes. Clearing it put the same
     broken screen straight back, it threw again, and after a few rounds React
     gave up and left a blank page. It clears only when the person taps the
     button below. */

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 38 }}>⚠️</div>
        <h3 style={{ margin: "10px 0 6px", fontSize: 16 }}>This screen could not open</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 10px", lineHeight: 1.6 }}>
          Nothing was lost. Go back to Home and try again.
        </p>
        <pre style={{ fontSize: 10.5, color: "#94a3b8", background: "#f8fafc", borderRadius: 8, padding: "8px 10px",
          margin: "0 0 16px", whiteSpace: "pre-wrap", textAlign: "left", maxHeight: 120, overflow: "auto" }}>
          {String(this.state.err && (this.state.err.message || this.state.err)).slice(0, 300)}
        </pre>
        <button
          onClick={() => { this.setState({ err: null }); window.location.hash = ""; window.location.replace("/app"); }}
          style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: "#1f3a68", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
          Go to Home
        </button>
      </div>
    );
  }
}
