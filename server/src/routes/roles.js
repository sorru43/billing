import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { MODULE_GROUPS, MODULE_SLUGS } from '../modules.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

const r = Router();
const schema = z.object({
  roleName: z.string().trim().min(1, 'Role name is required').max(100),
  status: z.boolean().default(true),
});
const out = (x) => ({ id: x.id, roleName: x.role_name, status: x.status, userCount: x.user_count ?? 0, createdAt: x.created_at });

r.get('/', requirePerm('roles', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE role_name ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM roles ${where}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id = r.id)::int AS user_count
       FROM roles r ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, { roles: rows.map(out), pagination: pagination(total, page, limit) });
}));

// For the "Role" dropdown on the Users screen.
r.get('/options', h(async (req, res) => {
  if (!can(req, 'users', 'view') && !can(req, 'roles', 'view')) return fail(res, 403, 'You do not have permission to do this');
  const { rows } = await query(`SELECT id, role_name FROM roles WHERE status = true ORDER BY role_name`);
  ok(res, rows.map((x) => ({ id: x.id, roleName: x.role_name })));
}));

r.get('/modules', requirePerm('roles', 'view'), (req, res) => ok(res, MODULE_GROUPS));

r.get('/:id/permissions', requirePerm('roles', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Role not found');
  const role = (await query(`SELECT * FROM roles WHERE id=$1`, [req.params.id])).rows[0];
  if (!role) return fail(res, 404, 'Role not found');
  const { rows } = await query(`SELECT * FROM role_permissions WHERE role_id=$1`, [req.params.id]);
  const permissions = {};
  for (const p of rows) permissions[p.module_slug] = { view: p.can_view, create: p.can_create, edit: p.can_edit, delete: p.can_delete };
  ok(res, { role: out(role), modules: MODULE_GROUPS, permissions });
}));

const permSchema = z.record(
  z.string(),
  z.object({ view: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean() }),
);

r.put('/:id/permissions', requirePerm('roles', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Role not found');
  const perms = validate(permSchema, req.body?.permissions, res);
  if (!perms) return;
  const role = (await query(`SELECT 1 FROM roles WHERE id=$1`, [req.params.id])).rows[0];
  if (!role) return fail(res, 404, 'Role not found');
  await tx(async (c) => {
    await c.query(`DELETE FROM role_permissions WHERE role_id=$1`, [req.params.id]);
    for (const [slug, p] of Object.entries(perms)) {
      if (!MODULE_SLUGS.includes(slug)) continue; // ignore unknown modules
      // Any create/edit/delete right implies being able to see the module.
      const view = p.view || p.create || p.edit || p.delete;
      if (!view) continue;
      await c.query(
        `INSERT INTO role_permissions (role_id, module_slug, can_view, can_create, can_edit, can_delete) VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, slug, view, p.create, p.edit, p.delete],
      );
    }
  });
  ok(res, null, 'Permissions saved successfully.');
}));

r.post('/', requirePerm('roles', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  try {
    const { rows } = await query(`INSERT INTO roles (role_name, status) VALUES ($1,$2) RETURNING *`, [b.roleName, b.status]);
    ok(res, out(rows[0]), 'Role created', 201);
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Role already exists', { roleName: 'A role with this name already exists' });
    throw e;
  }
}));

r.put('/:id', requirePerm('roles', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Role not found');
  const b = validate(schema, req.body, res);
  if (!b) return;
  try {
    const { rows } = await query(`UPDATE roles SET role_name=$1, status=$2 WHERE id=$3 RETURNING *`, [b.roleName, b.status, req.params.id]);
    if (!rows.length) return fail(res, 404, 'Role not found');
    ok(res, out(rows[0]), 'Role updated');
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Role already exists', { roleName: 'A role with this name already exists' });
    throw e;
  }
}));

r.delete('/:id', requirePerm('roles', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Role not found');
  const inUse = (await query(`SELECT count(*)::int n FROM users WHERE role_id=$1`, [req.params.id])).rows[0].n;
  if (inUse) return fail(res, 409, `This role is assigned to ${inUse} user(s). Reassign them first.`);
  const { rowCount } = await query(`DELETE FROM roles WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Role not found');
  ok(res, null, 'Role deleted');
}));

export default r;
