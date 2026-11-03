import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { requirePerm, publicUser } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

const r = Router();

const base = {
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  phone: z.string().trim().max(30).default(''),
  roleId: z.string().uuid('Select a role'),
  status: z.boolean().default(true),
};
const createSchema = z.object({ ...base, password: z.string().min(10, 'Use at least 10 characters').max(200) });
const updateSchema = z.object({
  ...base,
  password: z.string().max(200).optional().or(z.literal('')).refine((v) => !v || v.length >= 10, 'Use at least 10 characters'),
});

const SELECT = `SELECT u.*, r.role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id`;

// Staff users only: the super admin account is not listed or editable here.
r.get('/', requirePerm('users', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const params = [];
  let where = `WHERE u.user_type = 2`;
  if (search) {
    params.push(likeEscape(search));
    where += ` AND (u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.email ILIKE $1 OR u.phone ILIKE $1)`;
  }
  const total = (await query(`SELECT count(*)::int n FROM users u ${where}`, params)).rows[0].n;
  const { rows } = await query(`${SELECT} ${where} ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, { users: rows.map(publicUser), pagination: pagination(total, page, limit) });
}));

async function roleExists(id) {
  return (await query(`SELECT 1 FROM roles WHERE id=$1`, [id])).rowCount > 0;
}

r.post('/', requirePerm('users', 'create'), h(async (req, res) => {
  const b = validate(createSchema, req.body, res);
  if (!b) return;
  if (!(await roleExists(b.roleId))) return fail(res, 422, 'Invalid role', { roleId: 'Role not found' });
  try {
    const { rows } = await query(
      `INSERT INTO users (first_name,last_name,email,phone,password_hash,user_type,role_id,status)
       VALUES ($1,$2,$3,$4,$5,2,$6,$7) RETURNING *`,
      [b.firstName, b.lastName, b.email, b.phone, await bcrypt.hash(b.password, 12), b.roleId, b.status],
    );
    ok(res, publicUser(rows[0]), 'User created', 201);
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Email already in use', { email: 'A user with this email already exists' });
    throw e;
  }
}));

r.put('/:id', requirePerm('users', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'User not found');
  const b = validate(updateSchema, req.body, res);
  if (!b) return;
  if (!(await roleExists(b.roleId))) return fail(res, 422, 'Invalid role', { roleId: 'Role not found' });
  const params = [b.firstName, b.lastName, b.email, b.phone, b.roleId, b.status, req.params.id];
  let pw = '';
  if (b.password) {
    params.push(await bcrypt.hash(b.password, 12));
    pw = `, password_hash = $${params.length}, token_version = token_version + 1`;
  }
  try {
    // A disabled user's existing sessions are also cut off (token_version bump).
    const { rows } = await query(
      `UPDATE users SET first_name=$1,last_name=$2,email=$3,phone=$4,role_id=$5,status=$6,
              token_version = token_version + CASE WHEN status AND NOT $6 THEN 1 ELSE 0 END,
              updated_at=now() ${pw}
        WHERE id=$7 AND user_type = 2 RETURNING *`,
      params,
    );
    if (!rows.length) return fail(res, 404, 'User not found');
    ok(res, publicUser(rows[0]), 'User updated');
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Email already in use', { email: 'A user with this email already exists' });
    throw e;
  }
}));

r.delete('/:id', requirePerm('users', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'User not found');
  if (req.params.id === req.user.id) return fail(res, 422, 'You cannot delete your own account');
  const { rowCount } = await query(`DELETE FROM users WHERE id=$1 AND user_type = 2`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'User not found');
  ok(res, null, 'User deleted');
}));

export default r;
