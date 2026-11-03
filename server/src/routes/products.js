import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

const r = Router();

const price = (label) =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(1e11);

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  cost: price('Cost'),
  selling_price: price('Selling price'),
  top_customer_price: price('Top customer price'),
  jobber_price: price('Jobber price'),
  quantity: z.coerce.number().int('Quantity must be a whole number').min(0, 'Quantity cannot be negative').max(1e9),
  barcode: z.string().trim().max(64).regex(/^[A-Za-z0-9\-_.]*$/, 'Barcode may only contain letters, numbers, - _ .').default(''),
  description: z.string().max(5000).default(''),
  category_id: z.string().uuid('Category is required'),
  status: z.boolean().default(true),
});

const SELECT = `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

const out = (p) => ({
  id: p.id,
  name: p.name,
  cost: p.cost,
  selling_price: p.selling_price,
  top_customer_price: p.top_customer_price,
  jobber_price: p.jobber_price,
  quantity: p.quantity,
  barcode: p.barcode || '',
  description: p.description,
  category_id: p.category_id,
  category: p.category_id ? { id: p.category_id, name: p.category_name } : null,
  status: p.status,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

r.get('/', requirePerm('products', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const conds = [];
  const params = [];
  if (search) {
    params.push(likeEscape(search));
    conds.push(`(p.name ILIKE $1 OR p.barcode ILIKE $1 OR c.name ILIKE $1)`);
  }
  if (req.query.category && isUuid(req.query.category)) {
    params.push(req.query.category);
    conds.push(`p.category_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (await query(`SELECT count(*)::int n FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where}`, params)).rows[0].n;
  const { rows } = await query(`${SELECT} ${where} ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, { products: rows.map(out), pagination: pagination(total, page, limit) });
}));

// Product picker for the invoice editor: active products matching name or barcode.
r.get('/search', h(async (req, res) => {
  if (!can(req, 'invoices', 'create') && !can(req, 'products', 'view')) return fail(res, 403, 'You do not have permission to do this');
  const q = String(req.query.q || '').trim().slice(0, 100);
  const { rows } = await query(
    `${SELECT} WHERE p.status = true AND ($1 = '' OR p.name ILIKE $2 OR p.barcode = $1)
      ORDER BY (p.barcode = $1) DESC, p.name LIMIT 15`,
    [q, likeEscape(q)],
  );
  ok(res, rows.map(out));
}));

r.get('/:id', requirePerm('products', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Product not found');
  const { rows } = await query(`${SELECT} WHERE p.id = $1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Product not found');
  ok(res, out(rows[0]));
}));

async function categoryExists(id) {
  return (await query(`SELECT 1 FROM categories WHERE id=$1`, [id])).rowCount > 0;
}

function dupError(e, res) {
  if (e.code === '23505') {
    fail(res, 422, 'Barcode already in use', { barcode: 'Another product already has this barcode' });
    return true;
  }
  return false;
}

r.post('/', requirePerm('products', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  if (!(await categoryExists(b.category_id))) return fail(res, 422, 'Invalid category', { category_id: 'Category not found' });
  try {
    const { rows } = await query(
      `INSERT INTO products (name,cost,selling_price,top_customer_price,jobber_price,quantity,barcode,description,category_id,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [b.name, b.cost, b.selling_price, b.top_customer_price, b.jobber_price, b.quantity, b.barcode || null, b.description, b.category_id, b.status],
    );
    ok(res, { id: rows[0].id }, 'Product created', 201);
  } catch (e) {
    if (!dupError(e, res)) throw e;
  }
}));

r.put('/:id', requirePerm('products', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Product not found');
  const b = validate(schema, req.body, res);
  if (!b) return;
  if (!(await categoryExists(b.category_id))) return fail(res, 422, 'Invalid category', { category_id: 'Category not found' });
  try {
    const { rowCount } = await query(
      `UPDATE products SET name=$1,cost=$2,selling_price=$3,top_customer_price=$4,jobber_price=$5,quantity=$6,barcode=$7,
              description=$8,category_id=$9,status=$10,updated_at=now() WHERE id=$11`,
      [b.name, b.cost, b.selling_price, b.top_customer_price, b.jobber_price, b.quantity, b.barcode || null, b.description, b.category_id, b.status, req.params.id],
    );
    if (!rowCount) return fail(res, 404, 'Product not found');
    ok(res, null, 'Product updated');
  } catch (e) {
    if (!dupError(e, res)) throw e;
  }
}));

r.patch('/:id/status', requirePerm('products', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Product not found');
  const { rowCount } = await query(`UPDATE products SET status=$1, updated_at=now() WHERE id=$2`, [Boolean(req.body?.status), req.params.id]);
  if (!rowCount) return fail(res, 404, 'Product not found');
  ok(res, null, 'Product status updated');
}));

r.delete('/:id', requirePerm('products', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Product not found');
  const { rowCount } = await query(`DELETE FROM products WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Product not found');
  ok(res, null, 'Product deleted');
}));

export default r;
