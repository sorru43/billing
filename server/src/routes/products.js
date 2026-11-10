import express, { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';
import { toCsv } from '../pdf.js';
import { ALERT_SQL, DEFAULT_ALERT } from '../stock.js';
import { parseCsv } from './customers.js';

const r = Router();

const price = (label) =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(1e11);

const alertLevel = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number().int('Alert level must be a whole number').min(0, 'Alert level cannot be negative').max(1e9).nullable(),
).default(null);

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  cost: price('Cost'),
  selling_price: price('Selling price'),
  top_customer_price: price('Top customer price'),
  jobber_price: price('Jobber price'),
  // may be below zero when out-of-stock selling is on (sold before the stock was received)
  quantity: z.coerce.number().int('Quantity must be a whole number').min(-1e9).max(1e9),
  barcode: z.string().trim().max(64).regex(/^[A-Za-z0-9\-_.]*$/, 'Barcode may only contain letters, numbers, - _ .').default(''),
  description: z.string().max(5000).default(''),
  category_id: z.string().uuid('Category is required'),
  // optional: blank = no brand
  brand_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().uuid('Choose a brand').nullable()).default(null),
  status: z.boolean().default(true),
  // blank = use the default alert level
  low_stock_alert: alertLevel,
});

const SELECT = `SELECT p.*, c.name AS category_name, b.name AS brand_name, m.name AS matrix_name, m.status AS matrix_status
  FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN product_matrices m ON m.id = p.matrix_id`;

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
  brand_id: p.brand_id,
  brand: p.brand_id ? { id: p.brand_id, name: p.brand_name } : null,
  status: p.status,
  low_stock_alert: p.low_stock_alert,
  alertLevel: p.low_stock_alert ?? DEFAULT_ALERT,
  matrix: p.matrix_id ? { id: p.matrix_id, name: p.matrix_name, option1: p.option1, option2: p.option2 } : null,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

r.get('/', requirePerm('products', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const conds = [];
  const params = [];
  if (search) {
    params.push(likeEscape(search));
    conds.push(`(p.name ILIKE $1 OR p.barcode ILIKE $1 OR c.name ILIKE $1 OR b.name ILIKE $1)`);
  }
  if (req.query.category && isUuid(req.query.category)) {
    params.push(req.query.category);
    conds.push(`p.category_id = $${params.length}`);
  }
  if (req.query.brand && isUuid(req.query.brand)) {
    params.push(req.query.brand);
    conds.push(`p.brand_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (await query(`SELECT count(*)::int n FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id ${where}`, params)).rows[0].n;
  const { rows } = await query(`${SELECT} ${where} ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, { products: rows.map(out), pagination: pagination(total, page, limit) });
}));

// Product picker for the invoice editor: active products matching name or barcode.
r.get('/search', h(async (req, res) => {
  if (!can(req, 'invoices', 'create') && !can(req, 'products', 'view') && !can(req, 'receiving', 'create')) return fail(res, 403, 'You do not have permission to do this');
  const q = String(req.query.q || '').trim().slice(0, 100);
  const { rows } = await query(
    `${SELECT} WHERE p.status = true AND (p.matrix_id IS NULL OR m.status) AND ($1 = '' OR p.name ILIKE $2 OR p.barcode = $1)
      ORDER BY (p.barcode = $1) DESC, p.name LIMIT 15`,
    [q, likeEscape(q)],
  );
  // Matrix parents come first (unless a barcode matched exactly): picking one opens the variant grid.
  const exact = rows.some((p) => p.barcode && p.barcode === q);
  const matrices = exact ? [] : (await query(
    `SELECT m.id, m.name, m.attr1_name, m.attr2_name,
            count(p.id)::int AS variant_count, coalesce(sum(p.quantity), 0)::int AS total_qty
       FROM product_matrices m JOIN products p ON p.matrix_id = m.id AND p.status
      WHERE m.status AND ($1 = '' OR m.name ILIKE $2)
      GROUP BY m.id ORDER BY m.name LIMIT 5`,
    [q, likeEscape(q)],
  )).rows.map((m) => ({
    isMatrix: true, id: m.id, name: m.name, attributes: [m.attr1_name, m.attr2_name].filter(Boolean),
    variantCount: m.variant_count, quantity: m.total_qty,
  }));
  ok(res, [...matrices, ...rows.map(out)]);
}));

const MAX_IMPORT_ROWS = 5000;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_ALIASES = {
  name: ['name', 'productname', 'product', 'item', 'itemname', 'title'],
  category: ['category', 'categoryname', 'cat', 'group', 'productcategory'],
  brand: ['brand', 'brandname', 'make', 'manufacturer', 'company'],
  barcode: ['barcode', 'sku', 'code', 'upc', 'ean', 'productcode', 'itemcode', 'barcodeno'],
  cost: ['cost', 'costprice', 'purchaseprice', 'buyprice', 'unitcost'],
  sellingPrice: ['sellingprice', 'selling', 'price', 'retailprice', 'saleprice', 'unitprice'],
  topCustomerPrice: ['topcustomerprice', 'topcustomer', 'topcustomerprice2', 'pricelevel2', 'vip', 'vipprice', 'wholesaleprice', 'wholesale'],
  jobberPrice: ['jobberprice', 'jobber', 'jobberprice3', 'pricelevel3', 'dealerprice', 'dealer', 'trade', 'tradeprice'],
  quantity: ['quantity', 'qty', 'stock', 'inventory', 'count', 'units'],
  description: ['description', 'desc', 'details', 'notes'],
  status: ['status', 'active', 'state'],
};
const ALIAS_TO_FIELD = Object.fromEntries(
  Object.entries(HEADER_ALIASES).flatMap(([f, as]) => as.map((a) => [a, f]))
);

const parseStatus = (v) => !['inactive', 'disabled', 'no', 'false', '0', 'n', 'off'].includes(norm(v));
const clean = (v) => String(v ?? '').replace(/^'(?=[=+\-@])/, '').trim();

const parseNum = (v, def = 0) => {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  if (!cleaned) return def;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};

const parseIntNum = (v, def = 0) => {
  if (v === undefined || v === null || String(v).trim() === '') return def;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  if (!cleaned) return def;
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
};

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'cat';

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Product Name' },
  { key: 'category_name', label: 'Category' },
  { key: 'brand_name', label: 'Brand' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'cost', label: 'Cost' },
  { key: 'selling_price', label: 'Selling Price' },
  { key: 'top_customer_price', label: 'Top Customer Price' },
  { key: 'jobber_price', label: 'Jobber Price' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'description', label: 'Description' },
  { key: 'statusText', label: 'Status' },
];

r.get('/export', requirePerm('import_export', 'view'), requirePerm('products', 'view'), h(async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, c.name AS category_name, b.name AS brand_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     ORDER BY p.name ASC`
  );
  const csv = toCsv(
    EXPORT_COLUMNS,
    rows.map((p) => ({
      ...p,
      barcode: p.barcode || '',
      cost: Number(p.cost || 0).toFixed(2),
      selling_price: Number(p.selling_price || 0).toFixed(2),
      top_customer_price: Number(p.top_customer_price || 0).toFixed(2),
      jobber_price: Number(p.jobber_price || 0).toFixed(2),
      quantity: p.quantity,
      category_name: p.category_name || '',
      brand_name: p.brand_name || '',
      statusText: p.status ? 'Active' : 'Inactive',
    }))
  );
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('\ufeff' + csv);
}));

const importBody = express.text({ type: () => true, limit: '3mb' });

r.post('/import', requirePerm('import_export', 'create'), requirePerm('products', 'create'), importBody, h(async (req, res) => {
  const mode = req.query.mode === 'update' ? 'update' : 'skip';
  const dryRun = req.query.dryRun === '1';
  if (mode === 'update' && !can(req, 'products', 'edit')) return fail(res, 403, 'Updating existing products needs edit permission');
  if (typeof req.body !== 'string' || !req.body.trim()) return fail(res, 422, 'The file is empty');

  const table = parseCsv(req.body).filter((row) => row.some((c) => String(c).trim() !== ''));
  if (table.length < 2) return fail(res, 422, 'The file needs a header row and at least one product');

  const header = table[0].map((h) => ALIAS_TO_FIELD[norm(h)] || null);
  if (!header.includes('name')) {
    return fail(res, 422, 'No product name column found. The first row must contain column headings such as Name or Product Name.');
  }

  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) return fail(res, 422, `Too many rows (${body.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`);

  const errors = [];
  const valid = [];
  const seenBarcodes = new Map();
  const seenNames = new Map();

  body.forEach((cells, i) => {
    const line = i + 2;
    const raw = {};
    header.forEach((f, j) => {
      if (f && raw[f] === undefined) raw[f] = clean(cells[j]);
    });

    const name = String(raw.name || '').trim();
    if (!name) {
      errors.push({ row: line, name: '—', message: 'Product name is required' });
      return;
    }
    if (name.length > 200) {
      errors.push({ row: line, name, message: 'Product name is too long (max 200)' });
      return;
    }

    const barcode = raw.barcode ? String(raw.barcode).trim() : '';
    if (barcode && !/^[A-Za-z0-9\-_.]*$/.test(barcode)) {
      errors.push({ row: line, name, message: 'Barcode may only contain letters, numbers, - _ .' });
      return;
    }
    if (barcode.length > 64) {
      errors.push({ row: line, name, message: 'Barcode is too long (max 64)' });
      return;
    }

    const cost = parseNum(raw.cost, 0);
    if (cost === null || cost < 0 || cost > 1e11) {
      errors.push({ row: line, name, message: 'Cost must be a valid non-negative number' });
      return;
    }

    const sellingPrice = parseNum(raw.sellingPrice, 0);
    if (sellingPrice === null || sellingPrice < 0 || sellingPrice > 1e11) {
      errors.push({ row: line, name, message: 'Selling price must be a valid non-negative number' });
      return;
    }

    const topCustomerPrice = parseNum(raw.topCustomerPrice, sellingPrice);
    if (topCustomerPrice === null || topCustomerPrice < 0 || topCustomerPrice > 1e11) {
      errors.push({ row: line, name, message: 'Top customer price must be a valid non-negative number' });
      return;
    }

    const jobberPrice = parseNum(raw.jobberPrice, sellingPrice);
    if (jobberPrice === null || jobberPrice < 0 || jobberPrice > 1e11) {
      errors.push({ row: line, name, message: 'Jobber price must be a valid non-negative number' });
      return;
    }

    const quantity = parseIntNum(raw.quantity, 0);
    if (quantity === null || quantity < 0 || quantity > 1e9) {
      errors.push({ row: line, name, message: 'Quantity must be a valid non-negative whole number' });
      return;
    }

    const description = String(raw.description || '').slice(0, 5000);
    const categoryName = String(raw.category || '').trim();
    const brandName = String(raw.brand || '').trim().slice(0, 100);
    const status = raw.status === undefined ? true : parseStatus(raw.status);

    const barcodeKey = barcode ? barcode.toLowerCase() : null;
    const nameKey = name.toLowerCase();

    if (barcodeKey && seenBarcodes.has(barcodeKey)) {
      errors.push({ row: line, name, message: `Same barcode as row ${seenBarcodes.get(barcodeKey)}` });
      return;
    }
    if (seenNames.has(nameKey)) {
      errors.push({ row: line, name, message: `Same product name as row ${seenNames.get(nameKey)}` });
      return;
    }

    if (barcodeKey) seenBarcodes.set(barcodeKey, line);
    seenNames.set(nameKey, line);

    valid.push({
      row: line,
      name,
      barcode,
      barcodeKey,
      nameKey,
      cost,
      sellingPrice,
      topCustomerPrice,
      jobberPrice,
      quantity,
      description,
      categoryName,
      brandName,
      status,
    });
  });

  const summary = await tx(async (client) => {
    // 1. Categories
    const { rows: catRows } = await client.query(`SELECT id, lower(name) AS lname, slug FROM categories`);
    const catByName = new Map(catRows.map((c) => [c.lname, c.id]));
    const catSlugs = new Set(catRows.map((c) => c.slug));

    let defaultCatId = catRows[0]?.id;
    if (!defaultCatId) {
      if (dryRun) {
        defaultCatId = '00000000-0000-0000-0000-000000000000';
      } else {
        const { rows: defCat } = await client.query(
          `INSERT INTO categories (name, slug, status) VALUES ('General', 'general', true) RETURNING id`
        );
        defaultCatId = defCat[0].id;
        catByName.set('general', defaultCatId);
        catSlugs.add('general');
      }
    }

    for (const item of valid) {
      if (!item.categoryName) continue;
      const catKey = item.categoryName.toLowerCase();
      if (!catByName.has(catKey)) {
        if (dryRun) {
          catByName.set(catKey, '00000000-0000-0000-0000-000000000000');
        } else {
          let baseSlug = slugify(item.categoryName);
          let s = baseSlug;
          let counter = 1;
          while (catSlugs.has(s)) {
            s = `${baseSlug}-${counter++}`;
          }
          catSlugs.add(s);
          const { rows: newCat } = await client.query(
            `INSERT INTO categories (name, slug, status) VALUES ($1, $2, true) RETURNING id`,
            [item.categoryName, s]
          );
          catByName.set(catKey, newCat[0].id);
        }
      }
    }

    // 1b. Brands (created on the fly, like categories). Blank brand = leave as is.
    const { rows: brandRows } = await client.query(`SELECT id, lower(name) AS lname FROM brands`);
    const brandByName = new Map(brandRows.map((b) => [b.lname, b.id]));
    for (const item of valid) {
      if (!item.brandName) continue;
      const key = item.brandName.toLowerCase();
      if (brandByName.has(key)) continue;
      if (dryRun) brandByName.set(key, '00000000-0000-0000-0000-000000000000');
      else {
        const { rows: nb } = await client.query(`INSERT INTO brands (name) VALUES ($1) RETURNING id`, [item.brandName]);
        brandByName.set(key, nb[0].id);
      }
    }

    // 2. Existing products
    const { rows: existingProds } = await client.query(
      `SELECT id, name, lower(name) AS lname, lower(barcode) AS lbarcode, category_id FROM products`
    );
    const byBarcode = new Map();
    const byName = new Map();
    for (const p of existingProds) {
      if (p.lbarcode) byBarcode.set(p.lbarcode, p);
      if (p.lname) byName.set(p.lname, p);
    }

    let created = 0, updated = 0, skipped = 0;

    for (const item of valid) {
      let match = (item.barcodeKey && byBarcode.get(item.barcodeKey)) || byName.get(item.nameKey);

      if (match && mode === 'skip') {
        skipped++;
        continue;
      }

      const brandId = item.brandName ? brandByName.get(item.brandName.toLowerCase()) : null;
      const categoryId = item.categoryName
        ? catByName.get(item.categoryName.toLowerCase())
        : (match?.category_id || defaultCatId);

      if (match) {
        if (item.barcodeKey) {
          const barcodeOwner = byBarcode.get(item.barcodeKey);
          if (barcodeOwner && barcodeOwner.id !== match.id) {
            errors.push({
              row: item.row,
              name: item.name,
              message: `Barcode "${item.barcode}" is already held by "${barcodeOwner.name}"`,
            });
            continue;
          }
        }

        updated++;
        if (dryRun) continue;

        await client.query(
          `UPDATE products SET
             name = $1,
             cost = $2,
             selling_price = $3,
             top_customer_price = $4,
             jobber_price = $5,
             quantity = $6,
             barcode = COALESCE(NULLIF($7, ''), barcode),
             description = COALESCE(NULLIF($8, ''), description),
             category_id = COALESCE($9, category_id),
             status = $10,
             brand_id = COALESCE($12, brand_id),
             updated_at = now()
           WHERE id = $11`,
          [
            item.name,
            item.cost,
            item.sellingPrice,
            item.topCustomerPrice,
            item.jobberPrice,
            item.quantity,
            item.barcode || null,
            item.description,
            categoryId,
            item.status,
            match.id,
            brandId,
          ]
        );
      } else {
        if (item.barcodeKey) {
          const barcodeOwner = byBarcode.get(item.barcodeKey);
          if (barcodeOwner) {
            errors.push({
              row: item.row,
              name: item.name,
              message: `Barcode "${item.barcode}" is already held by "${barcodeOwner.name}"`,
            });
            continue;
          }
        }

        created++;
        if (dryRun) continue;

        const { rows: inserted } = await client.query(
          `INSERT INTO products (name, cost, selling_price, top_customer_price, jobber_price, quantity, barcode, description, category_id, status, brand_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            item.name,
            item.cost,
            item.sellingPrice,
            item.topCustomerPrice,
            item.jobberPrice,
            item.quantity,
            item.barcode || null,
            item.description,
            categoryId,
            item.status,
            brandId,
          ]
        );

        const newEntry = { id: inserted[0].id, name: item.name, lname: item.nameKey, lbarcode: item.barcodeKey, category_id: categoryId };
        if (item.barcodeKey) byBarcode.set(item.barcodeKey, newEntry);
        byName.set(item.nameKey, newEntry);
      }
    }

    return { created, updated, skipped };
  });

  const columns = [...new Set(header.filter(Boolean))];
  const ignored = table[0].filter((h, j) => h.trim() && !header[j]);
  const result = {
    dryRun,
    mode,
    totalRows: body.length,
    ...summary,
    failed: errors.length,
    errors: errors.slice(0, 200),
    columns,
    ignoredColumns: ignored,
    preview: valid.slice(0, 5).map(({ row, barcodeKey, nameKey, ...p }) => ({
      ...p,
      category: p.categoryName || 'General',
      brand: p.brandName || '',
    })),
  };

  const msg = dryRun
    ? 'Preview ready'
    : `Imported: ${summary.created} added, ${summary.updated} updated, ${summary.skipped} skipped, ${errors.length} with errors`;
  ok(res, result, msg);
}));

// Products to reorder (purchase order screen). Filters:
//   show = alert (default: at or below each product's alert level) | all (every quantity) | below (quantity < below)
//   category, brand = uuid filters
r.get('/low-stock', h(async (req, res) => {
  if (!can(req, 'products', 'view') && !can(req, 'receiving', 'view')) return fail(res, 403, 'You do not have permission');
  const show = ['alert', 'all', 'below'].includes(req.query.show) ? req.query.show : 'alert';
  const conds = ['p.status = true', '(p.matrix_id IS NULL OR m.status)'];
  const params = [];
  if (show === 'alert') conds.push(`p.quantity <= ${ALERT_SQL}`);
  if (show === 'below') {
    const n = Number(req.query.below);
    if (!Number.isInteger(n) || n < 0 || n > 1e9) return fail(res, 422, 'Type a whole number to show items with less than that quantity');
    params.push(n);
    conds.push(`p.quantity < $${params.length}`);
  }
  for (const [key, col] of [['category', 'p.category_id'], ['brand', 'p.brand_id']]) {
    if (isUuid(req.query[key])) {
      params.push(req.query[key]);
      conds.push(`${col} = $${params.length}`);
    }
  }
  const { rows } = await query(
    `SELECT p.id, p.name, p.barcode, p.quantity, p.cost, ${ALERT_SQL} AS alert_level, c.name AS category_name, b.name AS brand_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN product_matrices m ON m.id = p.matrix_id
      WHERE ${conds.join(' AND ')}
      ORDER BY ${show === 'all' ? 'p.name' : `(p.quantity - ${ALERT_SQL}), p.name`} LIMIT 2000`,
    params,
  );
  ok(res, { products: rows.map((p) => ({
    id: p.id, name: p.name, barcode: p.barcode || '', quantity: p.quantity, cost: Number(p.cost),
    alertLevel: p.alert_level, category: p.category_name || '', brand: p.brand_name || '',
  })) });
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
async function brandExists(id) {
  return !id || (await query(`SELECT 1 FROM brands WHERE id=$1`, [id])).rowCount > 0;
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
  if (!(await brandExists(b.brand_id))) return fail(res, 422, 'Invalid brand', { brand_id: 'Brand not found' });
  try {
    const { rows } = await query(
      `INSERT INTO products (name,cost,selling_price,top_customer_price,jobber_price,quantity,barcode,description,category_id,status,low_stock_alert,brand_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [b.name, b.cost, b.selling_price, b.top_customer_price, b.jobber_price, b.quantity, b.barcode || null, b.description, b.category_id, b.status, b.low_stock_alert, b.brand_id],
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
  if (!(await brandExists(b.brand_id))) return fail(res, 422, 'Invalid brand', { brand_id: 'Brand not found' });
  const owner = (await query(`SELECT matrix_id FROM products WHERE id=$1`, [req.params.id])).rows[0];
  if (owner?.matrix_id) return fail(res, 422, 'This is a matrix variant — edit it from its matrix item');
  try {
    const { rowCount } = await query(
      `UPDATE products SET name=$1,cost=$2,selling_price=$3,top_customer_price=$4,jobber_price=$5,quantity=$6,barcode=$7,
              description=$8,category_id=$9,status=$10,low_stock_alert=$11,brand_id=$12,updated_at=now() WHERE id=$13`,
      [b.name, b.cost, b.selling_price, b.top_customer_price, b.jobber_price, b.quantity, b.barcode || null, b.description, b.category_id, b.status, b.low_stock_alert, b.brand_id, req.params.id],
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

// Set only the low stock alert level. Works for matrix variants too (e.g. one flavor),
// which can't go through the full product form.
r.patch('/:id/alert', requirePerm('products', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Product not found');
  const parsed = alertLevel.safeParse(req.body?.lowStockAlert);
  if (!parsed.success) return fail(res, 422, parsed.error.issues[0]?.message || 'Invalid alert level');
  const { rowCount } = await query(`UPDATE products SET low_stock_alert=$1, updated_at=now() WHERE id=$2`, [parsed.data, req.params.id]);
  if (!rowCount) return fail(res, 404, 'Product not found');
  ok(res, { lowStockAlert: parsed.data, alertLevel: parsed.data ?? DEFAULT_ALERT }, 'Alert level saved');
}));

r.delete('/:id', requirePerm('products', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Product not found');
  const { rowCount } = await query(`DELETE FROM products WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Product not found');
  ok(res, null, 'Product deleted');
}));

export default r;
