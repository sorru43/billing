import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

// Matrix items: a parent with one or two attributes (e.g. Flavor x Size). Each
// variant is stored as an ordinary product row (matrix_id, option1, option2), so
// it has its own barcode and stock and sells on invoices like any product.
const r = Router();

const MAX_VALUES = 60;
const MAX_VARIANTS = 600;

const price = (label) =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(1e11);
const optName = z.string().trim().max(40);
const optValue = z.string().trim().min(1, 'Value cannot be empty').max(60);

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  option1: optValue,
  option2: z.string().trim().max(60).default(''),
  barcode: z.string().trim().max(64).regex(/^[A-Za-z0-9\-_.]*$/, 'Barcode may only contain letters, numbers, - _ .').default(''),
  quantity: z.coerce.number().int('Quantity must be a whole number').min(0, 'Quantity cannot be negative').max(1e9),
  cost: price('Cost'),
  selling_price: price('Selling price'),
  top_customer_price: price('Top customer price'),
  jobber_price: price('Jobber price'),
  status: z.boolean().default(true),
});

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150),
    category_id: z.string().uuid('Category is required'),
    description: z.string().max(5000).default(''),
    status: z.boolean().default(true),
    attr1_name: optName.min(1, 'Attribute name is required'),
    attr1_values: z.array(optValue).min(1, 'Add at least one value').max(MAX_VALUES),
    attr2_name: optName.default(''),
    attr2_values: z.array(optValue).max(MAX_VALUES).default([]),
    cost: price('Cost'),
    selling_price: price('Selling price'),
    top_customer_price: price('Top customer price'),
    jobber_price: price('Jobber price'),
    variants: z.array(variantSchema).min(1, 'Add at least one variant').max(MAX_VARIANTS),
  })
  .superRefine((b, ctx) => {
    const dup = (vals) => vals.find((v, i) => vals.findIndex((x) => x.toLowerCase() === v.toLowerCase()) !== i);
    const d1 = dup(b.attr1_values);
    if (d1) ctx.addIssue({ code: 'custom', path: ['attr1_values'], message: `"${d1}" is listed twice` });
    const d2 = dup(b.attr2_values);
    if (d2) ctx.addIssue({ code: 'custom', path: ['attr2_values'], message: `"${d2}" is listed twice` });
    if (b.attr2_name && !b.attr2_values.length) ctx.addIssue({ code: 'custom', path: ['attr2_values'], message: 'Add at least one value' });
    if (!b.attr2_name && b.attr2_values.length) ctx.addIssue({ code: 'custom', path: ['attr2_name'], message: 'Attribute name is required' });
    if (b.attr2_name && b.attr2_name.toLowerCase() === b.attr1_name.toLowerCase())
      ctx.addIssue({ code: 'custom', path: ['attr2_name'], message: 'Use a different name from the first attribute' });

    const v1 = new Set(b.attr1_values.map((v) => v.toLowerCase()));
    const v2 = new Set(b.attr2_values.map((v) => v.toLowerCase()));
    const seen = new Map();
    const barcodes = new Map();
    b.variants.forEach((v, i) => {
      if (!v1.has(v.option1.toLowerCase())) ctx.addIssue({ code: 'custom', path: ['variants', i, 'option1'], message: `"${v.option1}" is not a ${b.attr1_name} value` });
      if (b.attr2_name ? !v2.has(v.option2.toLowerCase()) : v.option2)
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'option2'], message: `"${v.option2}" is not a ${b.attr2_name || 'second attribute'} value` });
      const key = `${v.option1.toLowerCase()}\u0000${v.option2.toLowerCase()}`;
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'option1'], message: 'This combination is listed twice' });
      seen.set(key, i);
      if (v.barcode) {
        const bk = v.barcode.toLowerCase();
        if (barcodes.has(bk)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'barcode'], message: `Same barcode as another variant` });
        barcodes.set(bk, i);
      }
    });
  });

export const variantName = (name, o1, o2) => `${name} - ${o2 ? `${o1} / ${o2}` : o1}`;

const outMatrix = (m) => ({
  id: m.id,
  name: m.name,
  category_id: m.category_id,
  category: m.category_id ? { id: m.category_id, name: m.category_name } : null,
  description: m.description,
  status: m.status,
  attr1_name: m.attr1_name,
  attr1_values: m.attr1_values,
  attr2_name: m.attr2_name,
  attr2_values: m.attr2_values,
  cost: m.cost,
  selling_price: m.selling_price,
  top_customer_price: m.top_customer_price,
  jobber_price: m.jobber_price,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

const outVariant = (p) => ({
  id: p.id,
  name: p.name,
  option1: p.option1,
  option2: p.option2,
  barcode: p.barcode || '',
  quantity: p.quantity,
  cost: p.cost,
  selling_price: p.selling_price,
  top_customer_price: p.top_customer_price,
  jobber_price: p.jobber_price,
  description: p.description,
  status: p.status,
});

async function loadMatrix(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT m.*, c.name AS category_name FROM product_matrices m LEFT JOIN categories c ON c.id = m.category_id WHERE m.id = $1`,
    [id],
  );
  if (!rows.length) return null;
  const { rows: variants } = await db.query(`SELECT * FROM products WHERE matrix_id = $1 ORDER BY created_at, name`, [id]);
  return { ...outMatrix(rows[0]), variants: variants.map(outVariant) };
}

r.get('/', requirePerm('products', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const params = search ? [likeEscape(search)] : [];
  const where = search ? `WHERE m.name ILIKE $1 OR c.name ILIKE $1 OR m.attr1_name ILIKE $1 OR m.attr2_name ILIKE $1` : '';
  const total = (await query(`SELECT count(*)::int n FROM product_matrices m LEFT JOIN categories c ON c.id = m.category_id ${where}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT m.*, c.name AS category_name,
            (SELECT count(*)::int FROM products p WHERE p.matrix_id = m.id) AS variant_count,
            (SELECT coalesce(sum(quantity), 0)::int FROM products p WHERE p.matrix_id = m.id) AS total_qty
       FROM product_matrices m LEFT JOIN categories c ON c.id = m.category_id
       ${where} ORDER BY m.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, {
    matrices: rows.map((m) => ({ ...outMatrix(m), variantCount: m.variant_count, totalQty: m.total_qty })),
    pagination: pagination(total, page, limit),
  });
}));

// Grid for the invoice editor: allowed for anyone who can make invoices.
r.get('/:id/grid', h(async (req, res) => {
  if (!can(req, 'invoices', 'create') && !can(req, 'products', 'view')) return fail(res, 403, 'You do not have permission to do this');
  if (!isUuid(req.params.id)) return fail(res, 404, 'Matrix item not found');
  const m = await loadMatrix(req.params.id);
  if (!m || !m.status) return fail(res, 404, 'Matrix item not found or inactive');
  ok(res, m);
}));

r.get('/:id', requirePerm('products', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Matrix item not found');
  const m = await loadMatrix(req.params.id);
  if (!m) return fail(res, 404, 'Matrix item not found');
  ok(res, m);
}));

function pgError(e, res) {
  if (e.code !== '23505') return false;
  if (e.constraint === 'product_matrices_name_uq') {
    fail(res, 422, 'A matrix item with this name already exists', { name: 'A matrix item with this name already exists' });
    return true;
  }
  const code = /\(barcode\)=\(([^)]*)\)/.exec(e.detail || '')?.[1];
  fail(res, 422, code ? `Barcode ${code} is already used by another product` : 'Barcode already in use', { variants: 'A barcode is already used by another product' });
  return true;
}

// Create or update the matrix row and sync its variants in one transaction.
async function save(client, b, id, isAdmin) {
  const vals = [b.name, b.category_id, b.description, b.status, b.attr1_name, JSON.stringify(b.attr1_values), b.attr2_name,
    JSON.stringify(b.attr2_values), b.cost, b.selling_price, b.top_customer_price, b.jobber_price];
  let matrixId = id;
  if (id) {
    const { rowCount } = await client.query(
      `UPDATE product_matrices SET name=$1, category_id=$2, description=$3, status=$4, attr1_name=$5, attr1_values=$6, attr2_name=$7,
              attr2_values=$8, cost=$9, selling_price=$10, top_customer_price=$11, jobber_price=$12, updated_at=now() WHERE id=$13`,
      [...vals, id],
    );
    if (!rowCount) return { notFound: true };
  } else {
    const { rows } = await client.query(
      `INSERT INTO product_matrices (name, category_id, description, status, attr1_name, attr1_values, attr2_name, attr2_values,
                                     cost, selling_price, top_customer_price, jobber_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      vals,
    );
    matrixId = rows[0].id;
  }

  const { rows: existing } = await client.query(`SELECT id FROM products WHERE matrix_id = $1 FOR UPDATE`, [matrixId]);
  const existingIds = new Set(existing.map((p) => p.id));
  for (const v of b.variants) if (v.id && !existingIds.has(v.id)) return { badVariant: true };

  const keep = new Set(b.variants.filter((v) => v.id).map((v) => v.id));
  const removed = [...existingIds].filter((pid) => !keep.has(pid));
  if (removed.length && !isAdmin.delete) return { forbidden: true };
  if (removed.length) await client.query(`DELETE FROM products WHERE id = ANY($1::uuid[])`, [removed]);
  // Clear barcodes and options first so variants can swap them without tripping the unique indexes.
  await client.query(`UPDATE products SET barcode = NULL, option1 = id::text, option2 = '' WHERE matrix_id = $1`, [matrixId]);

  for (const v of b.variants) {
    const params = [variantName(b.name, v.option1, v.option2), v.cost, v.selling_price, v.top_customer_price, v.jobber_price, v.quantity,
      v.barcode || null, b.description, b.category_id, v.status, matrixId, v.option1, v.option2];
    if (v.id) {
      await client.query(
        `UPDATE products SET name=$1, cost=$2, selling_price=$3, top_customer_price=$4, jobber_price=$5, quantity=$6, barcode=$7,
                description=$8, category_id=$9, status=$10, matrix_id=$11, option1=$12, option2=$13, updated_at=now() WHERE id=$14`,
        [...params, v.id],
      );
    } else {
      await client.query(
        `INSERT INTO products (name, cost, selling_price, top_customer_price, jobber_price, quantity, barcode, description, category_id,
                               status, matrix_id, option1, option2)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        params,
      );
    }
  }
  return { id: matrixId };
}

async function handleSave(req, res, id) {
  const b = validate(schema, req.body, res);
  if (!b) return;
  if (!(await query(`SELECT 1 FROM categories WHERE id=$1`, [b.category_id])).rowCount)
    return fail(res, 422, 'Invalid category', { category_id: 'Category not found' });
  let result;
  try {
    result = await tx(async (client) => {
      const out = await save(client, b, id, { delete: can(req, 'products', 'delete') });
      if (!out.id) throw Object.assign(new Error('abort'), { result: out });
      return out;
    });
  } catch (e) {
    if (e.result) result = e.result;
    else if (pgError(e, res)) return;
    else throw e;
  }
  if (result.notFound) return fail(res, 404, 'Matrix item not found');
  if (result.badVariant) return fail(res, 422, 'A variant does not belong to this matrix item — reload and try again');
  if (result.forbidden) return fail(res, 403, 'Removing variants needs product delete permission');
  ok(res, { id: result.id }, id ? 'Matrix item updated' : 'Matrix item created', id ? 200 : 201);
}

r.post('/', requirePerm('products', 'create'), h((req, res) => handleSave(req, res, null)));

r.put('/:id', requirePerm('products', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Matrix item not found');
  // Adding new variants while editing is creating products.
  if ((req.body?.variants || []).some((v) => !v?.id) && !can(req, 'products', 'create'))
    return fail(res, 403, 'Adding variants needs product create permission');
  return handleSave(req, res, req.params.id);
}));

r.patch('/:id/status', requirePerm('products', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Matrix item not found');
  // Variants keep their own status; a disabled matrix hides all of them from sale (see products search / invoices).
  const { rowCount } = await query(`UPDATE product_matrices SET status=$1, updated_at=now() WHERE id=$2`, [Boolean(req.body?.status), req.params.id]);
  if (!rowCount) return fail(res, 404, 'Matrix item not found');
  ok(res, null, 'Matrix item status updated');
}));

r.delete('/:id', requirePerm('products', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Matrix item not found');
  // Variants go with it (ON DELETE CASCADE); past invoices keep their own line snapshot.
  const { rowCount } = await query(`DELETE FROM product_matrices WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Matrix item not found');
  ok(res, null, 'Matrix item deleted');
}));

export default r;
