import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

// Returns against an invoice. Items come back at the price the customer actually
// paid on that invoice (never today's list price), optionally back into stock.
const r = Router();
const round2 = (n) => Math.round(n * 100) / 100;

const schema = z.object({
  invoiceId: z.string().uuid(),
  // credit: lowers what the customer owes · refund: money handed back
  settlement: z.enum(['credit', 'refund']).default('credit'),
  reason: z.string().trim().max(2000).default(''),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().int('Whole numbers only').min(1).max(1e6),
        restock: z.boolean().default(true),
      }),
    )
    .min(1, 'Choose at least one item to return')
    .max(200),
});

const out = (x) => ({
  id: x.id, returnNumber: x.return_number, invoiceId: x.invoice_id, invoiceNumber: x.invoice_number,
  customerId: x.customer_id, customerName: x.customer_name, settlement: x.settlement, items: x.items,
  total: x.total, reason: x.reason, createdAt: x.created_at,
});

// Quantities already returned per product on one invoice.
async function returnedSoFar(client, invoiceNumber) {
  const { rows } = await client.query(
    `SELECT (it->>'productId') AS pid, sum((it->>'quantity')::int)::int AS qty
       FROM returns, jsonb_array_elements(items) it WHERE invoice_number = $1 GROUP BY 1`,
    [invoiceNumber],
  );
  return new Map(rows.map((x) => [x.pid, x.qty]));
}

// Invoice lines merged per product, with the price actually charged (after any line discount).
function invoiceLines(inv) {
  const m = new Map();
  for (const it of inv.items) {
    const cur = m.get(it.productId) || { productId: it.productId, name: it.name, barcode: it.barcode || '', sold: 0, value: 0 };
    cur.sold += it.quantity;
    cur.value += Number(it.amount);
    m.set(it.productId, cur);
  }
  return [...m.values()].map((l) => ({ ...l, price: round2(l.value / l.sold) }));
}

r.get('/', requirePerm('returns', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE return_number ILIKE $1 OR invoice_number ILIKE $1 OR customer_name ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM returns ${where}`, params)).rows[0].n;
  const { rows } = await query(`SELECT * FROM returns ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, { returns: rows.map(out), pagination: pagination(total, page, limit) });
}));

// Find an invoice by its number (typed or scanned) and show what can still be returned.
r.get('/lookup', requirePerm('returns', 'create'), h(async (req, res) => {
  const number = String(req.query.number || '').trim().slice(0, 100);
  if (!number) return fail(res, 422, 'Enter an invoice number');
  const { rows } = await query(`SELECT * FROM invoices WHERE lower(invoice_number) = lower($1)`, [number]);
  if (!rows.length) return fail(res, 404, `Invoice ${number} not found`);
  const inv = rows[0];
  const done = await returnedSoFar({ query }, inv.invoice_number);
  ok(res, {
    id: inv.id, invoiceNumber: inv.invoice_number, invoiceDate: inv.invoice_date, customerName: inv.customer_name,
    customerId: inv.customer_id, status: inv.status, total: inv.total,
    lines: invoiceLines(inv).map((l) => ({ ...l, returned: done.get(l.productId) || 0, returnable: l.sold - (done.get(l.productId) || 0) })),
  });
}));

r.get('/:id', requirePerm('returns', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Return not found');
  const { rows } = await query(`SELECT * FROM returns WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Return not found');
  ok(res, out(rows[0]));
}));

r.post('/', requirePerm('returns', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  const result = await tx(async (client) => {
    // Lock the invoice so two returns cannot both take the last returnable unit.
    const { rows } = await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [b.invoiceId]);
    if (!rows.length) return { notFound: true };
    const inv = rows[0];
    const lines = new Map(invoiceLines(inv).map((l) => [l.productId, l]));
    const done = await returnedSoFar(client, inv.invoice_number);
    const errors = {};
    b.items.forEach((it, idx) => {
      const l = lines.get(it.productId);
      if (!l) errors[`items.${idx}.productId`] = 'This item is not on the invoice';
      else if (it.quantity > l.sold - (done.get(it.productId) || 0)) {
        errors[`items.${idx}.quantity`] = `Only ${l.sold - (done.get(it.productId) || 0)} of "${l.name}" can still be returned`;
      }
    });
    if (new Set(b.items.map((i) => i.productId)).size !== b.items.length) errors.items = 'Each item can only be listed once';
    if (Object.keys(errors).length) return { errors };

    let total = 0;
    const items = [];
    for (const it of b.items) {
      const l = lines.get(it.productId);
      const amount = round2(it.quantity * l.price);
      total += amount;
      let restocked = false;
      if (it.restock) {
        const u = await client.query(`UPDATE products SET quantity = quantity + $1, updated_at = now() WHERE id = $2`, [it.quantity, it.productId]);
        restocked = u.rowCount > 0; // the product may have been deleted since
      }
      items.push({ productId: it.productId, name: l.name, barcode: l.barcode, quantity: it.quantity, price: l.price, amount, restocked });
    }
    const { rows: n } = await client.query(`SELECT nextval('return_number_seq') AS n`);
    const { rows: saved } = await client.query(
      `INSERT INTO returns (return_number, invoice_id, invoice_number, customer_id, customer_name, settlement, items, total, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [`RET_${String(n[0].n).padStart(6, '0')}`, inv.id, inv.invoice_number, inv.customer_id, inv.customer_name, b.settlement,
       JSON.stringify(items), round2(total), b.reason, req.user.id],
    );
    return { ret: saved[0] };
  });
  if (result.notFound) return fail(res, 404, 'Invoice not found');
  if (result.errors) return fail(res, 422, 'Please fix the highlighted items', result.errors);
  ok(res, out(result.ret), 'Return saved', 201);
}));

export default r;
