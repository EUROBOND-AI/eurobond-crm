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

  componentDidUpdate(prev) {
    /* moving to another screen clears the error */
    if (this.state.err && prev.routeKey !== this.props.routeKey) this.setState({ err: null });
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 38 }}>⚠️</div>
        <h3 style={{ margin: "10px 0 6px", fontSize: 16 }}>This screen could not open</h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 18px", lineHeight: 1.6 }}>
          Nothing was lost. Go back to Home and try again.
        </p>
        <button
          onClick={() => { this.setState({ err: null }); window.location.hash = ""; window.location.replace("/app"); }}
          style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: "#1f3a68", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
          Go to Home
        </button>
      </div>
    );
  }
}
