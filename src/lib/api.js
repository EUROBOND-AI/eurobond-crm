/* ============ Central API client — talks to Hostinger backend ============ */

export const API_BASE = "https://eurobondsealant.com/crm-api";
if (typeof window !== "undefined") { try { window.__EB_API_BASE__ = API_BASE; } catch {} }

const TOKEN_KEY = "eb_token";
const USER_KEY = "eb_user";

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY) || ""; },
  get user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } },
  set user(u) { try { localStorage.setItem(USER_KEY, JSON.stringify(u || {})); } catch {} },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  get isLoggedIn() { return !!this.token; },
};

async function req(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = "Bearer " + auth.token;
  let payload;
  if (isForm) {
    payload = body; // FormData
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res, data;
  try {
    /* abort after 25s so the UI never hangs forever (e.g. slow SMTP on OTP send) */
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      res = await fetch(API_BASE + path, { method, headers, body: payload, signal: ctrl.signal });
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Server is taking too long. Please try again.");
    throw new Error("Network error — check internet or try again");
  }
  if (!res.ok) {
    /* Only force-logout when the auth check itself fails (auth.php?action=me),
       not on transient 401s from background/data requests — those shouldn't log the user out. */
    if (res.status === 401 && /auth\.php\?action=me/.test(path)) { auth.clear(); }
    throw new Error(data?.error || "Request failed");
  }
  return data;
}

/* ---------- Auth ---------- */
export const api = {
  async login(username, password) {
    const d = await req("/auth.php?action=login", { method: "POST", body: { username, password } });
    auth.set(d.token, d.user);
    return d.user;
  },
  async adminLogin(username, password) {
    const d = await req("/auth.php?action=admin_login", { method: "POST", body: { username, password } });
    auth.set(d.token, d.user);
    return d.user;
  },
  async adminMe() { return (await req("/auth.php?action=admin_me")).user; },
  async sendOtp(username) {
    return req("/auth.php?action=send_otp", { method: "POST", body: { username } });
  },
  async verifyOtp(username, otp) {
    const d = await req("/auth.php?action=verify_otp", { method: "POST", body: { username, otp } });
    auth.set(d.token, d.user);
    return d.user;
  },
  async me() { return (await req("/auth.php?action=me")).user; },
  async changePassword(old_password, new_password) {
    return req("/auth.php?action=change_pass", { method: "POST", body: { old_password, new_password } });
  },
  logout() { auth.clear(); },

  /* ---------- Users ---------- */
  listUsers: () => req("/users.php"),
  createUser: (u) => req("/users.php", { method: "POST", body: u }),
  updateUser: (id, u) => req("/users.php?id=" + id + "&action=update", { method: "POST", body: u }),
  deleteUser: (id) => req("/users.php?id=" + id + "&action=delete", { method: "POST" }),
  deleteUserHard: (id) => req("/users.php?id=" + id + "&hard=1&action=delete", { method: "POST" }),
  setUserStatus: (id, status) => req("/users.php?id=" + id + "&action=update", { method: "POST", body: { status } }),
  resetUserPass: (id, new_password) => req("/users.php?action=reset_pass", { method: "POST", body: { id, new_password } }),

  /* ---------- Generic records (all modules) ---------- */
  list: (module, mine = false) => req(`/records.php?module=${module}${mine ? "&mine=1" : ""}`),
  get: (module, id) => req(`/records.php?module=${module}&id=${id}`),
  create: (module, data) => req(`/records.php?module=${module}`, { method: "POST", body: { data } }),
  update: (module, id, data) => req(`/records.php?module=${module}&id=${id}&action=update`, { method: "POST", body: { data } }),
  remove: (module, id) => req(`/records.php?module=${module}&id=${id}&action=delete`, { method: "POST" }),

  /* ---------- Attendance ---------- */
  attStart: (visit) => req("/attendance.php?action=start", { method: "POST", body: visit || {} }),
  /* GPS points upload via NATIVE HTTP (CapacitorHttp) so it works even when the app is
     backgrounded — WebView fetch() gets throttled/suspended after ~5 min in the background. */
  attPoints: async (session_id, points) => {
    const url = API_BASE + "/attendance.php?action=points";
    const token = auth.token;
    const Cap = typeof window !== "undefined" ? window.Capacitor : null;
    const Http = Cap && Cap.Plugins && Cap.Plugins.CapacitorHttp;
    if (Http && Cap.isNativePlatform && Cap.isNativePlatform()) {
      try {
        return await Http.post({
          url,
          headers: { "Content-Type": "application/json", Authorization: token ? "Bearer " + token : "" },
          data: { session_id, points },
        });
      } catch (e) { /* fall through to fetch */ }
    }
    return req("/attendance.php?action=points", { method: "POST", body: { session_id, points } });
  },
  attPointsList: (session_id) => req("/attendance.php?action=pointsList&session_id=" + session_id),
  attStop: (session_id, extra) => req("/attendance.php?action=stop", { method: "POST", body: { session_id, ...(extra || {}) } }),
  attToday: () => req("/attendance.php?action=today"),
  attList: (from, to) => req(`/attendance.php?action=list&from=${from}&to=${to || from}`),
  areaStates: () => req("/areas.php?action=states"),
  areaCount: () => req("/areas.php?action=count"),
  areaDelete: (state, name) => req("/areas.php?action=delete", { method: "POST", body: { state, name } }),
  areaDeleteState: (state) => req("/areas.php?action=deleteState", { method: "POST", body: { state } }),
  areasByState: (state) => req("/areas.php?action=byState&state=" + encodeURIComponent(state)),
  areaSearch: (state, q) => req("/areas.php?action=search&state=" + encodeURIComponent(state || "") + "&q=" + encodeURIComponent(q)),
  areaAdd: (state, name) => req("/areas.php?action=add", { method: "POST", body: { state, name } }),
  areaImport: (rows) => req("/areas.php?action=import", { method: "POST", body: { rows } }),
  attMine: (from, to) => req("/attendance.php?action=mine&from=" + from + "&to=" + to),
  attUpdateVisit: (session_id, type, name) => req("/attendance.php?action=updateVisit", { method: "POST", body: { session_id, type, name } }),
  attMarkAbsent: (session_id, remark) => req("/attendance.php?action=markAbsent", { method: "POST", body: { session_id, remark } }),
  attUnmarkAbsent: (session_id) => req("/attendance.php?action=unmarkAbsent", { method: "POST", body: { session_id } }),
  attTrack: (session_id) => req("/attendance.php?action=track&session_id=" + session_id),
  attGeocode: (session_id) => req("/attendance.php?action=geocode&session_id=" + session_id),
  settingsList: () => req("/settings.php?action=list"),
  settingsSave: (key, value, label) => req("/settings.php?action=save", { method: "POST", body: { key, value, label } }),

  /* ---------- Locations (India villages/cities strict search) ---------- */
  locationSearch: (q) => req("/locations.php?action=search&q=" + encodeURIComponent(q)),

  /* ---------- Customers (from follow-ups) ---------- */
  sendMail: (payload) => req("/mail.php", { method: "POST", body: payload }),
  productNames: () => req("/products.php?action=names"),
  productsByName: (name) => req("/products.php?action=byName&name=" + encodeURIComponent(name)),
  productSearch: (q) => req("/products.php?action=search&q=" + encodeURIComponent(q)),
  productsAll: () => req("/products.php?action=all"),
  productsCount: () => req("/products.php?action=count"),
  indiamartSync: () => req("/indiamart.php?action=sync"),
  holidaysAll: (state) => req("/holidays.php?action=all" + (state ? "&state=" + encodeURIComponent(state) : "")),
  holidaysStates: () => req("/holidays.php?action=states"),
  holidaysImport: (rows, mode) => req("/holidays.php?action=import", { method: "POST", body: { rows, mode: mode || "replace" } }),
  holidayAdd: (row) => req("/holidays.php?action=addRow", { method: "POST", body: row }),
  holidayRowDelete: (index) => req("/holidays.php?action=deleteRow", { method: "POST", body: { index } }),
  holidayRemind: () => req("/holidays.php?action=remind"),
  productAdd: (row) => req("/products.php?action=addRow", { method: "POST", body: row }),
  productDelete: (name) => req("/products.php?action=deleteProduct", { method: "POST", body: { name } }),
  productRowDelete: (name, code, colour) => req("/products.php?action=deleteRow", { method: "POST", body: { name, code, colour } }),
  productsImport: (rows) => req("/products.php?action=import", { method: "POST", body: { rows } }),
  leaveReminders: () => req("/leave_reminder.php"),
  forwardCustomers: (mobiles, names, toUserId) => req("/customers.php?action=forward", { method: "POST", body: { mobiles, names, toUserId } }),
  deleteCustomer: (mobile, name) => req("/customers.php?action=delete", { method: "POST", body: { mobile, name } }),
  customers: (q = "", mine = false) => req(`/customers.php?action=list${q ? "&q=" + encodeURIComponent(q) : ""}${mine ? "&mine=1" : ""}`),

  /* ---------- Notifications ---------- */
  notify: (data) => req("/records.php?module=notification", { method: "POST", body: { data } }),
  myNotifications: () => req("/records.php?module=notification"),

  /* ---------- Photo upload (auto-compressed: disk/inode save on Hostinger) ---------- */
  async uploadCompressed(file, module = "general", record_id = 0) {
    const small = await compressImage(file).catch(() => file);
    return api.uploadPhoto(small, module, record_id);
  },

  async uploadPhoto(file, module = "general", record_id = 0) {
    const fd = new FormData();
    fd.append("photo", file);
    fd.append("module", module);
    fd.append("record_id", record_id);
    return req("/upload.php", { method: "POST", body: fd, isForm: true });
  },
};


/* Resize + JPEG-compress a photo in the browser before upload.
   2-4 MB camera photo -> ~150-300 KB. Hostinger disk + inode limit safe. */
export function compressImage(file, maxSide = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const k = maxSide / Math.max(width, height);
        width = Math.round(width * k); height = Math.round(height * k);
      }
      const c = document.createElement("canvas");
      c.width = width; c.height = height;
      c.getContext("2d").drawImage(img, 0, 0, width, height);
      c.toBlob((blob) => {
        if (!blob) return resolve(file);
        resolve(new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
