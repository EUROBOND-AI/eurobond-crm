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
import { useLocation, useNavigate } from "react-router-dom";
import eubotOrb from "../assets/eubot_orb.png";
import eubotDisc from "../assets/eubot_disc.png";
import eubotLogo from "../assets/eubot_logo.png";

/* EUVA mark.
   Bottom: the colour smoke — turned slowly AND pushed through a moving noise
   field (feTurbulence + feDisplacementMap), so its edges swell and ripple up and
   down like real smoke instead of just spinning.
   Middle: the dark disc and white ring, kept a clean circle.
   Top: the Eurobond logo, steady. */
function EubotIcon({ size = 40 }) {
  const fid = "ebw" + React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const spin = (s, rev) => ({ transformBox: "view-box", transformOrigin: "128px 128px", animation: `eubotspin ${s}s linear infinite${rev ? " reverse" : ""}` });
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0, animation: "eubotpulse 3.2s ease-in-out infinite alternate" }}>
      <svg viewBox="0 0 256 256" width={size} height={size} style={{ display: "block", overflow: "visible" }} aria-label="EUVA">
        <defs>
          <filter id={fid} x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="1" seed="7" result="n">
              <animate attributeName="baseFrequency" dur="6s" values="0.006;0.013;0.006" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="1.2" />
          </filter>
        </defs>
        <g filter={`url(#${fid})`}>
          <g style={spin(16)}><image href={eubotOrb} width="256" height="256" /></g>
        </g>
        <image href={eubotDisc} width="256" height="256" />
        <image href={eubotLogo} x="98" y="93.5" width="60" height="69" />
      </svg>
    </span>
  );
}

/* clean line icons (no emoji) */
const Icon = {
  mic: (c = "currentColor") => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>),
  stop: (c = "currentColor") => (<svg width="15" height="15" viewBox="0 0 24 24" fill={c}><rect x="5" y="5" width="14" height="14" rx="3" /></svg>),
  speaker: (c = "currentColor") => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>),
  send: (c = "currentColor") => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>),
  agent: (c = "currentColor") => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polygon points="15.5 8.5 10.5 10.5 8.5 15.5 13.5 13.5" fill={c} stroke="none" /></svg>),
  trash: (c = "currentColor") => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>),
  newchat: (c = "currentColor") => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>),
  hist: (c = "currentColor") => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>),
  info: (c = "currentColor") => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.6" r="0.7" fill={c} stroke="none" /></svg>),
  min: (c = "currentColor") => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>),
  close: (c = "currentColor") => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>),
};
function Waveform({ color = "#fff" }) {
  return (<span style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 20 }}>
    {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 3, height: 5, borderRadius: 3, background: color, animation: `eubotwave .9s ease-in-out ${i * 0.12}s infinite` }} />)}
  </span>);
}

/* recent chats are kept on this phone for a week; the company-wide record is
   saved on the server, by user. */
const HIST_KEY = "eb_euva_chats";
const HIST_WEEK = 7 * 24 * 3600 * 1000;
function loadChats() {
  try { const a = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); return (Array.isArray(a) ? a : []).filter((c) => c && Array.isArray(c.msgs) && c.msgs.length && (Date.now() - (c.at || 0)) < HIST_WEEK); } catch { return []; }
}
function saveChats(a) { try { localStorage.setItem(HIST_KEY, JSON.stringify(a.slice(0, 40))); } catch {} }

/* the dropdown sets which language the MIC listens for (speech recognition
   needs to be told); the written reply always follows the language used. */
/* screen ids EUVA can open -> the real routes (per surface) */
const APP_NAV = {
  home: "/app", customers: "/app/customers", add_customer: "/app/followup/new",
  nearby: "/app/nearby", nearby_projects: "/app/nearby-projects",
  enquiry: "/app/m/enquiry", add_enquiry: "/app/m/enquiry", quotation: "/app/m/quotation", add_quotation: "/app/m/quotation/new",
  project: "/app/m/projectProjection", add_project: "/app/project/new",
  sales_to_spec: "/app/m/salesToSpec", spec_to_sales: "/app/m/specToSales",
  expense: "/app/expense", add_expense: "/app/expense/new",
  leave: "/app/leave", apply_leave: "/app/leave/new",
  target: "/app/target", attendance: "/app/attendance",
  task: "/app/m/task", add_task: "/app/m/task", beat_plan: "/app/beat-plan", biltrax: "/app/biltrax",
  resources: "/app/resources", calendar: "/app/calendar", profile: "/app/profile",
  team: "/app/team", team_tracking: "/app/team-tracking", team_customers: "/app/team-customers",
  leave_approval: "/app/leave-approval", notifications: "/app/notifications", help: "/app/help", settings: "/app/profile", announcement: "/app/notifications",
};
const ADMIN_NAV = {
  home: "/admin/dashboards/home", dashboards: "/admin/dashboards/enquiry",
  enquiry: "/admin/sfa/enquiry", add_enquiry: "/admin/sfa/enquiry", customers: "/admin/sfa/customers",
  quotation: "/admin/sfa/quotation", add_quotation: "/admin/sfa/quotation",
  project: "/admin/sfa/project-projection", add_project: "/admin/sfa/project-projection",
  sales_to_spec: "/admin/sfa/sales-to-spec", spec_to_sales: "/admin/sfa/spec-to-sales",
  expense: "/admin/sfa/expense", leave: "/admin/sfa/leave", apply_leave: "/admin/sfa/leave",
  target: "/admin/sfa/target", attendance: "/admin/sfa/attendance", attendance_sheet: "/admin/sfa/attendance-sheet",
  checkin: "/admin/sfa/checkin", tour_report: "/admin/sfa/tour-report",
  task: "/admin/sfa/task", add_task: "/admin/sfa/task", beat_plan: "/admin/sfa/beat-plan", biltrax: "/admin/sfa/biltrax",
  products: "/admin/master/products", users: "/admin/master/users", resources: "/admin/master/resources",
  holidays: "/admin/master/holidays", ai_training: "/admin/master/ai-training", euva_history: "/admin/master/euva-history",
  notifications: "/admin/support/notification", help: "/admin/support/tickets", settings: "/admin/master/app-settings", announcement: "/admin/support/announcement",
};
const NAV_LABEL = {
  home: "Home", customers: "Customers", add_customer: "Add Customer", nearby: "Near By Customers", nearby_projects: "Near By Projects",
  enquiry: "Enquiry", add_enquiry: "Enquiry", quotation: "Quotation", add_quotation: "New Quotation", project: "Project Projection", add_project: "Add Site-Project",
  sales_to_spec: "Sales to Spec", spec_to_sales: "Spec to Sales", expense: "Expense", add_expense: "Add Expense", leave: "Leave", apply_leave: "Apply Leave",
  target: "Target", attendance: "Attendance", attendance_sheet: "Attendance Sheet", checkin: "Check-in", tour_report: "Tour Report",
  task: "Task", add_task: "Task", beat_plan: "Beat Plan", biltrax: "Biltrax", resources: "Resources & Links", calendar: "Calendar", profile: "Profile",
  team: "Team Performance", team_tracking: "Team Tracking", team_customers: "Team Customers", leave_approval: "Leave Approval", notifications: "Notifications",
  help: "Support & Help", settings: "Settings", announcement: "Announcements", products: "Products", users: "Users", ai_training: "EUVA AI Training", euva_history: "EUVA Chat History", dashboards: "Dashboards",
};

/* words that mean a screen, so a plain "open X" is handled on the device at
   once (no server, no wait). Keep common English + Telugu/Hindi forms. */
const NAV_KEYWORDS = {
  home: ["home", "హోమ్", "होम"],
  attendance_sheet: ["attendance sheet", "హాజరు షీట్", "అటెండెన్స్ షీట్"],
  attendance: ["attendance", "అటెండెన్స్", "హాజరు", "हाज़िरी", "hajiri"],
  customers: ["customer", "కస్టమర్", "కష్టమర్", "ఖాతాదారు", "follow up", "followup", "ఫాలో"],
  enquiry: ["enquiry", "enquiries", "ఎంక్వైరీ", "ఎంక్వయిరీ", "ఎన్‌క్వైరీ", "lead", "లీడ్"],
  quotation: ["quotation", "quote", "కొటేషన్", "కోటేషన్"],
  expense: ["expense", "ఖర్చు", "ఎక్స్‌పెన్స్", "खर्च"],
  leave: ["leave", "లీవ్", "సెలవు", "छुट्टी"],
  target: ["target", "టార్గెట్", "లక్ష్యం"],
  task: ["task", "టాస్క్", "పని"],
  project: ["project", "ప్రాజెక్ట్", "ప్రాజక్ట్"],
  biltrax: ["biltrax", "బిల్ట్రాక్స్"],
  beat_plan: ["beat plan", "బీట్"],
  resources: ["resource", "catalogue", "catalog", "రిసోర్స్", "వీడియో", "కేటలాగ్"],
  calendar: ["calendar", "క్యాలెండర్", "కేలండర్"],
  profile: ["profile", "ప్రొఫైల్", "ప్రొఫైల్"],
  settings: ["settings", "setting", "సెట్టింగ్", "సెట్టింగ్స్"],
  announcement: ["announcement", "headline", "హెడ్‌లైన్", "హెడ్ లైన్", "ప్రకటన"],
  notifications: ["notification", "నోటిఫికేషన్", "నోటిఫికేషన్స్"],
  help: ["help", "support", "హెల్ప్", "సపోర్ట్"],
  products: ["product", "ప్రొడక్ట్", "ఉత్పత్తి"],
  users: ["users", "staff list", "యూజర్", "సిబ్బంది జాబితా"],
  ai_training: ["ai training", "euva training", "ఏఐ ట్రైనింగ్"],
  euva_history: ["chat history", "euva history", "చాట్ హిస్టరీ"],
  team: ["team performance", "టీమ్ పెర్ఫార్మెన్స్"],
  team_tracking: ["team tracking", "టీమ్ ట్రాకింగ్"],
  nearby: ["near by customer", "nearby customer", "దగ్గర కస్టమర్"],
};
const BTN_SYN = {
  "show": "show", "చూపించు": "show", "చూపు": "show", "షో": "show", "chupinchu": "show", "chupu": "show",
  "add": "add", "యాడ్": "add", "కొత్త": "add", "new": "add", "add new": "add",
  "search": "search", "వెతుకు": "search", "సెర్చ్": "search",
  "refresh": "refresh", "రిఫ్రెష్": "refresh", "reload": "refresh",
  "submit": "submit", "సబ్మిట్": "submit",
  "save": "save", "సేవ్": "save",
  "export": "export", "ఎక్స్‌పోర్ట్": "export",
  "download": "download", "డౌన్‌లోడ్": "download",
  "filter": "filter", "ఫిల్టర్": "filter",
  "edit": "edit", "ఎడిట్": "edit",
  "apply": "apply", "అప్లై": "apply",
};
const CLICK_VERB = /\b(click|press|tap|clik)\b|క్లిక్|నొక్కు|నొక్కం|క్లిక్ చెయ్|press chey/i;
const NAV_OPEN = /\b(open|go to|goto|take me|show me the|jao|kholo)\b|ఓపెన్|తెర|వెళ్|చూపించు|खोल|चल/i;
const NAV_DATA = /\b(all|states|state wise|total|how many|count|filter|list|breakdown|summary|report)\b|ఎన్ని|మొత్తం|వారీగా|ఉన్నాయి|జాబితా|ఫిల్టర్/i;

const LANGS = [
  { code: "en-IN", label: "English" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "mr-IN", label: "मराठी" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
];

const SR = (typeof window !== "undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
/* Inside the Android app the browser voice APIs are missing, so the native
   plugins are used there (SpeechRecognition / TextToSpeech, added in the APK). */
function capPlug(n) {
  try {
    const C = typeof window !== "undefined" ? window.Capacitor : null;
    return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins[n] ? C.Plugins[n] : null;
  } catch { return null; }
}
const canTTS = (typeof window !== "undefined") && "speechSynthesis" in window;
function SR_OK() { try { return !!(SR || capPlug("SpeechRecognition")); } catch { return false; } }

/* one-tap starters on the empty screen */
const SUGGEST_APP = ["My schedule today", "Add a new customer", "Add remark + next visit", "My enquiries", "Apply leave", "How do I add an expense?"];
const SUGGEST_ADMIN = ["Enquiries this month by source", "Win sq.m & ₹ by person this month", "Today's attendance", "Quotation value this month", "Assign a task", "How do I assign enquiries?"];

export default function ChatAssistant({ accent = "#1b3a8f", bottom = 18, surface = "admin", side = "right" }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);            // {role:'user'|'model'|'note', text, action?}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(() => { try { return localStorage.getItem("eb_ai_voice") !== "0"; } catch { return true; } });
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("eb_ai_lang") || "en-IN"; } catch { return "en-IN"; } });
  const [pending, setPending] = useState(null);    // {type:'create', module, fields}
  const [activeId, setActiveId] = useState(() => Date.now());
  const [chats, setChats] = useState(() => loadChats());
  const [showHist, setShowHist] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [agent, setAgent] = useState(() => { try { return localStorage.getItem("eb_euva_agent") === "1"; } catch { return false; } });
  const nav = useNavigate();
  const selfNav = useRef(false);
  const listeningRef = useRef(false);
  const openRef = useRef(false);
  const agentRef = useRef(false);
  const pendingRef = useRef(false);
  const busyRef = useRef(false);
  const listRef = useRef(null);
  const recRef = useRef(null);
  const FABSZ = 62;
  /* the floating button can be dragged anywhere and remembers where it was put
     (separately for the app and the admin panel). */
  const [pos, setPos] = useState(() => { try { const v = JSON.parse(localStorage.getItem("eb_eubot_pos_" + surface) || "null"); if (v && typeof v.x === "number") return v; } catch {} return null; });
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  useEffect(() => {
    if (pos) return;
    const W = window.innerWidth, H = window.innerHeight, gap = (bottom || 16);
    setPos(side === "right" ? { x: W - FABSZ - 14, y: H - FABSZ - gap - 44 } : { x: 14, y: H - FABSZ - gap - 44 });
  }, []);
  useEffect(() => { if (pos) { try { localStorage.setItem("eb_eubot_pos_" + surface, JSON.stringify(pos)); } catch {} } }, [pos]);
  const clampPos = (x, y) => { const W = window.innerWidth, H = window.innerHeight; return { x: Math.max(-Math.round(FABSZ * 0.74), Math.min(W - Math.round(FABSZ * 0.26), x)), y: Math.max(64, Math.min(H - FABSZ - 10, y)) }; };
  function onFabDown(e) {
    const cur = pos || { x: 14, y: window.innerHeight - 120 };
    drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y };
    window.addEventListener("pointermove", onFabMove);
    window.addEventListener("pointerup", onFabUp);
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch {}
  }
  function onFabMove(e) {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.sx, dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.current.moved = true;
    setPos(clampPos(drag.current.ox + dx, drag.current.oy + dy));
  }
  function onFabUp() {
    window.removeEventListener("pointermove", onFabMove);
    window.removeEventListener("pointerup", onFabUp);
    const wasMoved = drag.current.moved;
    drag.current.active = false;
    if (!wasMoved) { setOpen(true); return; }
    /* shoved to an edge -> tuck it half into the edge (a small peeking handle);
       otherwise rest at a normal margin. Either way, tap it to open, drag to move. */
    setPos((p) => {
      const W = window.innerWidth;
      let x;
      if (p.x < 28) x = -Math.round(FABSZ * 0.66);
      else if (p.x > W - FABSZ - 28) x = W - Math.round(FABSZ * 0.34);
      else x = (p.x + FABSZ / 2) < W / 2 ? 14 : W - FABSZ - 14;
      return clampPos(x, p.y);
    });
  }

  useEffect(() => { try { localStorage.setItem("eb_ai_lang", lang); } catch {} }, [lang]);
  useEffect(() => { try { localStorage.setItem("eb_ai_voice", voiceOut ? "1" : "0"); } catch {} }, [voiceOut]);
  useEffect(() => { try { localStorage.setItem("eb_euva_agent", agent ? "1" : "0"); } catch {} }, [agent]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { agentRef.current = agent; }, [agent]);
  useEffect(() => { pendingRef.current = !!pending; }, [pending]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs, busy, pending]);
  /* load TTS voices up front (getVoices is async the first time) */
  useEffect(() => { if (canTTS) { try { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => {}; } catch {} } }, []);
  /* keep this chat in the 7-day on-phone history */
  useEffect(() => {
    if (!msgs.length) return;
    const title = (msgs.find((m) => m.role === "user") || {}).text || "Chat";
    setChats((prev) => {
      const rest = prev.filter((c) => c.id !== activeId);
      const next = [{ id: activeId, at: Date.now(), title: String(title).slice(0, 48), msgs }, ...rest]
        .filter((c) => (Date.now() - (c.at || 0)) < HIST_WEEK).slice(0, 40);
      saveChats(next); return next;
    });
  }, [msgs]);
  function newChat() { setMsgs([]); setPending(null); setInput(""); setShowHist(false); setShowInfo(false); setActiveId(Date.now()); stopSpeaking(); }
  function openChat(c) { stopSpeaking(); setMsgs(Array.isArray(c.msgs) ? c.msgs : []); setActiveId(c.id); setPending(null); setShowHist(false); }
  /* EUVA opens a screen for the user. It navigates the app underneath and the
     chat stays open, so the next command can follow. */
  function goScreen(screen) {
    const map = surface === "admin" ? ADMIN_NAV : APP_NAV;
    const path = map[screen];
    if (!path) { setMsgs((m) => [...m, { role: "note", text: "I can't open that screen from here." }]); return; }
    selfNav.current = true;                    // don't let my own navigation close the chat
    try { nav(path); } catch {}
    if (!agentRef.current) setMsgs((m) => [...m, { role: "note", text: "Opened " + (NAV_LABEL[screen] || screen) + " — tap the top to see it." }]);
  }
  /* a plain "open X" command -> which screen (resolved on the device, instantly).
     Returns a screen id only for a clear, short open command, so data questions
     like "enquiry dashboard all states" still go to EUVA. */
  function localNav(text) {
    const t = " " + text.toLowerCase().trim() + " ";
    if (NAV_DATA.test(t)) return null;
    if (t.trim().split(/\s+/).length > 6) return null;
    const map = surface === "admin" ? ADMIN_NAV : APP_NAV;
    let best = null;
    for (const [screen, words] of Object.entries(NAV_KEYWORDS)) {
      if (!map[screen]) continue;
      for (const w of words) { if (t.includes(w)) { if (!best || w.length > best.len) best = { screen, len: w.length }; } }
    }
    if (!best) return null;
    const bareShort = agentRef.current && t.trim().split(/\s+/).length <= 3;
    return (NAV_OPEN.test(t) || bareShort) ? best.screen : null;
  }
  /* click a visible button/link on the CURRENT screen by its name (Show, Add,
     Search, Refresh, Submit…). Works on any screen because the whole app is one
     page. EUVA's own controls are skipped (data-euva). */
  function clickOnScreen(word) {
    try {
      const want = String(word).toLowerCase().trim();
      const vis = (el) => { try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden"; } catch { return false; } };
      const norm = (s) => String(s || "").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const els = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='submit'], input[type='button']"))
        .filter((el) => !el.closest("[data-euva]") && vis(el));
      const score = (el) => {
        const tx = norm(el.textContent || el.value || el.getAttribute("title") || el.getAttribute("aria-label"));
        if (!tx) return 0;
        if (tx === want) return 100;
        if (tx.split(" ")[0] === want) return 80;
        if (tx.startsWith(want)) return 60;
        if (tx.includes(want)) return 40 - Math.min(20, tx.length);
        return 0;
      };
      let best = null, bs = 0;
      for (const el of els) { const sc = score(el); if (sc > bs) { bs = sc; best = el; } }
      if (best && bs >= 40) { best.click(); return true; }
      return false;
    } catch { return false; }
  }
  /* "click the Show button", "show button click chey" -> click it on screen. */
  function localClick(text) {
    const t = " " + text.toLowerCase() + " ";
    if (!CLICK_VERB.test(t)) return null;
    let target = null, tl = 0;
    for (const k of Object.keys(BTN_SYN)) { if (t.includes(k)) { if (k.length > tl) { tl = k.length; target = BTN_SYN[k]; } } }
    if (target) return target;
    /* no known word -> use whatever English word they named (e.g. "click Win") */
    const cleaned = t.replace(/\b(click|press|tap|clik|the|button|btn|on|please|now|chey|cheyyi|chesi|screen|this|here|a|an)\b/gi, " ")
      .replace(/క్లిక్|నొక్కు|బటన్|మీద|చెయ్|చేసి|ని|ను/g, " ")
      .replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
    const w = cleaned.split(" ").filter((x) => x.length >= 2)[0];
    return w || null;
  }
  /* keep the mic live in hands-free agent mode */
  function armMic() {
    if (!SR_OK() || listeningRef.current || busyRef.current || pendingRef.current) return;
    toggleMic();
  }
  function stopMic() {
    try { recRef.current && recRef.current.stop(); } catch {}
    const P = capPlug("SpeechRecognition"); if (P) { try { P.stop(); } catch {} }
    setListening(false);
  }
  /* The agent button: ON -> get the chat out of the way and listen hands-free,
     so EUVA drives the visible app as you speak. OFF -> back to normal. */
  function toggleAgent() {
    const on = !agent;
    setAgent(on);
    if (on) { setOpen(false); setShowHist(false); setShowInfo(false); stopSpeaking(); setTimeout(armMic, 450); }
    else { stopMic(); stopSpeaking(); }
  }
  function deleteChat(id) {
    setChats((prev) => { const next = prev.filter((c) => c.id !== id); saveChats(next); return next; });
    try { api.euvaDeleteChat && api.euvaDeleteChat(id); } catch {}   // also remove it from the admin history
    if (id === activeId) newChat();
  }
  /* using a bottom-nav button (Home / Attendance / Target / Profile) or opening
     any screen closes EUVA, so it is out of the way the moment you move on. */
  const loc = useLocation();
  const firstLoc = useRef(true);
  useEffect(() => {
    if (firstLoc.current) { firstLoc.current = false; return; }
    if (selfNav.current) { selfNav.current = false; return; }   // EUVA drove here on purpose — stay open
    setOpen(false); stopSpeaking();
  }, [loc.pathname]);
  /* when the panel opens, drop from the on-phone list any chat the admin has
     deleted on the server (a chat with a reply that the server no longer has). */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const d = await api.euvaMyChats();
        if (!alive || !d || !d.ok || !Array.isArray(d.chatIds)) return;
        const keep = new Set(d.chatIds.map(String));
        setChats((prev) => {
          const next = prev.filter((c) => {
            const hasReply = Array.isArray(c.msgs) && c.msgs.some((m) => m.role === "model");
            return hasReply ? keep.has(String(c.id)) : true;
          });
          saveChats(next); return next;
        });
      } catch {}
    })();
    return () => { alive = false; };
  }, [open]);

  const name = (auth.user && (auth.user.name || auth.user.fullName)) || "";
  const isAdminUser = !!(auth.user && (auth.user.owner || /admin/i.test(String(auth.user.role || ""))));

  /* text prepared for the voice: drop links, markdown AND emojis/symbols, so it
     reads the sentence and never spells an emoji out loud */
  const EMOJI = /([\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u2600-\u26FF\uFE00-\uFE0F\u2022\u200D\u2713\u2714\u2716\u2717]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])/g;
  const speechClean = (t) => String(t).replace(/https?:\/\/\S+/g, "").replace(EMOJI, "").replace(/[*_#`>~]/g, "").replace(/\s+/g, " ").trim();

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
  function stopSpeaking() {
    const T = capPlug("TextToSpeech");
    if (T) { try { T.stop(); } catch {} }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
  }
  function speak(text) {
    if (!voiceOut || !text) return;
    const T = capPlug("TextToSpeech");
    if (T) {
      const clean = speechClean(text);
      const code = detectLang(clean);
      Promise.resolve(T.stop ? T.stop() : null).catch(() => {})
        .then(() => T.speak({ text: clean, lang: code, rate: 1.0, pitch: 1.0, volume: 1.0, category: "ambient" }))
        .catch(() => { try { T.speak({ text: clean, lang: "en-IN", rate: 1.0, pitch: 1.0, volume: 1.0, category: "ambient" }); } catch {} });
      return;
    }
    if (!canTTS) return;
    try {
      window.speechSynthesis.cancel();
      const clean = speechClean(text);
      const code = detectLang(clean);
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = code;
      const v = pickVoice(code);
      if (v) u.voice = v;
      u.rate = 1; u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  /* Typed question -> text reply (no voice). Spoken question -> the answer is
     read aloud. So "chat" stays chat and "talk" talks back. The speaker toggle
     can still force voice for typed questions if someone turns it on. */
  async function send(text, spoken = false) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    try { const L = detectLang(t); if (L) setLang(L); } catch {}   // reply & voice follow the language used
    /* INSTANT: a plain "open X" opens on the device right away — no server, no wait. */
    const scr = localNav(t);
    if (scr) {
      stopSpeaking();
      setMsgs((m) => [...m, { role: "user", text: t }]);
      setInput("");
      goScreen(scr);
      if (spoken) speak("Opened " + (NAV_LABEL[scr] || scr));
      if (agentRef.current) setTimeout(armMic, 500);
      return;
    }
    /* INSTANT: a "click the X button" works on the screen you're on, no server. */
    const btn = localClick(t);
    if (btn) {
      stopSpeaking();
      setMsgs((m) => [...m, { role: "user", text: t }]);
      setInput("");
      const ok = clickOnScreen(btn);
      const msg = ok ? ("Clicked " + btn) : ("I couldn't find a \"" + btn + "\" button on this screen.");
      setMsgs((m) => [...m, { role: "note", text: msg }]);
      if (spoken) speak(msg);
      if (agentRef.current) setTimeout(armMic, 500);
      return;
    }
    setVoiceOut(spoken);            // mic -> speaker on, typing -> speaker off
    stopSpeaking();                       // any running reply stops the moment a new one starts
    const history = [...msgs.filter((m) => m.role === "user" || m.role === "model"), { role: "user", text: t }];
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setPending(null);
    setBusy(true);
    try {
      const d = await api.aiChat(history.map((m) => ({ role: m.role, text: m.text })), activeId, { agent, surface });
      const reply = (d && d.reply) || "…";
      setMsgs((m) => [...m, { role: "model", text: reply }]);
      if (d && d.action && (d.action.type === "create" || d.action.type === "update" || d.action.type === "delete")) setPending(d.action);
      if (d && d.nav) goScreen(d.nav);
      if (spoken) speak(reply);
    } catch (e) {
      setMsgs((m) => [...m, { role: "model", text: "Sorry — couldn't reach the assistant. " + (e.message || "") }]);
    }
    setBusy(false);
    /* hands-free: keep listening for the next command in agent mode */
    if (agentRef.current && !pendingRef.current) setTimeout(armMic, 800);
  }

  /* the phone's position, for a customer added without an address */
  function gpsNow() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 9000);
      navigator.geolocation.getCurrentPosition(
        (p) => { if (!done) { done = true; clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude }); } },
        () => { if (!done) { done = true; clearTimeout(t); res(null); } },
        { enableHighAccuracy: true, timeout: 8000 });
    });
  }

  /* Save what EUVA prepared — only ever on the user's tap.
     create → a new record; update → read the record fresh, apply the change
     (set fields, append to a list) and write it back, so nothing typed on
     another screen in the meantime is lost. Then the same follow-ups the
     normal screens do: phone reminder for a next call/visit, notifications. */
  async function confirmEntry() {
    if (!pending) return;
    const p = pending;
    setBusy(true);
    try {
      let label = "";
      if (p.type === "delete") {
        await api.remove(p.module, p.id);
        label = `🗑 ${p.title || "Record"} deleted.`;
        setMsgs((m) => [...m, { role: "note", text: label }]);
        if (agentRef.current) speak(label);
        setPending(null); setBusy(false);
        if (agentRef.current) setTimeout(armMic, 700);
        return;
      }
      if (p.type === "update") {
        const cur = await api.get(p.module, p.id);
        const rec = { ...((cur && cur.record && cur.record.data) || {}) };
        const set = { ...(p.set || {}) };
        const su = set.__statusUnless; delete set.__statusUnless;
        Object.assign(rec, set);
        if (su && !(su.keep || []).includes(String(rec.status || "").toLowerCase())) rec.status = su.value;
        Object.entries(p.push || {}).forEach(([k, v]) => { rec[k] = [...(Array.isArray(rec[k]) ? rec[k] : []), v]; });
        delete rec._id;
        await api.update(p.module, p.id, rec);
        label = `✓ ${p.title || "Updated"} saved (#${p.id}).`;
      } else {
        const fields = { ...(p.fields || {}) };
        if (p.gps) {
          const g = await gpsNow();
          if (g) { fields.lat = g.lat; fields.lng = g.lng; if (!fields.address) fields.address = `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`; }
        }
        const res = await api.create(p.module, fields);
        const id = (res && (res.id || (res.record && res.record.id))) || "";
        label = `✓ ${p.title || "Entry"} saved${id ? " (#" + id + ")" : ""}.`;
      }
      const r = p.reminder;
      if (r && r.date && typeof window !== "undefined" && typeof window.ebScheduleReminder === "function") {
        try { window.ebScheduleReminder(r.title, r.date, r.note, r.time, r.kind); } catch {}
      }
      for (const n of (p.notify || [])) {
        try { await api.notify({ ...n, createdAt: new Date().toLocaleString("en-IN"), at: new Date().toISOString() }); } catch {}
      }
      if (r && r.date) label += ` Added to calendar for ${r.date}${r.time ? " " + r.time : ""}.`;
      setMsgs((m) => [...m, { role: "note", text: label }]);
      if (agentRef.current) speak(label);
      setPending(null);
    } catch (e) {
      setMsgs((m) => [...m, { role: "note", text: "Could not save: " + (e.message || "error") }]);
    }
    setBusy(false);
    if (agentRef.current) setTimeout(armMic, 700);
  }

  async function nativeMic(P) {
    if (listening) { try { await P.stop(); } catch {} setListening(false); return; }
    try {
      const av = await P.available().catch(() => ({ available: true }));
      if (av && av.available === false) { setMsgs((m) => [...m, { role: "note", text: "Voice input isn't available on this phone — please install/enable Google voice typing, or type instead." }]); return; }
      let perm = await P.checkPermissions().catch(() => null);
      if (!perm || perm.speechRecognition !== "granted") perm = await P.requestPermissions().catch(() => null);
      if (!perm || perm.speechRecognition !== "granted") { setMsgs((m) => [...m, { role: "note", text: "Please allow the microphone for Eurobond CRM to talk to EUVA." }]); return; }
      setListening(true);
      const res = await P.start({ language: lang, maxResults: 1, prompt: "Speak to EUVA…", partialResults: false, popup: false });
      setListening(false);
      const said = res && Array.isArray(res.matches) ? res.matches[0] : "";
      if (said) send(said, true);
      else if (agentRef.current && !pendingRef.current) setTimeout(armMic, 700);
    } catch { setListening(false); if (agentRef.current && !pendingRef.current) setTimeout(armMic, 1200); }
  }

  function toggleMic() {
    stopSpeaking();                       // tapping the mic silences the current reply at once
    const P = capPlug("SpeechRecognition");
    if (P) { nativeMic(P); return; }
    if (!SR) { setMsgs((m) => [...m, { role: "note", text: "Voice input isn't available on this device — you can type instead." }]); return; }
    if (listening) { try { recRef.current && recRef.current.stop(); } catch {} return; }
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onerror = () => { setListening(false); if (agentRef.current && !pendingRef.current) setTimeout(armMic, 1200); };
      rec.onend = () => { setListening(false); if (agentRef.current && !pendingRef.current && !busyRef.current) setTimeout(armMic, 700); };
      rec.onresult = (e) => {
        const said = e.results[0][0].transcript;
        setListening(false);
        if (said) send(said, true);
      };
      rec.start();
    } catch { setListening(false); }
  }

  const mdClean = (t) => String(t)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 — $2")   // [Video](url) → Video — url
    .replace(/^\s*[*-]\s+/gm, "• ")          // markdown bullets → •
    .replace(/^\s*#{1,6}\s*/gm, "")          // headings
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[*`#>~]/g, "")
    .trim();
  /* links in a reply (videos, catalogues from Resources & Links) are tappable —
     opened the same way the Resources screen opens them */
  const openLink = (u) => { try { window.open(u, "_blank"); } catch {} };
  const withLinks = (t) => String(t).split(/(https?:\/\/[^\s<>()"']+)/g).map((part, k) =>
    /^https?:\/\//.test(part)
      ? <a key={k} href={part.replace(/[.,;:!?)\]]+$/, "")} onClick={(e) => { e.preventDefault(); openLink(part.replace(/[.,;:!?)\]]+$/, "")); }}
          style={{ color: accent, fontWeight: 700, wordBreak: "break-all", textDecoration: "underline" }}>{part}</a>
      : part);
  const prettyFields = (f) => Object.entries(f || {}).filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);

  /* ----- styles ----- */
  const fab = { position: "fixed", left: pos ? pos.x : 14, top: pos ? pos.y : undefined, width: FABSZ, height: FABSZ, background: "transparent", border: "none", cursor: "grab", touchAction: "none", zIndex: 9998, padding: 0, filter: "drop-shadow(0 6px 14px rgba(70,40,170,.35))" };
  /* APP: full screen, but it stops just above the bottom Home / Attendance /
     Target / Profile bar so that bar stays visible and tappable underneath.
     ADMIN: a tall panel down the right edge. */
  const panel = surface === "app"
    ? { position: "fixed", top: "18vh", left: 0, right: 0, bottom: "var(--f-nav-total, 56px)", background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 9997, borderTopLeftRadius: 18, borderTopRightRadius: 18, boxShadow: "0 -10px 44px rgba(10,16,40,.3)" }
    : { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px, 100vw)", background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "-10px 0 48px rgba(10,16,40,.28)", zIndex: 9997 };
  /* tap outside the sheet to close — in the app this strip never covers the
     bottom Home/Attendance/Target/Profile bar, so that stays live. */
  const backdrop = surface === "app"
    ? { position: "fixed", top: 0, left: 0, right: 0, bottom: "var(--f-nav-total, 56px)", background: "rgba(10,16,40,.18)", zIndex: 9996 }
    : { position: "fixed", inset: 0, background: "rgba(10,16,40,.25)", zIndex: 9996 };
  const agentBar = { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: surface === "app" ? "calc(var(--f-nav-total, 56px) + 10px)" : 16, width: "min(440px, calc(100vw - 20px))", background: accent, color: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 16, boxShadow: "0 10px 34px rgba(10,16,40,.4)", zIndex: 9998 };
  const hBtn = { background: "rgba(255,255,255,.14)", border: "none", color: "#fff", cursor: "pointer", width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0 };
  const head = { background: accent, color: "#fff", padding: "11px 12px", display: "flex", alignItems: "center", gap: 7 };
  const body = { flex: 1, overflowY: "auto", padding: 14, background: "#f6f8fd", display: "flex", flexDirection: "column", gap: 10 };
  const bubbleU = { alignSelf: "flex-end", background: accent, color: "#fff", padding: "8px 12px", borderRadius: "14px 14px 3px 14px", maxWidth: "82%", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" };
  const bubbleM = { alignSelf: "flex-start", background: "#fff", color: "#1a2236", padding: "8px 12px", borderRadius: "14px 14px 14px 3px", maxWidth: "82%", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: "0 1px 4px rgba(20,25,60,.08)" };
  const note = { alignSelf: "center", background: "#e8f0ff", color: "#1b3a8f", padding: "5px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600 };
  const foot = { borderTop: "1px solid #e6e9f2", padding: 10, display: "flex", gap: 8, alignItems: "center", background: "#fff" };
  const iconBtn = (on) => ({ width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer", background: on ? accent : "#eef1f8", color: on ? "#fff" : "#44506a", display: "grid", placeItems: "center", fontSize: 17, flexShrink: 0 });

  return (
    <>
      {agent && !open && (
        <div style={agentBar} data-euva="1" onClick={(e) => e.stopPropagation()}>
          <EubotIcon size={34} />
          {pending ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: pending.type === "delete" ? "#ffd3d0" : "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pending.title}</div>
                <div style={{ fontSize: 10.5, opacity: .85, color: "#fff" }}>{pending.type === "delete" ? "Say yes / tap Delete" : "Tap to confirm"}</div>
              </div>
              <button disabled={busy} onClick={confirmEntry} style={{ border: "none", background: pending.type === "delete" ? "#e74c3c" : "#fff", color: pending.type === "delete" ? "#fff" : accent, fontWeight: 800, borderRadius: 9, padding: "7px 12px", cursor: "pointer", flexShrink: 0 }}>{pending.type === "delete" ? "Delete" : "Confirm"}</button>
              <button disabled={busy} onClick={() => { setPending(null); setTimeout(armMic, 400); }} style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", borderRadius: 9, padding: "7px 10px", cursor: "pointer", flexShrink: 0 }}>✕</button>
            </>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>EUVA {busy ? "working…" : listening ? "listening…" : "ready"}</div>
                <div style={{ fontSize: 10.5, opacity: .85, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Say: open enquiry · mark … Win · add a customer</div>
              </div>
              {listening ? <Waveform color="#fff" /> : <button onClick={armMic} title="Tap to speak" style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>{Icon.mic("#fff")}</button>}
              <button onClick={() => setOpen(true)} title="Open chat" style={{ border: "none", background: "rgba(255,255,255,.18)", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>{Icon.hist("#fff")}</button>
              <button onClick={toggleAgent} title="Stop agent mode" style={{ border: "none", background: "#fff", color: accent, width: 34, height: 34, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, fontWeight: 800 }}>{Icon.close(accent)}</button>
            </>
          )}
        </div>
      )}
      <style>{`@keyframes eubotwave{0%,100%{height:5px}50%{height:18px}}@keyframes eubotspin{to{transform:rotate(360deg)}}@keyframes eubotpulse{from{transform:scale(.96)}to{transform:scale(1.05)}}@media (prefers-reduced-motion:reduce){[style*="eubotspin"],[style*="eubotpulse"]{animation:none!important}}.euva-sign{font-weight:800;font-size:13.5px;letter-spacing:.3px;background:linear-gradient(90deg,#1b3a8f,#6c5ce7,#00b894,#1b3a8f);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:euvashine 6s linear infinite}@keyframes euvashine{to{background-position:300% 0}}`}</style>
      {!open && pos && !agent && (
        <button style={fab} data-euva="1" title="EUVA — drag to move, tap to chat" aria-label="EUVA" onPointerDown={onFabDown}>
          <EubotIcon size={FABSZ} />
        </button>
      )}
      {open && (
        <>
          <div style={backdrop} onClick={() => { setOpen(false); stopSpeaking(); }} />
          <div style={panel} data-euva="1">
            <div style={head}>
              <EubotIcon size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: .5 }}>EUVA</div>
                <div style={{ fontSize: 11, opacity: .85 }}>{name ? "Hi " + name.split(" ")[0] + " · " : ""}ask or speak</div>
              </div>
              <select value={lang} onChange={(e) => setLang(e.target.value)} title="Speaking language (for the mic)"
                style={{ background: "rgba(255,255,255,.14)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, padding: "4px 4px", maxWidth: 72 }}>
                {LANGS.map((l) => <option key={l.code} value={l.code} style={{ color: "#1a2236" }}>{l.label}</option>)}
              </select>
              <button style={{ ...hBtn, background: agent ? "#fff" : "rgba(255,255,255,.14)", color: agent ? accent : "#fff" }} title={agent ? "Agent mode: ON — I open screens as you ask" : "Agent mode: OFF"} onClick={toggleAgent}>{Icon.agent(agent ? accent : "#fff")}</button>
              <button style={hBtn} title="New chat" onClick={newChat}>{Icon.newchat("#fff")}</button>
              <button style={hBtn} title="Recent chats" onClick={() => setShowHist((v) => !v)}>{Icon.hist("#fff")}</button>
              <button style={hBtn} title="Close (your chat is kept)" onClick={() => { setOpen(false); stopSpeaking(); }}>{Icon.close("#fff")}</button>
            </div>

            {showHist && (
              <div style={{ position: "absolute", top: 62, left: 0, right: 0, bottom: 0, background: "#f6f8fd", overflowY: "auto", padding: 12, zIndex: 5 }}>
                <div style={{ fontWeight: 800, color: "#2a3450", fontSize: 13, margin: "2px 4px 10px" }}>Recent chats · last 7 days</div>
                {chats.length === 0 && <div style={{ color: "#8b93a7", fontSize: 13, textAlign: "center", padding: 24 }}>No saved chats yet.</div>}
                {chats.map((c) => (
                  <button key={c.id} onClick={() => openChat(c)} style={{ display: "block", width: "100%", textAlign: "left", border: "1px solid #e2e7f3", background: c.id === activeId ? "#eef3ff" : "#fff", borderRadius: 10, padding: "9px 12px", marginBottom: 8, cursor: "pointer" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#2a3450", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: "#8b93a7" }}>{new Date(c.at).toLocaleString("en-IN")}</div>
                  </button>
                ))}
                <div style={{ fontSize: 11, color: "#9aa3bd", textAlign: "center", marginTop: 8 }}>Chats older than 7 days are cleared on this phone.</div>
              </div>
            )}

            <div style={body} ref={listRef}>
              {msgs.length === 0 && (
                <div style={{ color: "#6b7694", fontSize: 13.5, textAlign: "center", margin: "auto", padding: 16, lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 10 }}><EubotIcon size={80} /></div>
                  <div style={{ fontWeight: 800, color: "#2a3450", fontSize: 16, marginBottom: 6 }}>Meet EUVA</div>
                  <div className="euva-sign" style={{ marginBottom: 10 }}>Trained &amp; Developed by Karthik G</div>
                  Ask me anything, in any language — I can find, calculate, explain any screen, give product &amp; contact details, and make entries for you.<br />
                  <span style={{ fontSize: 12, opacity: .8 }}>Tap the mic to talk.</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 14 }}>
                    {(isAdminUser ? SUGGEST_ADMIN : SUGGEST_APP).map((s) => (
                      <button key={s} onClick={() => send(s)}
                        style={{ border: "1px solid #d6dcf0", background: "#fff", color: "#2a3450", borderRadius: 16, padding: "6px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                m.role === "note"
                  ? <div key={i} style={note}>{m.text}</div>
                  : <div key={i} style={m.role === "user" ? bubbleU : bubbleM}>{m.role === "model" ? withLinks(mdClean(m.text)) : m.text}</div>
              ))}

              {pending && (
                <div style={{ alignSelf: "flex-start", background: "#fff", border: "1.5px solid " + accent, borderRadius: 12, padding: 12, maxWidth: "92%", boxShadow: "0 2px 10px rgba(20,25,60,.1)" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: pending.type === "delete" ? "#c0392b" : accent, marginBottom: 6 }}>{pending.title || ("New " + pending.module)}{pending.type === "delete" ? " — tap Delete to remove" : " — confirm to save"}</div>
                  <div style={{ fontSize: 12.5, color: "#33415c", lineHeight: 1.6 }}>
                    {Array.isArray(pending.preview)
                      ? pending.preview.filter(([, v]) => v !== "" && v != null).map(([k, v], j) => (
                          <div key={j} style={{ display: "flex", gap: 8 }}><span style={{ color: "#7a8399", minWidth: 86 }}>{k}</span><b style={{ fontWeight: 600 }}>{String(v)}</b></div>))
                      : prettyFields(pending.fields).map((l, j) => <div key={j}>• {l}</div>)}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button disabled={busy} onClick={confirmEntry} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none", background: pending.type === "delete" ? "#c0392b" : accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{pending.type === "delete" ? "🗑 Delete" : "✓ Confirm & Save"}</button>
                    <button disabled={busy} onClick={() => setPending(null)} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #d4d9e6", background: "#fff", color: "#55607a", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              )}

              {busy && <div style={{ ...bubbleM, color: "#8b93a7" }}>…</div>}
            </div>

            <div style={foot}>
              <button style={iconBtn(listening)} title="Speak" onClick={toggleMic}>{listening ? Icon.stop("#fff") : Icon.mic("#44506a")}</button>
              <button style={iconBtn(voiceOut)} title={voiceOut ? "Voice replies: ON" : "Voice replies: OFF"} onClick={() => { setVoiceOut((v) => !v); stopSpeaking(); }}>{Icon.speaker(voiceOut ? "#fff" : "#44506a")}</button>
              {listening ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", color: accent, fontWeight: 700, fontSize: 13 }}>
                  <Waveform color={accent} /> Listening…
                </div>
              ) : (
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  placeholder="Type a message…" disabled={busy}
                  style={{ flex: 1, border: "1px solid #d9deea", borderRadius: 20, padding: "9px 14px", fontSize: 14, outline: "none" }} />
              )}
              <button style={{ ...iconBtn(true), background: accent }} title="Send" disabled={busy || !input.trim()} onClick={() => send()}>{Icon.send("#fff")}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
