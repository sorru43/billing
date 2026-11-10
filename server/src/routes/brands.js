import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

// Brands = the company that makes a product. Uses the `categories` permission
// (same people who organise the catalogue), so no role loses or gains access.
const r = Router();

const schema = z.object({
  name: z.string().trim().min(1, 'Brand name is required').max(100),
  status: z.boolean().default(true),
});

const out = (b) => ({ id: b.id, name: b.name, status: b.status, productCount: b.product_count ?? 0, createdAt: b.created_at });

r.get('/', requirePerm('categories', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE b.name ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM brands b ${where}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT b.*, (SELECT count(*) FROM products p WHERE p.brand_id = b.id)::int AS product_count
       FROM brands b ${where} ORDER BY lower(b.name) LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, { brands: rows.map(out), pagination: pagination(total, page, limit) });
}));

// Minimal list for dropdowns and filters.
r.get('/options', h(async (req, res) => {
  if (!['products', 'categories', 'reports', 'receiving'].some((s) => can(req, s, 'view'))) {
    return fail(res, 403, 'You do not have permission to do this');
  }
  const { rows } = await query(`SELECT id, name FROM brands WHERE status = true ORDER BY lower(name)`);
  ok(res, rows);
}));

const dup = (e, res) => {
  if (e.code !== '23505') return false;
  fail(res, 422, 'Brand already exists', { name: 'A brand with this name already exists' });
  return true;
};

r.post('/', requirePerm('categories', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  try {
    const { rows } = await query(`INSERT INTO brands (name, status) VALUES ($1,$2) RETURNING *`, [b.name, b.status]);
    ok(res, out(rows[0]), 'Brand created', 201);
  } catch (e) {
    if (!dup(e, res)) throw e;
  }
}));

r.put('/:id', requirePerm('categories', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Brand not found');
  const b = validate(schema, req.body, res);
  if (!b) return;
  try {
    const { rows } = await query(`UPDATE brands SET name=$1, status=$2 WHERE id=$3 RETURNING *`, [b.name, b.status, req.params.id]);
    if (!rows.length) return fail(res, 404, 'Brand not found');
    ok(res, out(rows[0]), 'Brand updated');
  } catch (e) {
    if (!dup(e, res)) throw e;
  }
}));

r.delete('/:id', requirePerm('categories', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Brand not found');
  const { rowCount } = await query(
    `DELETE FROM brands b WHERE b.id=$1 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id)
                                     AND NOT EXISTS (SELECT 1 FROM product_matrices m WHERE m.brand_id = b.id)`,
    [req.params.id],
  );
  if (!rowCount) {
    const { rows } = await query(`SELECT (SELECT count(*)::int FROM products WHERE brand_id=$1) AS n, EXISTS (SELECT 1 FROM brands WHERE id=$1) AS found`, [req.params.id]);
    if (!rows[0].found) return fail(res, 404, 'Brand not found');
    return fail(res, 409, `This brand has ${rows[0].n} product(s). Change their brand first.`);
  }
  ok(res, null, 'Brand deleted');
}));

export default r;
