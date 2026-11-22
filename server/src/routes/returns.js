import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';
import { useCustomerCredit } from '../balance.js';
import { startRetentionWindow } from '../archive.js';

// Returns against an invoice. Items come back at the price the customer actually
// paid on that invoice (never today's list price), optionally back into stock.
//
// Settlement:
//   refund: money is handed back now; balances don't change.
//   credit: the return's value pays what is still owed on this invoice. For a saved customer any
//           rest pays their oldest open bills and then stays as credit for the next invoice (the
//           same path as an overpayment). A walk-in has no account to keep credit on, so a credit
//           return may only cover what is still owed on the invoice; anything more is a refund.
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

// Quantities already returned per product on one invoice. Matched by invoice id: numbers can be
// reused once an old invoice is gone, and its returns must not count against a new one.
async function returnedSoFar(client, inv) {
  const { rows } = await client.query(
    `SELECT (it->>'productId') AS pid, sum((it->>'quantity')::int)::int AS qty
       FROM returns, jsonb_array_elements(items) it
      WHERE invoice_id = $1 OR (invoice_id IS NULL AND invoice_number = $2) GROUP BY 1`,
    [inv.id, inv.invoice_number],
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
  const done = await returnedSoFar({ query }, inv);
  ok(res, {
    id: inv.id, invoiceNumber: inv.invoice_number, invoiceDate: inv.invoice_date, customerName: inv.customer_name,
    customerId: inv.customer_id, status: inv.status, total: inv.total,
    paidAmount: Number(inv.paid_amount) || 0,
    due: Math.max(0, round2(Number(inv.total) - (Number(inv.paid_amount) || 0))),
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
    const done = await returnedSoFar(client, inv);
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
    for (const it of b.items) total += round2(it.quantity * lines.get(it.productId).price);
    total = round2(total);

    const invTotal = Number(inv.total);
    const invPaid = round2(Number(inv.paid_amount) || 0);
    const due = Math.max(0, round2(invTotal - invPaid));
    if (b.settlement === 'credit' && !inv.customer_id && total > due) {
      return {
        message: due > 0
          ? `This walk-in invoice only has ${due.toFixed(2)} left to pay, so a credit can't cover ${total.toFixed(2)}. Choose Refund, or return less.`
          : `This walk-in invoice is already paid, so there is nothing to credit. Choose Refund.`,
        errors: { settlement: 'Choose Refund for a walk-in customer' },
      };
    }

    const items = [];
    for (const it of b.items) {
      const l = lines.get(it.productId);
      const amount = round2(it.quantity * l.price);
      let restocked = false;
      if (it.restock) {
        const u = await client.query(`UPDATE products SET quantity = quantity + $1, updated_at = now() WHERE id = $2`, [it.quantity, it.productId]);
        restocked = u.rowCount > 0; // the product may have been deleted since
      }
      items.push({ productId: it.productId, name: l.name, barcode: l.barcode, quantity: it.quantity, price: l.price, amount, restocked });
    }
    const credit = b.settlement === 'credit';
    const { rows: n } = await client.query(`SELECT nextval('return_number_seq') AS n`);
    const { rows: saved } = await client.query(
      `INSERT INTO returns (return_number, invoice_id, invoice_number, customer_id, customer_name, settlement, items, total, reason, created_by, applied)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [`RET_${String(n[0].n).padStart(6, '0')}`, inv.id, inv.invoice_number, inv.customer_id, inv.customer_name, b.settlement,
       JSON.stringify(items), total, b.reason, req.user.id, credit],
    );

    // Put a credit return's value to work (see the note at the top).
    let applied = null;
    if (credit && total > 0) {
      if (inv.customer_id) {
        await client.query(`UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2`, [total, inv.customer_id]);
        await useCustomerCredit(client, inv.customer_id, inv.id);
        const after = (await client.query(`SELECT paid_amount FROM invoices WHERE id = $1`, [inv.id])).rows[0];
        const left = round2(Number((await client.query(`SELECT credit_balance FROM customers WHERE id = $1`, [inv.customer_id])).rows[0].credit_balance));
        applied = { toInvoice: round2(Number(after.paid_amount) - invPaid), creditBalance: left };
      } else {
        const paid = round2(invPaid + total);
        const status = paid >= invTotal && invTotal > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
        await client.query(`UPDATE invoices SET paid_amount = $1, status = $2 WHERE id = $3`, [paid, status, inv.id]);
        await client.query(`UPDATE customer_sales_records SET paid_amount = $1, status = $2 WHERE invoice_id = $3`, [paid, status, inv.id]);
        if (status === 'paid' && inv.status !== 'paid') await startRetentionWindow(client, inv.id);
        applied = { toInvoice: total, creditBalance: 0 };
      }
    }
    return { ret: saved[0], applied };
  });
  if (result.notFound) return fail(res, 404, 'Invoice not found');
  if (result.errors) return fail(res, 422, result.message || 'Please fix the highlighted items', result.errors);
  let msg = 'Return saved';
  if (result.applied) {
    const { toInvoice, creditBalance } = result.applied;
    const rest = round2(Number(result.ret.total) - toInvoice);
    const parts = [];
    if (toInvoice > 0) parts.push(`${toInvoice.toFixed(2)} taken off ${result.ret.invoice_number}`);
    if (rest > 0) parts.push(`${rest.toFixed(2)} credited to the customer's account`);
    msg = `Return saved. ${parts.join(', ')}`;
    if (creditBalance > 0) msg += ` (${creditBalance.toFixed(2)} credit available)`;
  }
  ok(res, { ...out(result.ret), applied: result.applied }, msg, 201);
}));

export default r;
