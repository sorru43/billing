import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { config } from '../config.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';
import { getSetting } from '../settings.js';
import { invoicePdf } from '../pdf.js';
import { invoiceEmail } from '../archive.js';

const r = Router();
const PRICE_FIELD = { selling: 'selling_price', top_customer: 'top_customer_price', jobber: 'jobber_price' };
const round2 = (n) => Math.round(n * 100) / 100;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const schema = z.object({
  invoiceDate: dateStr,
  dueDate: dateStr.optional().or(z.literal('')).transform((v) => v || null),
  customerName: z.string().trim().min(1, 'Customer name is required').max(200),
  customerEmail: z.string().trim().max(200).email('Invalid email').optional().or(z.literal('')).transform((v) => v || ''),
  customerPhone: z.string().trim().max(30).default(''),
  customerAddress: z.string().trim().max(1000).default(''),
  priceLevel: z.enum(['selling', 'top_customer', 'jobber']),
  notes: z.string().max(5000).default(''),
  status: z.enum(['unpaid', 'paid']).default('unpaid'),
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Select a product'),
        quantity: z.coerce.number().int('Whole numbers only').min(1, 'Quantity must be at least 1').max(1e6),
        description: z.string().trim().max(1000).default(''),
        rate: z.coerce.number().min(0).max(1e11),
        discount: z.coerce.number().min(0).max(1e11).default(0),
        taxRate: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1, 'Add at least one product')
    .max(200),
});

const listOut = (i) => ({
  id: i.id,
  invoiceNumber: i.invoice_number,
  customerName: i.customer_name,
  customerEmail: i.customer_email,
  total: i.total,
  status: i.status,
  invoiceDate: i.invoice_date,
  createdAt: i.created_at,
});

const fullOut = (i) => ({
  ...listOut(i),
  dueDate: i.due_date,
  customerPhone: i.customer_phone,
  customerAddress: i.customer_address,
  priceLevel: i.price_level,
  items: i.items,
  subtotal: i.subtotal,
  discountTotal: i.discount_total,
  taxTotal: i.tax_total,
  notes: i.notes,
});

async function nextNumber(client, peek) {
  const { prefix = 'INV_' } = await getSetting('invoice');
  const q = peek
    ? `SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS n FROM invoice_number_seq`
    : `SELECT nextval('invoice_number_seq') AS n`;
  const { rows } = await (client || { query }).query(q);
  return `${prefix}${String(rows[0].n).padStart(6, '0')}`;
}

r.get('/', requirePerm('invoices', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE invoice_number ILIKE $1 OR customer_name ILIKE $1 OR customer_email ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM invoices ${where}`, params)).rows[0].n;
  const { rows } = await query(`SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, {
    invoices: rows.map(listOut),
    pagination: pagination(total, page, limit),
  });
}));

r.get('/next-number', requirePerm('invoices', 'create'), h(async (req, res) => {
  ok(res, {
    invoiceNumber: await nextNumber(null, true),
  });
}));

r.get('/:id', requirePerm('invoices', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  ok(res, fullOut(rows[0]));
}));

r.get('/:id/pdf', requirePerm('invoices', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  const pdf = await invoicePdf(rows[0], await getSetting('company'));
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${rows[0].invoice_number.replace(/[^\w.-]/g, '_')}.pdf"`,
    'Cache-Control': 'no-store',
  });
  res.send(pdf);
}));

r.post('/', requirePerm('invoices', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  const result = await tx(async (client) => {
    const ids = [...new Set(b.items.map((i) => i.productId))];
    // Lock the product rows so two invoices cannot oversell the same stock.
    const { rows: products } = await client.query(`SELECT * FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`, [ids]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const needed = new Map();
    for (const it of b.items) needed.set(it.productId, (needed.get(it.productId) || 0) + it.quantity);

    const errors = {};
    b.items.forEach((it, idx) => {
      const p = byId.get(it.productId);
      if (!p || !p.status) errors[`items.${idx}.productId`] = 'Product not found or inactive';
      else if (needed.get(p.id) > p.quantity) errors[`items.${idx}.quantity`] = `Only ${p.quantity} of "${p.name}" in stock`;
    });
    if (Object.keys(errors).length) return { errors };

    // Totals are always computed here; client-side totals are display only.
    let subtotal = 0, discountTotal = 0, taxTotal = 0;
    const items = b.items.map((it) => {
      const p = byId.get(it.productId);
      const gross = round2(it.quantity * it.rate);
      const discount = Math.min(round2(it.discount), gross);
      const taxable = gross - discount;
      const tax = round2((taxable * it.taxRate) / 100);
      subtotal += gross; discountTotal += discount; taxTotal += tax;
      return {
        productId: p.id, name: p.name, barcode: p.barcode || '', description: it.description, quantity: it.quantity,
        listPrice: Number(p[PRICE_FIELD[b.priceLevel]]), rate: it.rate, discount, taxRate: it.taxRate, tax,
        amount: round2(taxable + tax),
      };
    });
    const total = round2(subtotal - discountTotal + taxTotal);

    for (const [pid, qty] of needed) {
      await client.query(`UPDATE products SET quantity = quantity - $1, updated_at = now() WHERE id = $2`, [qty, pid]);
    }
    const number = await nextNumber(client, false);
    const { rows } = await client.query(
      `INSERT INTO invoices (invoice_number, invoice_date, due_date, customer_name, customer_email, customer_phone, customer_address,
                             price_level, items, subtotal, discount_total, tax_total, total, notes, status, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now() + make_interval(hours => $17)) RETURNING *`,
      [number, b.invoiceDate, b.dueDate, b.customerName, b.customerEmail, b.customerPhone, b.customerAddress, b.priceLevel,
       JSON.stringify(items), round2(subtotal), round2(discountTotal), round2(taxTotal), total, b.notes, b.status, req.user.id,
       config.invoiceRetentionHours],
    );
    return { invoice: rows[0] };
  });
  if (result.errors) return fail(res, 422, 'Please fix the highlighted items', result.errors);
  ok(res, fullOut(result.invoice), 'Invoice created', 201);
}));

r.patch('/:id/status', requirePerm('invoices', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const status = req.body?.status;
  if (!['paid', 'unpaid'].includes(status)) return fail(res, 422, 'Invalid status');
  const { rowCount } = await query(`UPDATE invoices SET status=$1 WHERE id=$2`, [status, req.params.id]);
  if (!rowCount) return fail(res, 404, 'Invoice not found');
  ok(res, null, 'Invoice status updated');
}));

// Send the invoice to the customer (or another address).
r.post('/:id/email', requirePerm('invoices', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const to = z.string().trim().email().max(200).safeParse(req.body?.to);
  if (!to.success) return fail(res, 422, 'Enter a valid email address', { to: 'Enter a valid email address' });
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  try {
    await invoiceEmail(rows[0], to.data, { archive: false });
  } catch (e) {
    return fail(res, 502, `Could not send email: ${e.message}`);
  }
  ok(res, null, `Invoice emailed to ${to.data}`);
}));

export default r;
