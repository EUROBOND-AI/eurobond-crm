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
    return rows.filter((r) => { const o = ownerOf(r); return !o || team.has(o); });
  }

  if (/^SUB HOD /.test(role)) {
    const team = new Set(all.filter((x) => x.manager === me).map((x) => x.name));
    team.add(me);
    return rows.filter((r) => { const o = ownerOf(r); return !o || team.has(o); });
  }

  /* Everyone else → only their own records */
  return rows.filter((r) => { const o = ownerOf(r); return !o || o === me; });
}
