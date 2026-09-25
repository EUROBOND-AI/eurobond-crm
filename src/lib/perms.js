/* Role permissions.
   The Roles & Permission screen stores a grid of module -> { Add, Approve,
   Delete, Export, Import, Modify, View } per role. Until now that grid was only
   saved, never applied, so a "View only" role could still add and delete.
   This module loads the grid once per session and answers the question
   "may this login do X on module Y?". */
import { api, auth } from "./api.js";

let GRID = null;          // { moduleName: { Add: true, ... } }
let loading = null;

const norm = (s) => String(s || "").trim().toLowerCase();

export async function loadPerms() {
  if (GRID) return GRID;
  if (loading) return loading;
  loading = (async () => {
    const role = norm(auth.user?.role);
    /* an Admin is never restricted */
    if (!role || role === "admin" || role === "system") { GRID = "ALL"; return GRID; }
    try {
      const d = await api.list("roles", false);
      /* role names are typed in two places ("HOD (Sales)" vs "hod (sales)"),
         so match on the plain letters rather than the exact string */
      const plain = (x) => norm(x).replace(/[^a-z0-9]/g, "");
      const rec = (d.records || []).map((r) => r.data)
        .find((r) => plain(r.name) === plain(role));
      GRID = rec && rec.grid ? rec.grid : "ALL";   // no row for this role -> don't block
    } catch {
      GRID = "ALL";
    }
    return GRID;
  })();
  return loading;
}

/* call once at login/logout so the next user does not inherit this grid */
export function resetPerms() { GRID = null; loading = null; }

/* can("Customers", "Delete") */
export function can(module, action) {
  if (GRID === null) return true;      // not loaded yet — don't block the first paint
  if (GRID === "ALL") return true;
  const key = Object.keys(GRID).find((k) => norm(k) === norm(module));
  if (!key) return true;               // module not listed -> not restricted
  const row = GRID[key] || {};
  if (row[action] === undefined) return true;
  return !!row[action];
}

export const canView = (m) => can(m, "View");
export const canAdd = (m) => can(m, "Add");
export const canModify = (m) => can(m, "Modify");
export const canDelete = (m) => can(m, "Delete");
export const canApprove = (m) => can(m, "Approve");
export const canExport = (m) => can(m, "Export");
export const canImport = (m) => can(m, "Import");
