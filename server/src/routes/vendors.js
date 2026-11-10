import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { payVendor } from '../balance.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';

// Vendors (suppliers) for inventory receiving. Uses the `receiving` permission.
const r = Router();

const schema = z.object({
  name: z.string().trim().min(1, 'Vendor name is required').max(200),
  company: z.string().trim().max(200).default(''),
  email: z.string().trim().toLowerCase().max(200).email('Invalid email').optional().or(z.literal('')).transform((v) => v || ''),
  phone: z.string().trim().max(30, 'Phone is too long (max 30)').default(''),
  address: z.string().trim().max(1000).default(''),
  notes: z.string().max(5000).default(''),
  status: z.boolean().default(true),
});

const TOTALS = `
  (SELECT coalesce(sum(total), 0) FROM receivings x WHERE x.vendor_id = v.id) AS bought,
  (SELECT coalesce(sum(paid_amount), 0) FROM receivings x WHERE x.vendor_id = v.id) AS paid,
  (SELECT coalesce(sum(GREATEST(0, total - paid_amount)), 0) FROM receivings x WHERE x.vendor_id = v.id AND x.status != 'paid') AS owed,
  v.credit_balance AS credit_balance`;

const out = (v) => ({
  id: v.id, name: v.name, company: v.company, email: v.email, phone: v.phone, address: v.address,
  notes: v.notes, status: v.status, createdAt: v.created_at,
  ...(v.bought !== undefined ? { totals: {
    bought: Number(v.bought || 0), paid: Number(v.paid || 0),
    owed: Math.max(0, Math.round((Number(v.owed || 0) - Number(v.credit_balance || 0)) * 100) / 100),
    creditBalance: Number(v.credit_balance || 0),
  } } : {}),
});

r.get('/', requirePerm('receiving', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE v.name ILIKE $1 OR v.company ILIKE $1 OR v.email ILIKE $1 OR v.phone ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM vendors v ${where}`, params)).rows[0].n;
  const { rows } = await query(`SELECT v.*, ${TOTALS} FROM vendors v ${where} ORDER BY v.name LIMIT ${limit} OFFSET ${offset}`, params);
  ok(res, { vendors: rows.map(out), pagination: pagination(total, page, limit) });
}));

// Picker on the receiving screen.
r.get('/options', h(async (req, res) => {
  if (!can(req, 'receiving', 'view')) return fail(res, 403, 'You do not have permission to do this');
  const search = String(req.query.search || '').trim().slice(0, 100);
  const params = search ? [likeEscape(search)] : [];
  const { rows } = await query(
    `SELECT * FROM vendors WHERE status = true ${search ? 'AND (name ILIKE $1 OR company ILIKE $1 OR phone ILIKE $1)' : ''} ORDER BY name LIMIT ${req.query.all === '1' ? 1000 : 20}`,
    params,
  );
  ok(res, rows.map(out));
}));

r.get('/:id', requirePerm('receiving', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Vendor not found');
  const { rows } = await query(`SELECT v.*, ${TOTALS} FROM vendors v WHERE v.id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Vendor not found');
  ok(res, out(rows[0]));
}));

r.post('/', requirePerm('receiving', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  const { rows } = await query(
    `INSERT INTO vendors (name, company, email, phone, address, notes, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.name, b.company, b.email, b.phone, b.address, b.notes, b.status],
  );
  ok(res, out(rows[0]), 'Vendor created', 201);
}));

r.put('/:id', requirePerm('receiving', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Vendor not found');
  const b = validate(schema, req.body, res);
  if (!b) return;
  const { rows } = await query(
    `UPDATE vendors SET name=$1, company=$2, email=$3, phone=$4, address=$5, notes=$6, status=$7, updated_at=now() WHERE id=$8 RETURNING *`,
    [b.name, b.company, b.email, b.phone, b.address, b.notes, b.status, req.params.id],
  );
  if (!rows.length) return fail(res, 404, 'Vendor not found');
  ok(res, out(rows[0]), 'Vendor updated');
}));

r.delete('/:id', requirePerm('receiving', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Vendor not found');
  // Receivings keep the vendor's name, so deleting the vendor never loses purchase history.
  const { rowCount } = await query(`DELETE FROM vendors WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Vendor not found');
  ok(res, null, 'Vendor deleted');
}));

// Pay a vendor: applied to the chosen receiving first (if any), then the oldest open
// receivings; anything left over is kept as credit for the next receiving.
const payDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : new Date().toISOString().slice(0, 10));
r.post('/:id/payments', requirePerm('receiving', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Vendor not found');
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  if (!(amount > 0) || amount > 1e11) return fail(res, 422, 'Enter a valid payment amount greater than 0');
  const result = await tx((client) => payVendor(client, {
    vendorId: req.params.id, amount,
    method: String(req.body?.paymentMethod || 'cash').slice(0, 30),
    date: payDate(req.body?.paymentDate),
    reference: String(req.body?.reference || '').trim().slice(0, 200),
    notes: String(req.body?.notes || '').trim().slice(0, 2000),
    userId: req.user?.id,
    receivingId: isUuid(req.body?.receivingId) ? req.body.receivingId : null,
  }));
  if (result.error) return fail(res, result.status || 400, result.error);
  ok(res, {
    payment: result.payment,
    clearedReceivings: result.applied.map((a) => ({ receivingNumber: a.number, applied: a.applied, status: a.status })),
    creditAdded: result.creditAdded,
    creditBalance: result.creditBalance,
  }, 'Vendor payment recorded');
}));

// Vendor statement: returns vendor summary, receivings, and payment history
r.get('/:id/statement', requirePerm('receiving', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Vendor not found');
  const { rows: vRows } = await query(`SELECT v.*, ${TOTALS} FROM vendors v WHERE v.id=$1`, [req.params.id]);
  if (!vRows.length) return fail(res, 404, 'Vendor not found');
  const vendor = out(vRows[0]);

  const { rows: receivings } = await query(
    `SELECT id, receiving_number, vendor_invoice_no, received_date, total, paid_amount, status
     FROM receivings WHERE vendor_id=$1 ORDER BY received_date DESC, created_at DESC`,
    [vendor.id],
  );

  const { rows: payments } = await query(
    `SELECT id, payment_number, amount, payment_date, payment_method, reference, notes, created_at
     FROM vendor_payments WHERE vendor_id=$1 ORDER BY payment_date DESC, created_at DESC`,
    [vendor.id],
  );

  ok(res, { vendor, receivings, payments });
}));

export default r;
