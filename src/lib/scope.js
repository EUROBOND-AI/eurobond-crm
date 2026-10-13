import { auth } from "./api.js";

/* Role-based visibility for admin panel data.
   - Admin / System  → see everything
   - HOD             → see own + their team's records (incl. their Sub HODs' teams)
   - Sub HOD         → see own + directly-assigned team's records
   - Others (Sales/Specs Person, Sales Collection) → see only their own records
   `users` is the full user list (for resolving team membership).
   A record "belongs to" whoever is in its createdBy / by / user / createdById field. */
export function scopeRows(rows, users, ownerFields) {
  const u = auth.user || {};
  const role = String(u.role || "").toUpperCase();
  /* Admin & System always see all */
  if (role === "ADMIN" || role === "SYSTEM") return rows;

  const me = u.name;
  const all = users || [];

  const fields = ownerFields || ["createdBy", "by", "user", "createdByName", "salesPerson", "person"];
  const ownerOf = (r) => { for (const f of fields) { if (r[f]) return r[f]; } return ""; };

  if (/^HOD /.test(role)) {
    /* HOD → direct reports + reports under their Sub HODs */
    const subHods = all.filter((x) => x.manager === me && /^sub hod/i.test(x.role || "")).map((x) => x.name);
    const team = new Set(all.filter((x) => x.manager === me || subHods.includes(x.manager)).map((x) => x.name));
    team.add(me);
    return rows.filter((r) => team.has(ownerOf(r)));
  }

  if (/^SUB HOD /.test(role)) {
    const team = new Set(all.filter((x) => x.manager === me).map((x) => x.name));
    team.add(me);
    return rows.filter((r) => team.has(ownerOf(r)));
  }

  /* Everyone else → only their own records */
  return rows.filter((r) => ownerOf(r) === me);
}

/* The people this login is allowed to see — used by pages that list users
   (attendance, sheets, dashboards) rather than records. */
export function visibleUsers(users) {
  const u = auth.user || {};
  const role = String(u.role || "").toUpperCase();
  const all = users || [];
  if (role === "ADMIN" || role === "SYSTEM") return all;
  const me = u.name;
  if (/^HOD /.test(role)) {
    const subHods = all.filter((x) => x.manager === me && /^sub hod/i.test(x.role || "")).map((x) => x.name);
    return all.filter((x) => x.name === me || x.manager === me || subHods.includes(x.manager));
  }
  if (/^SUB HOD /.test(role)) {
    return all.filter((x) => x.name === me || x.manager === me);
  }
  return all.filter((x) => x.name === me);
}

/* Is this login one of the office backend team, or a field manager who has
   been given the panel as well?

   The two are not the same thing and several screens treated them as one. A
   HOD signs in through Individual to read their team's numbers; they are not
   the person who approves an expense, clears a Biltrax draft or hands out a
   target. Those controls, and the tabs behind them, belong to Admin and
   System alone — the permission grid is for narrowing further, not for
   deciding this, because a grid that has never been filled in allows
   everything. */
export function isPanelAdmin() {
  const u = auth.user || {};
  if (u.bootstrap || u.owner) return true;
  const role = String(u.role || "").trim().toUpperCase();
  return role === "ADMIN" || role === "SYSTEM";
}

/* The names this login may see, as a lower-cased Set — for the screens that
   filter by a person's name rather than by a record's owner field. */
export function visibleNameSet(users) {
  return new Set(
    visibleUsers(users)
      .map((x) => String(x.name || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

/* Quick check for a single person's name */
export function canSeeUser(users, name) {
  if (!name) return false;
  return visibleUsers(users).some((x) => x.name === name);
}
