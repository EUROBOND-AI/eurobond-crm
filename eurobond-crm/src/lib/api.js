/* ============ Central API client — talks to Hostinger backend ============ */

export const API_BASE = "https://eurobondsealant.com/crm-api";

const TOKEN_KEY = "eb_token";
const USER_KEY = "eb_user";

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY) || ""; },
  get user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } },
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
    res = await fetch(API_BASE + path, { method, headers, body: payload });
    data = await res.json();
  } catch (e) {
    throw new Error("Network error — check internet or try again");
  }
  if (!res.ok) {
    if (res.status === 401) { auth.clear(); }
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
  async me() { return (await req("/auth.php?action=me")).user; },
  async changePassword(old_password, new_password) {
    return req("/auth.php?action=change_pass", { method: "POST", body: { old_password, new_password } });
  },
  logout() { auth.clear(); },

  /* ---------- Users ---------- */
  listUsers: () => req("/users.php"),
  createUser: (u) => req("/users.php", { method: "POST", body: u }),
  updateUser: (id, u) => req("/users.php?id=" + id, { method: "PUT", body: u }),
  deleteUser: (id) => req("/users.php?id=" + id, { method: "DELETE" }),
  resetUserPass: (id, new_password) => req("/users.php?action=reset_pass", { method: "POST", body: { id, new_password } }),

  /* ---------- Generic records (all modules) ---------- */
  list: (module, mine = false) => req(`/records.php?module=${module}${mine ? "&mine=1" : ""}`),
  get: (module, id) => req(`/records.php?module=${module}&id=${id}`),
  create: (module, data) => req(`/records.php?module=${module}`, { method: "POST", body: { data } }),
  update: (module, id, data) => req(`/records.php?module=${module}&id=${id}`, { method: "PUT", body: { data } }),
  remove: (module, id) => req(`/records.php?module=${module}&id=${id}`, { method: "DELETE" }),

  /* ---------- Attendance ---------- */
  attStart: (visit) => req("/attendance.php?action=start", { method: "POST", body: visit || {} }),
  attPoints: (session_id, points) => req("/attendance.php?action=points", { method: "POST", body: { session_id, points } }),
  attStop: (session_id) => req("/attendance.php?action=stop", { method: "POST", body: { session_id } }),
  attToday: () => req("/attendance.php?action=today"),
  attList: (from, to) => req(`/attendance.php?action=list&from=${from}&to=${to || from}`),
  attTrack: (session_id) => req("/attendance.php?action=track&session_id=" + session_id),

  /* ---------- Notifications ---------- */
  notify: (data) => req("/records.php?module=notification", { method: "POST", body: { data } }),
  myNotifications: () => req("/records.php?module=notification"),

  /* ---------- Photo upload ---------- */
  async uploadPhoto(file, module = "general", record_id = 0) {
    const fd = new FormData();
    fd.append("photo", file);
    fd.append("module", module);
    fd.append("record_id", record_id);
    return req("/upload.php", { method: "POST", body: fd, isForm: true });
  },
};
