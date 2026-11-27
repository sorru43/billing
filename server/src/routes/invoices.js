import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm, requireSuperAdmin, can } from '../auth.js';
import { config } from '../config.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape, isoDate, isIsoDate, BAD_DATE } from '../http.js';
import { getSetting } from '../settings.js';
import { invoicePdf } from '../pdf.js';
import { invoiceEmail, startRetentionWindow } from '../archive.js';
import { receiveCustomerPayment, useCustomerCredit } from '../balance.js';
import { rememberPrices, autoRates } from '../customerPrices.js';
import { returnMoney } from '../returnMoney.js';
import {
  LOCKED_MESSAGE, seesAllInvoices, lockState, openWindow, closeAfterPrint, requestAccess, decideRequest, pendingRequests, hasOpenWindow,
  canOnInvoice, visibleStatuses, noAccessMessage,
} from '../invoiceAccess.js';

const r = Router();
const PRICE_FIELD = { selling: 'selling_price', top_customer: 'top_customer_price', jobber: 'jobber_price' };
const round2 = (n) => Math.round(n * 100) / 100;
const dateStr = isoDate;

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
        // the price was typed on this invoice and should become the saved customer's own price
        remember: z.boolean().default(false),
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
  editedAt: i.edited_at || null,
});

// What a locked-out cashier may see: enough to recognise the invoice and ask for access.
const lockedOut = (i, request) => ({
  id: i.id,
  invoiceNumber: i.invoice_number,
  customerName: i.customer_name,
  invoiceDate: i.invoice_date,
  createdAt: i.created_at,
  locked: true,
  accessRequest: request || null,
});

// Invoice lines and totals from the posted rows. Totals are always computed here; the screen's are display only.
function buildLines(b, byId) {
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
  return {
    items,
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    taxTotal: round2(taxTotal),
    total: round2(subtotal - discountTotal + taxTotal),
  };
}

const pricesNote = (n) => `${n} price${n === 1 ? '' : 's'} saved as this customer's own`;

// Level, for everyone: the picked customer's own level (set on the customer), else Selling. There is no
// level choice on the invoice screen; an edit may keep the level the invoice was saved with.
// Prices, for staff without "Change prices on invoices" (modules.js): each line must be the price the
// screen puts there by itself (autoRates); an edit may also keep a price the product already had on the
// saved invoice. No discounts, and nothing is remembered as a customer price.
// Changes b.priceLevel and the items' remember flags; returns line errors or null.
async function applyPriceRules(client, req, b, byId, saved = null) {
  const picked = b.customerId ? (await client.query(`SELECT price_level FROM customers WHERE id=$1`, [b.customerId])).rows[0] : null;
  const own = picked?.price_level || 'selling';
  if (b.priceLevel !== own && b.priceLevel !== saved?.price_level) b.priceLevel = own;
  if (can(req, 'invoice_prices', 'view')) return null;
  const rateOf = await autoRates(client, { customerId: picked ? b.customerId : null, byId, priceLevel: b.priceLevel });
  const kept = new Map(); // productId -> rates it had on the saved invoice
  for (const it of saved?.items || []) {
    if (!kept.has(it.productId)) kept.set(it.productId, new Set());
    kept.get(it.productId).add(round2(Number(it.rate)));
  }
  const errors = {};
  b.items.forEach((it, idx) => {
    it.remember = false;
    const p = byId.get(it.productId);
    if (!p) return;
    const auto = rateOf(it.productId);
    const rate = round2(it.rate);
    if (rate !== auto && !kept.get(it.productId)?.has(rate)) {
      errors[`items.${idx}.rate`] = `Your role can't change prices: "${p.name}" is ${auto.toFixed(2)}. Remove the line and add it again.`;
    } else if (round2(it.discount) > 0) {
      errors[`items.${idx}.rate`] = `Your role can't give discounts on "${p.name}"`;
    }
  });
  return Object.keys(errors).length ? errors : null;
}

// Link to the saved customer: the one picked, else a match by email, else by a unique exact name.
async function resolveCustomer(client, b) {
  if (b.customerId) {
    const picked = (await client.query(`SELECT id FROM customers WHERE id=$1`, [b.customerId])).rows[0]?.id;
    if (picked) return picked;
  }
  if (b.customerEmail) {
    const byEmail = (await client.query(`SELECT id FROM customers WHERE lower(email)=lower($1)`, [b.customerEmail])).rows[0]?.id;
    if (byEmail) return byEmail;
  }
  const m = (await client.query(`SELECT id FROM customers WHERE lower(trim(name))=lower(trim($1)) LIMIT 2`, [b.customerName])).rows;
  return m.length === 1 ? m[0].id : null;
}

// Opening, printing or emailing one invoice. Its creator (and anyone an admin approved) holds an open
// window on it (invoiceAccess.js) and may, even without View on its status: a create-only cashier
// prints the invoice they just made. Everyone else needs View on its status (Unpaid / Paid) and, if
// locked out of past invoices, an open window too.
async function canOpenInvoice(req, inv) {
  if (await hasOpenWindow(inv.id, req.user.id)) return true;
  if (!canOnInvoice(req, inv.status, 'view')) return false;
  return (await lockState(req, inv.id)).open;
}
const openFailMessage = (req, inv) => (canOnInvoice(req, inv.status, 'view') ? LOCKED_MESSAGE : noAccessMessage(inv.status));
const viewOrCreate = (req, res, next) =>
  can(req, 'invoices', 'view') || can(req, 'invoices', 'create') ? next() : fail(res, 403, 'You do not have permission to do this');

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
  // Only the statuses this role may see (Unpaid / Paid rows); ?status=unpaid|paid narrows it further.
  const only = ['unpaid', 'paid'].includes(req.query.status) ? req.query.status : null;
  const statuses = visibleStatuses(req, only);
  if (seesAllInvoices(req)) {
    const where = `WHERE status = ANY($1::text[])${search ? ' AND (invoice_number ILIKE $2 OR customer_name ILIKE $2 OR customer_email ILIKE $2)' : ''}`;
    const params = search ? [statuses, likeEscape(search)] : [statuses];
    const total = (await query(`SELECT count(*)::int n FROM invoices ${where}`, params)).rows[0].n;
    const { rows } = await query(`SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    return ok(res, { invoices: rows.map(listOut), pagination: pagination(total, page, limit) });
  }
  // Locked-out cashier: invoices they hold an open window for in full, the rest as number + customer only.
  const like = search ? likeEscape(search) : null;
  const total = (await query(
    `SELECT count(*)::int n FROM invoices i WHERE i.status = ANY($1::text[]) ${search ? 'AND (i.invoice_number ILIKE $2 OR i.customer_name ILIKE $2)' : ''}`,
    search ? [statuses, like] : [statuses],
  )).rows[0].n;
  const where = `WHERE i.status = ANY($2::text[])${search ? ' AND (i.invoice_number ILIKE $3 OR i.customer_name ILIKE $3)' : ''}`;
  const params = search ? [req.user.id, statuses, like] : [req.user.id, statuses];
  const { rows } = await query(
    `SELECT i.*, a.status AS access_status, (a.status = 'approved' AND a.view_until > now()) AS access_open
       FROM invoices i LEFT JOIN invoice_access a ON a.invoice_id = i.id AND a.user_id = $1
       ${where} ORDER BY i.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, {
    invoices: rows.map((i) =>
      i.access_open ? { ...listOut(i), locked: false } : lockedOut(i, i.access_status === 'approved' ? null : i.access_status),
    ),
    pagination: pagination(total, page, limit),
  });
}));

// Pending "Request access" taps from locked-out cashiers (admin only).
r.get('/access-requests', requireSuperAdmin, h(async (req, res) => {
  ok(res, await pendingRequests());
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
  // No View on this status (Unpaid / Paid): only its own creator's open window lets them in.
  if (!canOnInvoice(req, rows[0].status, 'view') && !(await hasOpenWindow(rows[0].id, req.user.id))) {
    return fail(res, 403, noAccessMessage(rows[0].status));
  }
  const lock = await lockState(req, rows[0].id);
  if (!lock.open) return ok(res, lockedOut(rows[0], lock.request));
  ok(res, { ...fullOut(rows[0]), locked: false, access: lock.restricted ? { viewUntil: lock.viewUntil } : null });
}));

r.get('/:id/pdf', viewOrCreate, h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  if (!(await canOpenInvoice(req, rows[0]))) return fail(res, 403, openFailMessage(req, rows[0]));
  const pdf = await invoicePdf(rows[0], await getSetting('company'));
  await closeAfterPrint(req, rows[0].id); // a PDF download counts as printing it
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
    Object.assign(errors, (await applyPriceRules(client, req, b, byId)) || {});
    if (Object.keys(errors).length) return { errors };

    const { items, subtotal, discountTotal, taxTotal, total } = buildLines(b, byId);

    for (const [pid, qty] of needed) {
      await client.query(`UPDATE products SET quantity = quantity - $1, updated_at = now() WHERE id = $2`, [qty, pid]);
    }
    const customerId = await resolveCustomer(client, b);
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
    // expires_at starts the retention window now; it only matters once the invoice is paid,
    // and it is restarted (startRetentionWindow) at the moment an unpaid invoice becomes paid.
    let { rows } = await client.query(
      `INSERT INTO invoices (invoice_number, invoice_date, due_date, customer_name, customer_email, customer_phone, customer_address,
                             price_level, items, subtotal, discount_total, tax_total, total, paid_amount, notes, status, created_by, expires_at, customer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now() + make_interval(hours => $18), $19) RETURNING *`,
      [number, b.invoiceDate, b.dueDate, b.customerName, b.customerEmail, b.customerPhone, b.customerAddress, b.priceLevel,
       JSON.stringify(items), round2(subtotal), round2(discountTotal), round2(taxTotal), total, initialPaid, b.notes, initialStatus, req.user.id,
       config.invoiceRetentionHours, customerId],
    );
    const invoiceId = rows[0].id;
    const remembered = await rememberPrices(client, { customerId, items: b.items, byId, priceLevel: b.priceLevel, invoiceNumber: number });
    // The creator can open and print it now; for a locked-out cashier this window closes on the first print.
    await openWindow(client, invoiceId, req.user.id);

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

    return { invoice: rows[0], remembered };
  });
  if (result.errors) return fail(res, 422, 'Please fix the highlighted items', result.errors);
  const msg = result.remembered ? `Invoice created. ${pricesNote(result.remembered)}` : 'Invoice created';
  ok(res, { ...fullOut(result.invoice), pricesRemembered: result.remembered }, msg, 201);
}));

r.patch('/:id/status', requirePerm('invoices', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const status = req.body?.status;
  if (!['paid', 'unpaid', 'partial'].includes(status)) return fail(res, 422, 'Invalid status');

  // ONLY Admin (user_type === 1) can mark an invoice as unpaid
  if (status === 'unpaid' && req.user?.user_type !== 1) {
    return fail(res, 403, 'Only administrators can mark an invoice as unpaid');
  }

  if (status === 'unpaid') {
    // "This money was not received" (wrong click, bounced check): the money counted on the invoice is
    // taken back off it and reversed in the payment history, so the customer owes it again. Goods that
    // came back stay returned: what a credit return took off the invoice is kept.
    const pDate = isIsoDate(req.body?.paymentDate) ? req.body.paymentDate : new Date().toISOString().slice(0, 10);
    const result = await tx(async (client) => {
      const inv = (await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!inv) return { status: 404, message: 'Invoice not found' };
      const total = Number(inv.total);
      const paid = round2(Number(inv.paid_amount) || 0);
      const kept = Math.min(paid, (await returnMoney(client, inv.id)).credited);
      const reversed = round2(paid - kept);
      if (!(reversed > 0)) {
        return { status: 422, message: kept > 0 ? `No money has been paid on this invoice: ${kept.toFixed(2)} of it is covered by returns` : 'Nothing has been paid on this invoice' };
      }
      const newStatus = kept >= total && total > 0 ? 'paid' : kept > 0 ? 'partial' : 'unpaid';
      await client.query(`UPDATE invoices SET status=$1, paid_amount=$2 WHERE id=$3`, [newStatus, kept, inv.id]);
      await client.query(`UPDATE customer_sales_records SET status=$1, paid_amount=$2 WHERE invoice_id=$3`, [newStatus, kept, inv.id]);
      const pSeq = (await client.query(`SELECT nextval('customer_payment_seq') AS n`)).rows[0].n;
      await client.query(
        `INSERT INTO customer_payments (payment_number, customer_id, customer_name, amount, payment_date, payment_method, reference, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, 'other', '', $6, $7)`,
        [`PAY_${String(pSeq).padStart(6, '0')}`, inv.customer_id, inv.customer_name, -reversed, pDate,
         `Invoice ${inv.invoice_number} marked unpaid: payment reversed`, req.user?.id || null],
      );
      return { reversed, kept, newStatus };
    });
    if (result.message) return fail(res, result.status, result.message);
    const keptNote = result.kept > 0 ? ` ${result.kept.toFixed(2)} from returns stays off the invoice.` : '';
    return ok(res, result, `Invoice marked unpaid: ${result.reversed.toFixed(2)} is owed again and reversed in the payment history.${keptNote}`);
  }

  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  const inv = rows[0];
  if (!canOnInvoice(req, inv.status, 'edit')) return fail(res, 403, noAccessMessage(inv.status, 'take payments on'));

  const total = Number(inv.total);
  const currentPaid = Number(inv.paid_amount) || 0;
  const due = round2(total - currentPaid);
  const requested = req.body?.amount != null ? round2(Number(req.body.amount)) : due;
  if (!(requested > 0)) return fail(res, 422, due > 0 ? 'Enter a payment amount greater than 0' : 'This invoice is already paid');
  const method = String(req.body?.paymentMethod || 'cash').slice(0, 30);
  const reference = String(req.body?.reference || '').trim().slice(0, 200);
  const note = String(req.body?.notes || '').trim().slice(0, 2000);
  if (req.body?.paymentDate && !isIsoDate(req.body.paymentDate)) return fail(res, 422, BAD_DATE, { paymentDate: BAD_DATE });
  const pDate = req.body?.paymentDate || new Date().toISOString().slice(0, 10);

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
  if (newStatus === 'paid') await startRetentionWindow({ query }, inv.id);
  const pSeq = (await query(`SELECT nextval('customer_payment_seq') AS n`)).rows[0].n;
  await query(
    `INSERT INTO customer_payments (payment_number, customer_id, customer_name, amount, payment_date, payment_method, reference, notes, created_by)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
    [`PAY_${String(pSeq).padStart(6, '0')}`, inv.customer_name, payAmount, pDate, method, reference,
     `Invoice ${inv.invoice_number}${reference ? ` (${reference})` : ''}${note ? ` - ${note}` : ''}`, req.user?.id || null],
  );
  ok(res, null, 'Invoice status updated');
}));

// --- Editing a saved invoice -------------------------------------------------------------------
// Items, prices, dates, notes and price level can change; the invoice number and payments stay.
// Stock follows the change (old quantities go back, new ones come off). Money already paid stays
// paid: if the new total is lower, a saved customer gets the extra as credit (used on their other
// bills first); for a walk-in the edit is refused, since there is nowhere to keep it.

const editProductOut = (p) => ({
  id: p.id,
  name: p.name,
  barcode: p.barcode || '',
  description: p.description,
  quantity: p.quantity,
  selling_price: p.selling_price,
  top_customer_price: p.top_customer_price,
  jobber_price: p.jobber_price,
  status: p.status,
  matrix: p.matrix_id ? { id: p.matrix_id, name: p.matrix_name, option1: p.option1, option2: p.option2 } : null,
});

async function returnsFor(db, invoiceId) {
  return (await db.query(`SELECT return_number FROM returns WHERE invoice_id = $1 ORDER BY created_at`, [invoiceId])).rows.map((x) => x.return_number);
}

// What the edit screen needs: the invoice plus the current product rows of its lines.
r.get('/:id/edit', requirePerm('invoices', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  const inv = rows[0];
  if (!canOnInvoice(req, inv.status, 'edit')) return fail(res, 403, noAccessMessage(inv.status, 'edit'));
  if (!(await lockState(req, inv.id)).open) return fail(res, 403, LOCKED_MESSAGE);
  const returned = await returnsFor({ query }, inv.id);
  if (returned.length) return fail(res, 422, `Invoice ${inv.invoice_number} has returns (${returned.join(', ')}), so it can't be edited`);
  const ids = [...new Set((inv.items || []).map((it) => it.productId).filter(Boolean))];
  const { rows: products } = await query(
    `SELECT p.*, m.name AS matrix_name FROM products p LEFT JOIN product_matrices m ON m.id = p.matrix_id WHERE p.id = ANY($1::uuid[])`,
    [ids],
  );
  ok(res, { ...fullOut(inv), products: products.map(editProductOut) });
}));

r.put('/:id', requirePerm('invoices', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const b = validate(schema, req.body, res);
  if (!b) return;
  const allowOversell = (await getSetting('inventory')).allowOutOfStockSales === true;

  const result = await tx(async (client) => {
    const inv = (await client.query(`SELECT * FROM invoices WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!inv) return { status: 404, message: 'Invoice not found' };
    if (!canOnInvoice(req, inv.status, 'edit')) return { status: 403, message: noAccessMessage(inv.status, 'edit') };
    if (!(await lockState(req, inv.id)).open) return { status: 403, message: LOCKED_MESSAGE };
    const returned = await returnsFor(client, inv.id);
    if (returned.length) return { status: 422, message: `Invoice ${inv.invoice_number} has returns (${returned.join(', ')}), so it can't be edited` };

    const oldQty = new Map();
    for (const it of inv.items || []) if (it.productId) oldQty.set(it.productId, (oldQty.get(it.productId) || 0) + Number(it.quantity || 0));
    const newQty = new Map();
    for (const it of b.items) newQty.set(it.productId, (newQty.get(it.productId) || 0) + it.quantity);
    const ids = [...new Set([...oldQty.keys(), ...newQty.keys()])];
    const { rows: products } = await client.query(
      `SELECT p.*, m.status AS matrix_status FROM products p LEFT JOIN product_matrices m ON m.id = p.matrix_id
        WHERE p.id = ANY($1::uuid[]) FOR UPDATE OF p`,
      [ids],
    );
    const byId = new Map(products.map((p) => [p.id, p]));

    const errors = {};
    b.items.forEach((it, idx) => {
      const p = byId.get(it.productId);
      const had = oldQty.get(it.productId) || 0;
      // A product already on the invoice may stay even if it has been turned off since.
      if (!p || (!had && (!p.status || p.matrix_status === false))) {
        errors[`items.${idx}.productId`] = 'Product not found or inactive';
        return;
      }
      const want = newQty.get(p.id);
      const available = p.quantity + had; // this invoice's own quantity comes back first
      if (!allowOversell && want > had && want > available) errors[`items.${idx}.quantity`] = `Only ${available} of "${p.name}" available`;
    });
    Object.assign(errors, (await applyPriceRules(client, req, b, byId, inv)) || {});
    if (Object.keys(errors).length) return { status: 422, message: 'Please fix the highlighted items', errors };

    const { items, subtotal, discountTotal, taxTotal, total } = buildLines(b, byId);

    // The saved customer can change only while nothing has been paid (payments belong to that customer).
    let paid = round2(Number(inv.paid_amount) || 0);
    const customerId = paid > 0 ? inv.customer_id : await resolveCustomer(client, b);
    let creditAdded = 0;
    if (paid > total) {
      if (!customerId) {
        return {
          status: 422,
          message: `${round2(paid).toFixed(2)} has already been paid on this invoice, so the new total can't be lower than that for a walk-in customer`,
        };
      }
      creditAdded = round2(paid - total);
      paid = total;
    }
    const status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    for (const id of ids) {
      const delta = (newQty.get(id) || 0) - (oldQty.get(id) || 0);
      if (delta && byId.has(id)) await client.query(`UPDATE products SET quantity = quantity - $1, updated_at = now() WHERE id = $2`, [delta, id]);
    }

    await client.query(
      `UPDATE invoices SET invoice_date=$1, due_date=$2, customer_name=$3, customer_email=$4, customer_phone=$5, customer_address=$6,
              price_level=$7, items=$8, subtotal=$9, discount_total=$10, tax_total=$11, total=$12, paid_amount=$13, status=$14,
              notes=$15, customer_id=$16, edited_at=now(), edited_by=$17
        WHERE id=$18`,
      [b.invoiceDate, b.dueDate, b.customerName, b.customerEmail, b.customerPhone, b.customerAddress, b.priceLevel, JSON.stringify(items),
        subtotal, discountTotal, taxTotal, total, paid, status, b.notes, customerId, req.user.id, inv.id],
    );
    await client.query(
      `UPDATE customer_sales_records SET customer_id=$1, customer_name=$2, invoice_date=$3, total=$4, paid_amount=$5, status=$6, items=$7
        WHERE invoice_id=$8`,
      [customerId, b.customerName, b.invoiceDate, total, paid, status, JSON.stringify(items), inv.id],
    );
    if (status === 'paid' && inv.status !== 'paid') await startRetentionWindow(client, inv.id);
    const remembered = await rememberPrices(client, { customerId, items: b.items, byId, priceLevel: b.priceLevel, invoiceNumber: inv.invoice_number });

    if (customerId) {
      if (creditAdded > 0) await client.query(`UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2`, [creditAdded, customerId]);
      // Their credit (including any just added) pays this invoice first, then their oldest open bills.
      await useCustomerCredit(client, customerId, inv.id);
    }
    const saved = (await client.query(`SELECT * FROM invoices WHERE id=$1`, [inv.id])).rows[0];
    return { invoice: saved, creditAdded, remembered };
  });

  if (!result.invoice) return fail(res, result.status, result.message, result.errors);
  let msg = result.creditAdded > 0
    ? `Invoice updated. ${result.creditAdded.toFixed(2)} paid above the new total went to the customer's credit`
    : 'Invoice updated';
  if (result.remembered) msg += `. ${pricesNote(result.remembered)}`;
  ok(res, { ...fullOut(result.invoice), creditAdded: result.creditAdded, pricesRemembered: result.remembered }, msg);
}));

// Send the invoice to the customer (or another address).
r.post('/:id/email', requirePerm('invoices', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const to = z.string().trim().email().max(200).safeParse(req.body?.to);
  if (!to.success) return fail(res, 422, 'Enter a valid email address', { to: 'Enter a valid email address' });
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  if (!(await canOpenInvoice(req, rows[0]))) return fail(res, 403, openFailMessage(req, rows[0]));
  try {
    await invoiceEmail(rows[0], to.data, { archive: false });
  } catch (e) {
    return fail(res, 502, `Could not send email: ${e.message}`);
  }
  await closeAfterPrint(req, rows[0].id); // emailing it counts as printing it
  ok(res, null, `Invoice emailed to ${to.data}`);
}));

// The Print button calls this before opening the print dialog: a locked-out cashier's window closes.
r.post('/:id/printed', viewOrCreate, h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const inv = (await query(`SELECT id, status FROM invoices WHERE id=$1`, [req.params.id])).rows[0];
  if (!inv) return fail(res, 404, 'Invoice not found');
  if (!(await canOpenInvoice(req, inv))) return fail(res, 403, openFailMessage(req, inv));
  await closeAfterPrint(req, req.params.id);
  ok(res, null, 'Printed');
}));

// A locked-out cashier asks to open an invoice again.
r.post('/:id/access-request', requirePerm('invoices', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const exists = (await query(`SELECT 1 FROM invoices WHERE id=$1`, [req.params.id])).rowCount;
  if (!exists) return fail(res, 404, 'Invoice not found');
  const lock = await lockState(req, req.params.id);
  if (lock.open) return ok(res, null, 'You can already open this invoice');
  await requestAccess(req.params.id, req.user.id);
  ok(res, null, 'Access requested. An admin needs to approve it.');
}));

// Admin approves (opens a window) or declines a cashier's request.
r.post('/:id/access/:userId', requireSuperAdmin, h(async (req, res) => {
  if (!isUuid(req.params.id) || !isUuid(req.params.userId)) return fail(res, 404, 'Request not found');
  const approve = req.body?.approve === true;
  const done = await decideRequest(req.params.id, req.params.userId, approve, req.user.id);
  if (!done) return fail(res, 404, 'This request was already handled or no longer exists');
  ok(res, null, approve ? 'Access approved' : 'Request declined');
}));

// Delete invoice from active invoices table (Admin only).
// Sale record is permanently retained in customer_sales_records so total sale value is never lost.
r.delete('/:id', requirePerm('invoices', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Invoice not found');
  const { rows } = await query(`SELECT * FROM invoices WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Invoice not found');
  const inv = rows[0];
  if (!canOnInvoice(req, inv.status, 'delete')) return fail(res, 403, noAccessMessage(inv.status, 'delete'));
  if (!(await lockState(req, inv.id)).open) return fail(res, 403, LOCKED_MESSAGE);

  // Mark sales ledger record as deleted invoice, keeping the sale value permanently recorded
  await query(
    `UPDATE customer_sales_records SET invoice_deleted = true WHERE invoice_id = $1 OR (invoice_id IS NULL AND invoice_number = $2)`,
    [inv.id, inv.invoice_number],
  );

  // Delete from active invoices table
  await query(`DELETE FROM invoices WHERE id=$1`, [inv.id]);
  ok(res, null, 'Invoice deleted. Sale value is recorded and preserved in Sales Reports.');
}));

export default r;
