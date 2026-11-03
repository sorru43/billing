import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

const r = Router();

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';

const schema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  status: z.boolean().default(true),
});

const out = (c) => ({ id: c.id, name: c.name, slug: c.slug, status: c.status, productCount: c.product_count ?? 0, createdAt: c.created_at });

r.get('/', requirePerm('categories', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE c.name ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM categories c ${where}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*) FROM products p WHERE p.category_id = c.id)::int AS product_count
       FROM categories c ${where} ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, { categories: rows.map(out), pagination: pagination(total, page, limit) });
}));

// Minimal list for dropdowns: anyone who can work with products may read it.
r.get('/options', h(async (req, res) => {
  if (!can(req, 'products', 'view') && !can(req, 'categories', 'view') && !can(req, 'reports', 'view')) {
    return fail(res, 403, 'You do not have permission to do this');
  }
  const { rows } = await query(`SELECT id, name FROM categories WHERE status = true ORDER BY name`);
  ok(res, rows);
}));

async function uniqueSlug(name, excludeId) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const { rows } = await query(`SELECT 1 FROM categories WHERE slug = $1 AND id IS DISTINCT FROM $2`, [slug, excludeId || null]);
    if (!rows.length) return slug;
    slug = `${base}-${i}`;
  }
}

r.post('/', requirePerm('categories', 'create'), h(async (req, res) => {
  const body = validate(schema, req.body, res);
  if (!body) return;
  try {
    const { rows } = await query(
      `INSERT INTO categories (name, slug, status) VALUES ($1,$2,$3) RETURNING *`,
      [body.name, await uniqueSlug(body.name), body.status],
    );
    ok(res, out(rows[0]), 'Category created', 201);
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Category already exists', { name: 'A category with this name already exists' });
    throw e;
  }
}));

r.put('/:id', requirePerm('categories', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Category not found');
  const body = validate(schema, req.body, res);
  if (!body) return;
  try {
    const { rows } = await query(
      `UPDATE categories SET name=$1, slug=$2, status=$3 WHERE id=$4 RETURNING *`,
      [body.name, await uniqueSlug(body.name, req.params.id), body.status, req.params.id],
    );
    if (!rows.length) return fail(res, 404, 'Category not found');
    ok(res, out(rows[0]), 'Category updated');
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Category already exists', { name: 'A category with this name already exists' });
    throw e;
  }
}));

r.delete('/:id', requirePerm('categories', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Category not found');
  const { rowCount } = await query(`DELETE FROM categories WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Category not found');
  ok(res, null, 'Category deleted');
}));

export default r;
