import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, paging, pagination, likeEscape, isIsoDate, BAD_DATE } from '../http.js';

// Payment History: every payment received from customers (customer_payments), newest first.
// View only, with the "Payment History" role permission (modules.js). A reversed payment (Mark
// Unpaid) shows as a negative amount.
const r = Router();

const out = (p) => ({
  id: p.id,
  paymentNumber: p.payment_number,
  paymentDate: p.payment_date,
  customerId: p.customer_id,
  customerName: p.customer_name,
  amount: Number(p.amount),
  method: p.payment_method,
  reference: p.reference || '',
  notes: p.notes || '',
  recordedBy: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || p.email || '',
  createdAt: p.created_at,
});

r.get('/', requirePerm('payment_history', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const { from, until } = req.query;
  for (const v of [from, until]) if (v && !isIsoDate(v)) return fail(res, 422, BAD_DATE);
  const conds = [];
  const params = [];
  if (search) {
    params.push(likeEscape(search));
    conds.push(`(p.payment_number ILIKE $${params.length} OR p.customer_name ILIKE $${params.length} OR p.reference ILIKE $${params.length} OR p.notes ILIKE $${params.length})`);
  }
  if (from) { params.push(from); conds.push(`p.payment_date >= $${params.length}`); }
  if (until) { params.push(until); conds.push(`p.payment_date <= $${params.length}`); }
  if (['cash', 'check', 'zelle', 'bank_transfer', 'card', 'other'].includes(req.query.method)) {
    params.push(req.query.method);
    conds.push(`p.payment_method = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const totals = (await query(`SELECT count(*)::int n, coalesce(sum(p.amount), 0) AS amount FROM customer_payments p ${where}`, params)).rows[0];
  const { rows } = await query(
    `SELECT p.*, u.first_name, u.last_name, u.username, u.email
       FROM customer_payments p LEFT JOIN users u ON u.id = p.created_by
       ${where} ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, {
    payments: rows.map(out),
    pagination: pagination(totals.n, page, limit),
    totalAmount: Math.round(Number(totals.amount) * 100) / 100,
    canOpenCustomers: can(req, 'customers', 'view'),
  });
}));

export default r;
