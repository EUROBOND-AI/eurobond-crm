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
  deleteUserHard: (id) => req("/users.php?id=" + id + "&hard=1", { method: "DELETE" }),
  setUserStatus: (id, status) => req("/users.php?id=" + id, { method: "PUT", body: { status } }),
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
  attStop: (session_id, extra) => req("/attendance.php?action=stop", { method: "POST", body: { session_id, ...(extra || {}) } }),
  attToday: () => req("/attendance.php?action=today"),
  attList: (from, to) => req(`/attendance.php?action=list&from=${from}&to=${to || from}`),
  attTrack: (session_id) => req("/attendance.php?action=track&session_id=" + session_id),

  /* ---------- Locations (India villages/cities strict search) ---------- */
  locationSearch: (q) => req("/locations.php?action=search&q=" + encodeURIComponent(q)),

  /* ---------- Customers (from follow-ups) ---------- */
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
