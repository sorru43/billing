import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm } from '../auth.js';
import { config } from '../config.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';
import { getSetting } from '../settings.js';
import { invoicePdf } from '../pdf.js';
import { invoiceEmail } from '../archive.js';
import { receiveCustomerPayment, useCustomerCredit } from '../balance.js';

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
  status: z.enum(['unpaid', 'paid', 'partial']).default('unpaid'),
  paidAmount: z.coerce.number().min(0).default(0),
  payment: z
    .object({
      isNotPaid: z.boolean().default(false),
      cash: z.coerce.number().min(0).default(0),
      cheque: z.coerce.number().min(0).default(0),
      chequeNumber: z.string().trim().max(100).default(''),
      check: z.coerce.number().min(0).default(0),
      checkNumber: z.string().trim().max(100).default(''),
      bank: z.coerce.number().min(0).default(0),
      bankReference: z.string().trim().max(100).default(''),
      zelle: z.coerce.number().min(0).default(0),
      card: z.coerce.number().min(0).default(0),
      cardReference: z.string().trim().max(100).default(''),
      other: z.coerce.number().min(0).default(0),
      otherNote: z.string().trim().max(200).default(''),
    })
    .optional(),
  customerId: z.string().uuid().optional().or(z.literal('')).or(z.null()).transform((v) => v || null),
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
  customerId: i.customer_id,
  total: i.total,
  paidAmount: i.paid_amount != null ? Number(i.paid_amount) : 0,
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
  // Admin setting: allow selling more than is in stock (stock then goes below zero until received).
  const allowOversell = (await getSetting('inventory')).allowOutOfStockSales === true;
  const result = await tx(async (client) => {
    const ids = [...new Set(b.items.map((i) => i.productId))];
    // Lock the product rows so two invoices cannot oversell the same stock.
    const { rows: products } = await client.query(`SELECT p.*, m.status AS matrix_status FROM products p LEFT JOIN product_matrices m ON m.id = p.matrix_id
        WHERE p.id = ANY($1::uuid[]) FOR UPDATE OF p`, [ids]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const needed = new Map();
    for (const it of b.items) needed.set(it.productId, (needed.get(it.productId) || 0) + it.quantity);

    const errors = {};
    b.items.forEach((it, idx) => {
      const p = byId.get(it.productId);
      if (!p || !p.status || p.matrix_status === false) errors[`items.${idx}.productId`] = 'Product not found or inactive';
      else if (!allowOversell && needed.get(p.id) > p.quantity) errors[`items.${idx}.quantity`] = `Only ${p.quantity} of "${p.name}" in stock`;
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
    // Link to the saved customer: the one picked, else a match by email, else by a unique exact name.
    let customerId = null;
    if (b.customerId) customerId = (await client.query(`SELECT id FROM customers WHERE id=$1`, [b.customerId])).rows[0]?.id || null;
    if (!customerId && b.customerEmail) {
      customerId = (await client.query(`SELECT id FROM customers WHERE lower(email)=lower($1)`, [b.customerEmail])).rows[0]?.id || null;
    }
    if (!customerId) {
      const m = (await client.query(`SELECT id FROM customers WHERE lower(trim(name))=lower(trim($1)) LIMIT 2`, [b.customerName])).rows;
      if (m.length === 1) customerId = m[0].id;
    }
    const payEntries = [];
    const notPaid = Boolean(b.payment?.isNotPaid);
    if (b.payment && !notPaid) {
      const {
        cash = 0, cheque = 0, chequeNumber = '', check = 0, checkNumber = '', bank = 0, bankReference = '',
        zelle = 0, card = 0, cardReference = '', other = 0, otherNote = '',
      } = b.payment;
      const chqAmt = cheque || check;
      const chqNum = chequeNumber || checkNumber;
      if (cash > 0) payEntries.push({ method: 'cash', amount: round2(cash), reference: '', notes: 'Cash' });
      if (chqAmt > 0) payEntries.push({ method: 'check', amount: round2(chqAmt), reference: chqNum, notes: chqNum ? `Check #${chqNum}` : 'Check' });
      // the invoice screen fills bank and zelle with the same value: count it once
      const bankAmt = bank || zelle;
      if (bankAmt > 0) payEntries.push({ method: 'bank_transfer', amount: round2(bankAmt), reference: bankReference, notes: bankReference ? `Bank/Zelle Ref: ${bankReference}` : 'Bank / Zelle' });
      if (card > 0) payEntries.push({ method: 'card', amount: round2(card), reference: cardReference, notes: cardReference ? `Card Ref: ${cardReference}` : 'Credit/Debit Card' });
      if (other > 0) payEntries.push({ method: 'other', amount: round2(other), reference: otherNote, notes: otherNote ? `Other: ${otherNote}` : 'Other payment' });
    } else if (!notPaid && b.paidAmount > 0) {
      payEntries.push({ method: 'cash', amount: round2(b.paidAmount), reference: '', notes: 'Cash' });
    }
    const markedPaid = !notPaid && !payEntries.length && b.status === 'paid' && total > 0;

    // With no saved customer there is nowhere to keep extra money, so payment is capped at the invoice total.
    let initialPaid = 0;
    if (!customerId && !notPaid) {
      const entered = round2(payEntries.reduce((t, x) => t + x.amount, 0));
      initialPaid = markedPaid ? total : Math.min(total, entered);
    }
    const initialStatus = initialPaid >= total && total > 0 ? 'paid' : initialPaid > 0 ? 'partial' : 'unpaid';

    const number = await nextNumber(client, false);
    let { rows } = await client.query(
      `INSERT INTO invoices (invoice_number, invoice_date, due_date, customer_name, customer_email, customer_phone, customer_address,
                             price_level, items, subtotal, discount_total, tax_total, total, paid_amount, notes, status, created_by, expires_at, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now() + make_interval(hours => $18), $19) RETURNING *`,
      [number, b.invoiceDate, b.dueDate, b.customerName, b.customerEmail, b.customerPhone, b.customerAddress, b.priceLevel,
       JSON.stringify(items), round2(subtotal), round2(discountTotal), round2(taxTotal), total, initialPaid, b.notes, initialStatus, req.user.id,
       config.invoiceRetentionHours, customerId],
    );
    const invoiceId = rows[0].id;

    // Keep sales records in sync (settlement below updates this row too)
    await client.query(
      `INSERT INTO customer_sales_records (invoice_id, invoice_number, customer_id, customer_name, invoice_date, total, paid_amount, status, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [invoiceId, number, customerId, b.customerName, b.invoiceDate, total, initialPaid, initialStatus, JSON.stringify(items)],
    );

    if (customerId) {
      // Credit from an earlier overpayment pays this invoice first.
      await useCustomerCredit(client, customerId, invoiceId);
      if (markedPaid) {
        const due = round2(total - Number((await client.query(`SELECT paid_amount FROM invoices WHERE id=$1`, [invoiceId])).rows[0].paid_amount));
        if (due > 0) payEntries.push({ method: 'other', amount: due, reference: '', notes: 'Marked paid' });
      }
      // Extra money is carried to older bills / credit only when the cashier picked the saved
      // customer (the payment screen says so). For an auto-matched customer it is change, so cap it.
      if (b.customerId !== customerId) {
        let due = round2(total - Number((await client.query(`SELECT paid_amount FROM invoices WHERE id=$1`, [invoiceId])).rows[0].paid_amount));
        for (const p of payEntries) { p.amount = Math.min(p.amount, Math.max(0, due)); due = round2(due - p.amount); }
      }
      // Each payment goes to this invoice first; any extra clears older bills, then becomes credit.
      for (const p of payEntries.filter((x) => x.amount > 0)) {
        await receiveCustomerPayment(client, {
          customerId, amount: p.amount, method: p.method, date: b.invoiceDate, reference: p.reference,
          notes: `Invoice ${number}: ${p.notes}`, userId: req.user.id, invoiceId,
        });
      }
      rows = (await client.query(`SELECT * FROM invoices WHERE id=$1`, [invoiceId])).rows;
    } else {
      for (const p of payEntries) {
        const pSeq = (await client.query(`SELECT nextval('customer_payment_seq') AS n`)).rows[0].n;
        await client.query(
          `INSERT INTO customer_payments (payment_number, customer_id, customer_name, amount, payment_date, payment_method, reference, notes, created_by)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
          [`PAY_${String(pSeq).padStart(6, '0')}`, b.customerName, p.amount, b.invoiceDate, p.method, p.reference, `Invoice ${number}: ${p.notes}`, req.user.id],
        );
      }
    }

    return { invoice: rows[0] };
  });
  if (result.errors) return fail(res, 422, 'Please fix the highlighted items', result.errors);
  ok(res, fullOut(result.invoice), 'Invoice created', 201);
}));

r.patch('/:id/status', requirePerm('invoices', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const status = req.body?.status;
  if (!['paid', 'unpaid', 'partial'].includes(status)) return fail(res, 422, 'Invalid status');

  // ONLY Admin (user_type === 1) can mark an invoice as unpaid
  if (status === 'unpaid' && req.user?.user_type !== 1) {
    return fail(res, 403, 'Only administrators can mark an invoice as unpaid');
  }

  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  const inv = rows[0];

  if (status === 'unpaid') {
    await query(`UPDATE invoices SET status='unpaid', paid_amount=0 WHERE id=$1`, [inv.id]);
    await query(`UPDATE customer_sales_records SET status='unpaid', paid_amount=0 WHERE invoice_id=$1`, [inv.id]);
    return ok(res, null, 'Invoice marked unpaid');
  }

  const total = Number(inv.total);
  const currentPaid = Number(inv.paid_amount) || 0;
  const due = round2(total - currentPaid);
  const requested = req.body?.amount != null ? round2(Number(req.body.amount)) : due;
  if (!(requested > 0)) return fail(res, 422, due > 0 ? 'Enter a payment amount greater than 0' : 'This invoice is already paid');
  const method = String(req.body?.paymentMethod || 'cash').slice(0, 30);
  const reference = String(req.body?.reference || '').trim().slice(0, 200);
  const note = String(req.body?.notes || '').trim().slice(0, 2000);
  const pDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.paymentDate || '') ? req.body.paymentDate : new Date().toISOString().slice(0, 10);

  if (inv.customer_id) {
    // Saved customer: this invoice first, then older bills, then credit. Nothing is dropped.
    const result = await tx((client) => receiveCustomerPayment(client, {
      customerId: inv.customer_id, amount: requested, method, date: pDate, reference,
      notes: `Invoice ${inv.invoice_number}${reference ? ` (${reference})` : ''}${note ? ` - ${note}` : ''}`,
      userId: req.user?.id, invoiceId: inv.id,
    }));
    if (result.error) return fail(res, result.status || 400, result.error);
    return ok(res, {
      clearedInvoices: result.applied.map((a) => ({ invoiceNumber: a.number, applied: a.applied, status: a.status })),
      creditAdded: result.creditAdded,
      creditBalance: result.creditBalance,
    }, 'Payment recorded');
  }

  // No saved customer: there is nowhere to carry extra money, so cap at what this invoice owes.
  if (due <= 0) return fail(res, 422, 'This invoice is already paid');
  const payAmount = Math.min(due, requested);
  const newPaid = round2(currentPaid + payAmount);
  const newStatus = newPaid >= total ? 'paid' : 'partial';
  await query(`UPDATE invoices SET status=$1, paid_amount=$2 WHERE id=$3`, [newStatus, newPaid, inv.id]);
  await query(`UPDATE customer_sales_records SET status=$1, paid_amount=$2 WHERE invoice_id=$3`, [newStatus, newPaid, inv.id]);
  const pSeq = (await query(`SELECT nextval('customer_payment_seq') AS n`)).rows[0].n;
  await query(
    `INSERT INTO customer_payments (payment_number, customer_id, customer_name, amount, payment_date, payment_method, reference, notes, created_by)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
    [`PAY_${String(pSeq).padStart(6, '0')}`, inv.customer_name, payAmount, pDate, method, reference,
     `Invoice ${inv.invoice_number}${reference ? ` (${reference})` : ''}${note ? ` - ${note}` : ''}`, req.user?.id || null],
  );
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

// Delete invoice from active invoices table (Admin only).
// Sale record is permanently retained in customer_sales_records so total sale value is never lost.
r.delete('/:id', requirePerm('invoices', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  const inv = rows[0];

  // Mark sales ledger record as deleted invoice, keeping the sale value permanently recorded
  await query(
    `UPDATE customer_sales_records SET invoice_deleted = true WHERE invoice_id = $1 OR invoice_number = $2`,
    [inv.id, inv.invoice_number],
  );

  // Delete from active invoices table
  await query(`DELETE FROM invoices WHERE id=$1`, [inv.id]);
  ok(res, null, 'Invoice deleted. Sale value is recorded and preserved in Sales Reports.');
}));

export default r;
