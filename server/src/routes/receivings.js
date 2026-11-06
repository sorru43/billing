import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

// Receiving inventory from a vendor: adds stock, updates cost, and (when the cost
// went up) raises all three price levels by the chosen rule.
const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const PRICE_FIELDS = ['selling_price', 'top_customer_price', 'jobber_price'];

const schema = z.object({
  vendorId: z.string().uuid().optional().or(z.literal('')).or(z.null()).transform((v) => v || null),
  vendorName: z.string().trim().min(1, 'Vendor is required').max(200),
  vendorInvoiceNo: z.string().trim().max(100).default(''),
  receivedDate: dateStr,
  status: z.enum(['unpaid', 'paid']).default('unpaid'),
  // percent: keep the same markup % · amount: add the same $ the cost went up · none: leave prices
  priceRule: z.enum(['percent', 'amount', 'none']).default('percent'),
  notes: z.string().max(5000).default(''),
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Select a product'),
        quantity: z.coerce.number().int('Whole numbers only').min(1, 'Quantity must be at least 1').max(1e6),
        cost: z.coerce.number().min(0, 'Cost cannot be negative').max(1e11),
      }),
    )
    .min(1, 'Add at least one product')
    .max(300),
});

const listOut = (x) => ({
  id: x.id, receivingNumber: x.receiving_number, vendorId: x.vendor_id, vendorName: x.vendor_name,
  vendorInvoiceNo: x.vendor_invoice_no, receivedDate: x.received_date, status: x.status, total: x.total, createdAt: x.created_at,
});
const fullOut = (x) => ({ ...listOut(x), priceRule: x.price_rule, items: x.items, notes: x.notes });

// New price after a cost change. Prices only move up, and only when the cost went up.
export function raisedPrice(price, oldCost, newCost, rule) {
  if (rule === 'none' || newCost <= oldCost) return price;
  if (rule === 'amount') return round2(price + (newCost - oldCost));
  if (oldCost <= 0) return round2(price + (newCost - oldCost)); // no old cost to keep a % from
  return round2(price * (newCost / oldCost));
}

r.get('/', requirePerm('receiving', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const conds = [];
  const params = [];
  if (search) {
    params.push(likeEscape(search));
    conds.push(`(receiving_number ILIKE $1 OR vendor_name ILIKE $1 OR vendor_invoice_no ILIKE $1)`);
  }
  if (isUuid(req.query.vendorId)) {
    params.push(req.query.vendorId);
    conds.push(`vendor_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (await query(`SELECT count(*)::int n FROM receivings ${where}`, params)).rows[0].n;
  const { rows } = await query(`SELECT * FROM receivings ${where} ORDER BY received_date DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, { receivings: rows.map(listOut), pagination: pagination(total, page, limit) });
}));

r.get('/:id', requirePerm('receiving', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Receiving not found');
  const { rows } = await query(`SELECT * FROM receivings WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Receiving not found');
  ok(res, fullOut(rows[0]));
}));

r.post('/', requirePerm('receiving', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  const result = await tx(async (client) => {
    const ids = [...new Set(b.items.map((i) => i.productId))];
    const { rows: products } = await client.query(`SELECT * FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`, [ids]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const errors = {};
    b.items.forEach((it, idx) => {
      if (!byId.has(it.productId)) errors[`items.${idx}.productId`] = 'Product not found';
    });
    if (new Set(b.items.map((i) => i.productId)).size !== b.items.length) errors.items = 'Each product can only be on one line';
    if (Object.keys(errors).length) return { errors };

    let vendorId = null;
    if (b.vendorId) vendorId = (await client.query(`SELECT id FROM vendors WHERE id=$1`, [b.vendorId])).rows[0]?.id || null;

    let total = 0;
    const items = [];
    for (const it of b.items) {
      const p = byId.get(it.productId);
      const oldCost = Number(p.cost);
      const cost = round2(it.cost);
      const prices = {};
      for (const f of PRICE_FIELDS) prices[f] = raisedPrice(Number(p[f]), oldCost, cost, b.priceRule);
      await client.query(
        `UPDATE products SET quantity = quantity + $1, cost = $2, selling_price = $3, top_customer_price = $4, jobber_price = $5, updated_at = now()
          WHERE id = $6`,
        [it.quantity, cost, prices.selling_price, prices.top_customer_price, prices.jobber_price, p.id],
      );
      const amount = round2(it.quantity * cost);
      total += amount;
      items.push({
        productId: p.id, name: p.name, barcode: p.barcode || '', quantity: it.quantity, oldCost, cost, amount,
        oldPrices: { selling: Number(p.selling_price), topCustomer: Number(p.top_customer_price), jobber: Number(p.jobber_price) },
        newPrices: { selling: prices.selling_price, topCustomer: prices.top_customer_price, jobber: prices.jobber_price },
      });
    }
    const { rows: n } = await client.query(`SELECT nextval('receiving_number_seq') AS n`);
    const { rows } = await client.query(
      `INSERT INTO receivings (receiving_number, vendor_id, vendor_name, vendor_invoice_no, received_date, status, price_rule, items, total, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [`RCV_${String(n[0].n).padStart(6, '0')}`, vendorId, b.vendorName, b.vendorInvoiceNo, b.receivedDate, b.status, b.priceRule,
       JSON.stringify(items), round2(total), b.notes, req.user.id],
    );
    return { receiving: rows[0] };
  });
  if (result.errors) return fail(res, 422, 'Please fix the highlighted items', result.errors);
  ok(res, fullOut(result.receiving), 'Inventory received', 201);
}));

r.patch('/:id/status', requirePerm('receiving', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Receiving not found');
  const status = req.body?.status;
  if (!['paid', 'unpaid'].includes(status)) return fail(res, 422, 'Invalid status');
  const { rowCount } = await query(`UPDATE receivings SET status=$1 WHERE id=$2`, [status, req.params.id]);
  if (!rowCount) return fail(res, 404, 'Receiving not found');
  ok(res, null, `Vendor invoice marked ${status}`);
}));

export default r;
