/* ============ ChatAssistant.jsx — in-app AI assistant (Gemini) ============
   A floating button that opens a chat panel. It can find records, show the
   user's own tasks/enquiries/quotations, answer "how do I…" questions, and
   help create records — with a Confirm step before anything is saved.
   Multilingual (replies in the user's language) and voice-enabled
   (speak to it, it can speak back). The Gemini key lives on the server only.

   Usage:  <ChatAssistant accent="#1b3a8f" />
   Place once in the app shell and once in the admin shell.                 */
import React, { useEffect, useRef, useState } from "react";
import { api, auth } from "../lib/api.js";

const LANGS = [
  { code: "en-IN", label: "English" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "mr-IN", label: "मराठी" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
];

const SR = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
const canTTS = (typeof window !== "undefined") && "speechSynthesis" in window;

export default function ChatAssistant({ accent = "#1b3a8f", bottom = 18 }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);            // {role:'user'|'model'|'note', text, action?}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(() => { try { return localStorage.getItem("eb_ai_voice") === "1"; } catch { return false; } });
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("eb_ai_lang") || "en-IN"; } catch { return "en-IN"; } });
  const [pending, setPending] = useState(null);    // {type:'create', module, fields}
  const listRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("eb_ai_lang", lang); } catch {} }, [lang]);
  useEffect(() => { try { localStorage.setItem("eb_ai_voice", voiceOut ? "1" : "0"); } catch {} }, [voiceOut]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs, busy, pending]);
  /* load TTS voices up front (getVoices is async the first time) */
  useEffect(() => { if (canTTS) { try { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => {}; } catch {} } }, []);

  const name = (auth.user && (auth.user.name || auth.user.fullName)) || "";

  /* detect the language of the REPLY from its script, so Telugu is spoken by a
     Telugu voice (not Hindi), whatever the dropdown is set to */
  function detectLang(t) {
    if (/[ఀ-౿]/.test(t)) return "te-IN";  // Telugu
    if (/[஀-௿]/.test(t)) return "ta-IN";  // Tamil
    if (/[ಀ-೿]/.test(t)) return "kn-IN";  // Kannada
    if (/[ऀ-ॿ]/.test(t)) return "hi-IN";  // Devanagari (Hindi / Marathi)
    return lang || "en-IN";
  }
  function pickVoice(code) {
    try {
      const vs = window.speechSynthesis.getVoices() || [];
      const base = code.split("-")[0];
      return vs.find((v) => v.lang === code) || vs.find((v) => v.lang && v.lang.replace("_", "-").startsWith(base)) || null;
    } catch { return null; }
  }
  function speak(text) {
    if (!voiceOut || !canTTS || !text) return;
    try {
      window.speechSynthesis.cancel();
      /* strip markdown (**bold**, #, `code`) so the whole sentence is read, not just digits */
      const clean = String(text).replace(/[*_#`>~]/g, "").replace(/\s+/g, " ").trim();
      const code = detectLang(clean);
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = code;
      const v = pickVoice(code);
      if (v) u.voice = v;
      u.rate = 1; u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  async function send(text) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    const history = [...msgs.filter((m) => m.role === "user" || m.role === "model"), { role: "user", text: t }];
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setPending(null);
    setBusy(true);
    try {
      const d = await api.aiChat(history.map((m) => ({ role: m.role, text: m.text })));
      const reply = (d && d.reply) || "…";
      setMsgs((m) => [...m, { role: "model", text: reply }]);
      if (d && d.action && d.action.type === "create") setPending(d.action);
      speak(reply);
    } catch (e) {
      setMsgs((m) => [...m, { role: "model", text: "Sorry — couldn't reach the assistant. " + (e.message || "") }]);
    }
    setBusy(false);
  }

  async function confirmCreate() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await api.create(pending.module, pending.fields);
      const id = (res && (res.id || (res.record && res.record.id))) || "";
      setMsgs((m) => [...m, { role: "note", text: `✓ Saved to ${pending.module}${id ? " (#" + id + ")" : ""}.` }]);
      setPending(null);
    } catch (e) {
      setMsgs((m) => [...m, { role: "note", text: "Could not save: " + (e.message || "error") }]);
    }
    setBusy(false);
  }

  function toggleMic() {
    if (!SR) { setMsgs((m) => [...m, { role: "note", text: "Voice input isn't available on this device — you can type instead." }]); return; }
    if (listening) { try { recRef.current && recRef.current.stop(); } catch {} return; }
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      rec.onresult = (e) => {
        const said = e.results[0][0].transcript;
        setListening(false);
        if (said) send(said);
      };
      rec.start();
    } catch { setListening(false); }
  }

  const mdClean = (t) => String(t).replace(/\*\*(.*?)\*\*/g, "$1").replace(/[*_`#>~]/g, "");
  const prettyFields = (f) => Object.entries(f || {}).filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);

  /* ----- styles ----- */
  const fab = { position: "fixed", right: 18, bottom: bottom, width: 56, height: 56, borderRadius: "50%", background: accent, color: "#fff", border: "none", boxShadow: "0 8px 24px rgba(20,25,60,.3)", cursor: "pointer", zIndex: 9998, display: "grid", placeItems: "center", fontSize: 24 };
  const mask = { position: "fixed", inset: 0, background: "rgba(10,16,40,.35)", zIndex: 9999, display: "flex", justifyContent: "flex-end", alignItems: "flex-end" };
  const panel = { width: "min(420px, 100vw)", height: "min(620px, 90vh)", background: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -8px 40px rgba(10,16,40,.35)" };
  const head = { background: accent, color: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 };
  const body = { flex: 1, overflowY: "auto", padding: 14, background: "#f6f8fd", display: "flex", flexDirection: "column", gap: 10 };
  const bubbleU = { alignSelf: "flex-end", background: accent, color: "#fff", padding: "8px 12px", borderRadius: "14px 14px 3px 14px", maxWidth: "82%", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" };
  const bubbleM = { alignSelf: "flex-start", background: "#fff", color: "#1a2236", padding: "8px 12px", borderRadius: "14px 14px 14px 3px", maxWidth: "82%", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 4px rgba(20,25,60,.08)" };
  const note = { alignSelf: "center", background: "#e8f0ff", color: "#1b3a8f", padding: "5px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600 };
  const foot = { borderTop: "1px solid #e6e9f2", padding: 10, display: "flex", gap: 8, alignItems: "center", background: "#fff" };
  const iconBtn = (on) => ({ width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer", background: on ? accent : "#eef1f8", color: on ? "#fff" : "#44506a", display: "grid", placeItems: "center", fontSize: 17, flexShrink: 0 });

  return (
    <>
      {!open && (
        <button style={fab} title="AI Assistant" onClick={() => setOpen(true)}>✦</button>
      )}
      {open && (
        <div style={mask} onClick={() => setOpen(false)}>
          <div style={panel} onClick={(e) => e.stopPropagation()}>
            <div style={head}>
              <span style={{ fontSize: 20 }}>✦</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Eurobond Assistant</div>
                <div style={{ fontSize: 11, opacity: .85 }}>{name ? "Hi " + name.split(" ")[0] + " · " : ""}ask or speak</div>
              </div>
              <select value={lang} onChange={(e) => setLang(e.target.value)} title="Language"
                style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, padding: "4px 6px" }}>
                {LANGS.map((l) => <option key={l.code} value={l.code} style={{ color: "#1a2236" }}>{l.label}</option>)}
              </select>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            <div style={body} ref={listRef}>
              {msgs.length === 0 && (
                <div style={{ color: "#6b7694", fontSize: 13.5, textAlign: "center", margin: "auto", padding: 16, lineHeight: 1.6 }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>✦</div>
                  Ask me anything — find a customer, show your tasks, add a new enquiry, or “how do I…”.<br />
                  <span style={{ fontSize: 12, opacity: .8 }}>Tap the mic to talk.</span>
                </div>
              )}
              {msgs.map((m, i) => (
                m.role === "note"
                  ? <div key={i} style={note}>{m.text}</div>
                  : <div key={i} style={m.role === "user" ? bubbleU : bubbleM}>{m.role === "model" ? mdClean(m.text) : m.text}</div>
              ))}

              {pending && (
                <div style={{ alignSelf: "flex-start", background: "#fff", border: "1.5px solid " + accent, borderRadius: 12, padding: 12, maxWidth: "92%", boxShadow: "0 2px 10px rgba(20,25,60,.1)" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: accent, marginBottom: 6 }}>New {pending.module} — confirm to save</div>
                  <div style={{ fontSize: 12.5, color: "#33415c", lineHeight: 1.6 }}>
                    {prettyFields(pending.fields).map((l, j) => <div key={j}>• {l}</div>)}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button disabled={busy} onClick={confirmCreate} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", background: accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>✓ Confirm & Save</button>
                    <button disabled={busy} onClick={() => setPending(null)} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #d4d9e6", background: "#fff", color: "#55607a", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              )}

              {busy && <div style={{ ...bubbleM, color: "#8b93a7" }}>…</div>}
            </div>

            <div style={foot}>
              <button style={iconBtn(listening)} title="Speak" onClick={toggleMic}>{listening ? "■" : "🎤"}</button>
              <button style={iconBtn(voiceOut)} title="Speak replies aloud" onClick={() => { setVoiceOut((v) => !v); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {} }}>🔊</button>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder={listening ? "Listening…" : "Type a message…"} disabled={busy}
                style={{ flex: 1, border: "1px solid #d9deea", borderRadius: 20, padding: "9px 14px", fontSize: 14, outline: "none" }} />
              <button style={{ ...iconBtn(true), background: accent }} title="Send" disabled={busy || !input.trim()} onClick={() => send()}>➤</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
