import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';
import { purchaseOrderPdf } from '../pdf.js';
import { sendMail, escapeHtml } from '../mailer.js';
import { getSetting } from '../settings.js';

// Purchase orders: what we plan to order from a vendor, priced at cost, so the total
// is known before ordering. A PO never touches stock or vendor balances. Receiving it
// (Receiving Inventory → "Receive this PO") creates a normal receiving and closes the PO.
// Uses the `receiving` permission (same people who receive stock and manage vendors).

const r = Router();
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const itemsSchema = z
  .array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.coerce.number().int('Whole numbers only').min(1, 'At least 1').max(1e7),
      cost: z.coerce.number().min(0, 'Cost cannot be negative').max(1e9).optional(),
    }),
  )
  .min(1, 'Add at least one product')
  .max(1000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const schema = z.object({
  vendorId: z.string().uuid('Choose a vendor'),
  orderDate: dateSchema,
  notes: z.string().max(5000).default(''),
  items: itemsSchema,
});

// One order split into a PO per vendor (see "Split by vendor" on the create screen).
const batchSchema = z.object({
  orderDate: dateSchema,
  notes: z.string().max(5000).default(''),
  orders: z.array(z.object({ vendorId: z.string().uuid('Choose a vendor'), items: itemsSchema })).min(1, 'Add at least one product').max(100),
});

// Insert one PO inside a transaction. Returns { po } or { errors }.
async function insertPo(client, { vendorId, orderDate, notes, items: rawItems }, userId, errPrefix = 'items') {
  const vendor = (await client.query(`SELECT id, name FROM vendors WHERE id=$1`, [vendorId])).rows[0];
  if (!vendor) return { errors: { vendorId: 'Vendor not found' } };
  // One line per product (the same product picked twice is merged).
  const merged = new Map();
  for (const it of rawItems) {
    const prev = merged.get(it.productId);
    merged.set(it.productId, prev ? { ...prev, quantity: prev.quantity + it.quantity } : { ...it });
  }
  const ids = [...merged.keys()];
  const { rows: prods } = await client.query(
    `SELECT id, name, barcode, cost, quantity FROM products WHERE id = ANY($1::uuid[])`, [ids],
  );
  const byId = Object.fromEntries(prods.map((p) => [p.id, p]));
  const items = [];
  let total = 0;
  for (const [i, it] of [...merged.values()].entries()) {
    const p = byId[it.productId];
    if (!p) return { errors: { [`${errPrefix}.${i}.productId`]: 'Product not found' } };
    const cost = round2(it.cost ?? Number(p.cost));
    const amount = round2(cost * it.quantity);
    total += amount;
    items.push({ productId: p.id, name: p.name, barcode: p.barcode || '', onHand: p.quantity, quantity: it.quantity, cost, amount });
  }
  const n = (await client.query(`SELECT nextval('purchase_order_seq') AS n`)).rows[0].n;
  const { rows } = await client.query(
    `INSERT INTO purchase_orders (po_number, vendor_id, vendor_name, order_date, items, total, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [`PO_${String(n).padStart(6, '0')}`, vendor.id, vendor.name, orderDate, JSON.stringify(items), round2(total), notes, userId],
  );
  return { po: rows[0] };
}

const listOut = (x) => ({
  id: x.id, poNumber: x.po_number, vendorId: x.vendor_id, vendorName: x.vendor_name, orderDate: x.order_date,
  status: x.status, total: Number(x.total), itemCount: Array.isArray(x.items) ? x.items.length : 0,
  receivingId: x.receiving_id, createdAt: x.created_at, emailedAt: x.emailed_at || null, emailedTo: x.emailed_to || '',
});

r.get('/', requirePerm('receiving', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const conds = [];
  const params = [];
  if (search) {
    params.push(likeEscape(search));
    conds.push(`(po_number ILIKE $${params.length} OR vendor_name ILIKE $${params.length})`);
  }
  if (isUuid(req.query.vendorId)) {
    params.push(req.query.vendorId);
    conds.push(`vendor_id = $${params.length}`);
  }
  if (['open', 'received', 'cancelled'].includes(req.query.status)) {
    params.push(req.query.status);
    conds.push(`status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = (await query(`SELECT count(*)::int n FROM purchase_orders ${where}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT * FROM purchase_orders ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, { purchaseOrders: rows.map(listOut), pagination: pagination(total, page, limit) });
}));

r.get('/:id', requirePerm('receiving', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Purchase order not found');
  const { rows } = await query(
    `SELECT po.*, v.company AS vendor_company, v.email AS vendor_email, v.phone AS vendor_phone, v.address AS vendor_address,
            rc.receiving_number
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN receivings rc ON rc.id = po.receiving_id
      WHERE po.id = $1`,
    [req.params.id],
  );
  if (!rows.length) return fail(res, 404, 'Purchase order not found');
  const po = rows[0];
  // Current product data, so "Receive this PO" can fill the receiving screen.
  const ids = po.items.map((i) => i.productId);
  const products = ids.length
    ? (await query(
        `SELECT id, name, barcode, cost, selling_price, top_customer_price, jobber_price, quantity FROM products WHERE id = ANY($1::uuid[])`,
        [ids],
      )).rows
    : [];
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  ok(res, {
    ...listOut(po),
    notes: po.notes,
    receivingNumber: po.receiving_number || null,
    vendor: { company: po.vendor_company || '', email: po.vendor_email || '', phone: po.vendor_phone || '', address: po.vendor_address || '' },
    items: po.items.map((i) => ({ ...i, product: byId[i.productId] || null })),
  });
}));

r.post('/', requirePerm('receiving', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  const result = await tx(async (client) => insertPo(client, b, req.user.id));
  if (result.errors) return fail(res, 422, 'Please fix the highlighted items', result.errors);
  ok(res, listOut(result.po), 'Purchase order created', 201);
}));

// Who sold each product before, and at what cost (from saved receivings with a vendor).
// Per product: one entry per vendor with that vendor's most recent cost, cheapest first;
// equal cost -> most recently bought first. The first entry is the suggested vendor.
r.post('/vendor-prices', requirePerm('receiving', 'view'), h(async (req, res) => {
  const ids = z.array(z.string().uuid()).max(2000).safeParse(req.body?.productIds);
  if (!ids.success) return fail(res, 422, 'Invalid product list');
  if (!ids.data.length) return ok(res, {});
  const { rows } = await query(
    `WITH lines AS (
       SELECT rc.vendor_id, (it->>'productId') AS product_id, (it->>'cost')::numeric AS cost,
              rc.received_date, rc.created_at
         FROM receivings rc CROSS JOIN LATERAL jsonb_array_elements(rc.items) it
        WHERE rc.vendor_id IS NOT NULL AND (it->>'productId') = ANY($1::text[])
     ), latest AS (
       SELECT DISTINCT ON (product_id, vendor_id) product_id, vendor_id, cost, received_date
         FROM lines ORDER BY product_id, vendor_id, received_date DESC, created_at DESC
     ), counts AS (
       SELECT product_id, vendor_id, count(*)::int AS times FROM lines GROUP BY product_id, vendor_id
     )
     SELECT l.product_id, l.vendor_id, v.name AS vendor_name, v.email AS vendor_email, l.cost, l.received_date, c.times
       FROM latest l JOIN counts c USING (product_id, vendor_id) JOIN vendors v ON v.id = l.vendor_id
      WHERE v.status = true
      ORDER BY l.product_id, l.cost ASC, l.received_date DESC, c.times DESC`,
    [ids.data],
  );
  const out = {};
  for (const x of rows) {
    (out[x.product_id] ||= []).push({
      vendorId: x.vendor_id, vendorName: x.vendor_name, vendorEmail: x.vendor_email || '',
      cost: Number(x.cost), lastDate: x.received_date, times: x.times,
    });
  }
  ok(res, out);
}));

// Create one PO per vendor in a single transaction (all or nothing).
r.post('/batch', requirePerm('receiving', 'create'), h(async (req, res) => {
  const b = validate(batchSchema, req.body, res);
  if (!b) return;
  const vendorIds = b.orders.map((o) => o.vendorId);
  if (new Set(vendorIds).size !== vendorIds.length) return fail(res, 422, 'Each vendor can only have one order in a batch');
  let created;
  try {
    created = await tx(async (client) => {
      const list = [];
      for (const [i, o] of b.orders.entries()) {
        const r2 = await insertPo(client, { ...o, orderDate: b.orderDate, notes: b.notes }, req.user.id, `orders.${i}.items`);
        if (r2.errors) throw Object.assign(new Error('abort'), { errors: r2.errors });
        list.push(r2.po);
      }
      return list;
    });
  } catch (e) {
    if (e.errors) return fail(res, 422, 'Please fix the highlighted items', e.errors);
    throw e;
  }
  const emails = Object.fromEntries((await query(`SELECT id, email FROM vendors WHERE id = ANY($1::uuid[])`, [vendorIds])).rows.map((v) => [v.id, v.email || '']));
  ok(res, created.map((po) => ({ ...listOut(po), vendorEmail: emails[po.vendor_id] || '' })), `${created.length} purchase order${created.length === 1 ? '' : 's'} created`, 201);
}));

// Email the PO (PDF attached) to the vendor or another address.
r.post('/:id/email', requirePerm('receiving', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Purchase order not found');
  const to = z.string().trim().email().max(200).safeParse(req.body?.to);
  if (!to.success) return fail(res, 422, 'Enter a valid email address', { to: 'Enter a valid email address' });
  const { rows } = await query(
    `SELECT po.*, v.company AS v_company, v.email AS v_email, v.phone AS v_phone, v.address AS v_address
       FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id WHERE po.id=$1`,
    [req.params.id],
  );
  if (!rows.length) return fail(res, 404, 'Purchase order not found');
  const po = rows[0];
  const company = await getSetting('company');
  try {
    const pdf = await purchaseOrderPdf(po, { company: po.v_company, email: po.v_email, phone: po.v_phone, address: po.v_address }, company);
    const from = company.companyName || 'us';
    const units = po.items.reduce((a, i) => a + i.quantity, 0);
    await sendMail({
      to: to.data,
      subject: `Purchase Order ${po.po_number} from ${from}`,
      text: `Hello ${po.vendor_name},\n\nPlease find attached purchase order ${po.po_number} (${po.items.length} items, ${units} units, total $${Number(po.total).toFixed(2)}).\n${po.notes ? `\nNotes: ${po.notes}\n` : ''}\nPlease confirm availability and delivery date.\n\nThank you,\n${from}`,
      html: `<p>Hello ${escapeHtml(po.vendor_name)},</p><p>Please find attached purchase order <b>${escapeHtml(po.po_number)}</b> (${po.items.length} items, ${units} units, total <b>$${Number(po.total).toFixed(2)}</b>).</p>${po.notes ? `<p><b>Notes:</b> ${escapeHtml(po.notes)}</p>` : ''}<p>Please confirm availability and delivery date.</p><p>Thank you,<br>${escapeHtml(from)}</p>`,
      attachments: [{ filename: `${po.po_number}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
  } catch (e) {
    return fail(res, 502, `Could not send email: ${e.message}`);
  }
  await query(`UPDATE purchase_orders SET emailed_at = now(), emailed_to = $1 WHERE id = $2`, [to.data, po.id]);
  ok(res, { emailedAt: new Date().toISOString(), emailedTo: to.data }, `${po.po_number} emailed to ${to.data}`);
}));

// Cancel or re-open. A received PO can't change (its receiving already moved stock).
r.patch('/:id/status', requirePerm('receiving', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Purchase order not found');
  const status = req.body?.status;
  if (!['open', 'cancelled'].includes(status)) return fail(res, 422, 'Invalid status');
  const { rows } = await query(
    `UPDATE purchase_orders SET status=$1, updated_at=now() WHERE id=$2 AND status <> 'received' RETURNING id`,
    [status, req.params.id],
  );
  if (!rows.length) return fail(res, 409, 'Purchase order not found or already received');
  ok(res, null, status === 'cancelled' ? 'Purchase order cancelled' : 'Purchase order re-opened');
}));

r.delete('/:id', requirePerm('receiving', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Purchase order not found');
  const { rowCount } = await query(`DELETE FROM purchase_orders WHERE id=$1 AND status <> 'received'`, [req.params.id]);
  if (!rowCount) return fail(res, 409, 'Purchase order not found or already received');
  ok(res, null, 'Purchase order deleted');
}));

export default r;
