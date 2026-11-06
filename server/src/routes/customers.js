import express, { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok, fail, validate, paging, pagination, isUuid, likeEscape } from '../http.js';
import { toCsv } from '../pdf.js';

const r = Router();

const LEVELS = ['selling', 'top_customer', 'jobber'];
const MAX_IMPORT_ROWS = 5000;

const fields = {
  name: z.string().trim().min(1, 'Customer name is required').max(200),
  company: z.string().trim().max(200).default(''),
  email: z.string().trim().toLowerCase().max(200).email('Invalid email').optional().or(z.literal('')).transform((v) => v || ''),
  phone: z.string().trim().max(30, 'Phone is too long (max 30)').default(''),
  address: z.string().trim().max(1000).default(''),
  taxNumber: z.string().trim().max(50).default(''),
  priceLevel: z.enum(LEVELS, { message: 'Price level must be Selling, Top Customer or Jobber' }).default('selling'),
  notes: z.string().max(5000).default(''),
  status: z.boolean().default(true),
};
const schema = z.object(fields);

const out = (c) => ({
  id: c.id, name: c.name, company: c.company, email: c.email, phone: c.phone, address: c.address,
  taxNumber: c.tax_number, priceLevel: c.price_level, notes: c.notes, status: c.status, createdAt: c.created_at,
});

// Combined invoice totals per customer. Credit returns reduce what the customer owes.
const TOTALS_SQL = `
  (SELECT count(*)::int FROM invoices i WHERE i.customer_id = c.id) AS inv_count,
  (SELECT coalesce(sum(total), 0) FROM invoices i WHERE i.customer_id = c.id) AS inv_total,
  (SELECT coalesce(sum(CASE WHEN i.status = 'paid' THEN i.total ELSE coalesce(i.paid_amount, 0) END), 0) FROM invoices i WHERE i.customer_id = c.id) AS inv_paid,
  (SELECT coalesce(sum(CASE WHEN i.status = 'paid' THEN 0 ELSE (i.total - coalesce(i.paid_amount, 0)) END), 0) FROM invoices i WHERE i.customer_id = c.id) AS inv_unpaid,
  (SELECT coalesce(sum(total), 0) FROM returns rt WHERE rt.customer_id = c.id AND rt.settlement = 'credit') AS credits`;
const round2 = (n) => Math.round(n * 100) / 100;
const totalsOut = (c) => {
  const unpaid = round2(Number(c.inv_unpaid) || 0);
  const credits = round2(Number(c.credits) || 0);
  return {
    invoiceCount: c.inv_count,
    total: round2(Number(c.inv_total) || 0),
    paid: round2(Number(c.inv_paid) || 0),
    unpaid,
    credits,
    balance: Math.max(0, round2(unpaid - credits)),
  };
};

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0').max(1e11),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').default(() => new Date().toISOString().slice(0, 10)),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'cheque', 'other']).default('cash'),
  notes: z.string().max(2000).default(''),
});

const canUpdateBalance = (req) =>
  can(req, 'customers', 'edit') || can(req, 'customers', 'view') || can(req, 'invoices', 'edit') || can(req, 'invoices', 'create');

const dupEmail = (res) => fail(res, 422, 'A customer with this email already exists', { email: 'A customer with this email already exists' });

r.get('/', requirePerm('customers', 'view'), h(async (req, res) => {
  const { limit, page, offset, search } = paging(req);
  const where = search ? `WHERE name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1` : '';
  const params = search ? [likeEscape(search)] : [];
  const total = (await query(`SELECT count(*)::int n FROM customers ${where}`, params)).rows[0].n;
  const { rows } = await query(
    `SELECT c.*, ${TOTALS_SQL} FROM customers c ${where.replace(/\b(name|company|email|phone) ILIKE/g, 'c.$1 ILIKE')}
      ORDER BY c.created_at DESC, c.name LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  ok(res, { customers: rows.map((c) => ({ ...out(c), totals: totalsOut(c) })), pagination: pagination(total, page, limit) });
}));

// Picker on the invoice screen: invoice creators may search customers without the Customers module.
r.get('/options', h(async (req, res) => {
  if (!can(req, 'customers', 'view') && !can(req, 'invoices', 'create')) return fail(res, 403, 'You do not have permission to do this');
  const search = String(req.query.search || '').trim().slice(0, 100);
  const params = search ? [likeEscape(search)] : [];
  const { rows } = await query(
    `SELECT * FROM customers WHERE status = true ${search ? 'AND (name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)' : ''}
      ORDER BY name LIMIT 20`,
    params,
  );
  ok(res, rows.map(out));
}));

const LEVEL_LABELS = {
  selling: 'Selling Price',
  top_customer: 'Top Customer Price',
  jobber: 'Jobber Price',
};

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Name' }, { key: 'company', label: 'Company' }, { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Address' }, { key: 'taxNumber', label: 'Tax Number' },
  { key: 'priceLevel', label: 'Price Level' }, { key: 'notes', label: 'Notes' }, { key: 'statusText', label: 'Status' },
];

r.get('/export', requirePerm('customers', 'view'), h(async (req, res) => {
  const { rows } = await query(`SELECT * FROM customers ORDER BY name`);
  const csv = toCsv(EXPORT_COLUMNS, rows.map((c) => ({
    ...out(c),
    priceLevel: LEVEL_LABELS[c.price_level] || c.price_level,
    statusText: c.status ? 'Active' : 'Inactive',
  })));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv); // BOM so Excel opens UTF-8 correctly
}));

r.get('/:id', requirePerm('customers', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Customer not found');
  const { rows } = await query(`SELECT * FROM customers WHERE id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Customer not found');
  ok(res, out(rows[0]));
}));

// Customer statement: combined totals plus their unpaid and paid invoices and returns.
r.get('/:id/statement', requirePerm('customers', 'view'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Customer not found');
  const { rows } = await query(`SELECT c.*, ${TOTALS_SQL} FROM customers c WHERE c.id=$1`, [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Customer not found');
  const inv = (await query(
    `SELECT id, invoice_number, invoice_date, due_date, total, coalesce(paid_amount, 0) AS paid_amount, status, created_at FROM invoices
      WHERE customer_id=$1 ORDER BY invoice_date DESC, created_at DESC LIMIT 1000`,
    [req.params.id],
  )).rows.map((i) => ({
    id: i.id, invoiceNumber: i.invoice_number, invoiceDate: i.invoice_date, dueDate: i.due_date,
    total: i.total, paidAmount: i.paid_amount, status: i.status, createdAt: i.created_at,
  }));
  const rets = (await query(
    `SELECT id, return_number, invoice_number, settlement, total, created_at FROM returns WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 500`,
    [req.params.id],
  )).rows.map((x) => ({ id: x.id, returnNumber: x.return_number, invoiceNumber: x.invoice_number, settlement: x.settlement, total: x.total, createdAt: x.created_at }));
  const payments = (await query(
    `SELECT id, payment_number, amount, payment_date, payment_method, notes, created_at FROM customer_payments
      WHERE customer_id=$1 ORDER BY payment_date DESC, created_at DESC LIMIT 500`,
    [req.params.id],
  )).rows.map((p) => ({
    id: p.id, paymentNumber: p.payment_number, amount: p.amount, paymentDate: p.payment_date,
    paymentMethod: p.payment_method, notes: p.notes, createdAt: p.created_at,
  }));
  ok(res, {
    customer: out(rows[0]),
    totals: totalsOut(rows[0]),
    unpaid: inv.filter((i) => i.status !== 'paid'),
    paid: inv.filter((i) => i.status === 'paid'),
    returns: rets,
    payments,
  });
}));

// Update customer balance: records payment and deducts from unpaid bills (FIFO: oldest bill first)
r.post('/:id/payments', h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Customer not found');
  if (!canUpdateBalance(req)) return fail(res, 403, 'You do not have permission to update customer balance');

  const b = validate(paymentSchema, req.body, res);
  if (!b) return;

  const result = await tx(async (client) => {
    const { rows: custRows } = await client.query(`SELECT * FROM customers WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!custRows.length) return { error: 'Customer not found', status: 404 };
    const customer = custRows[0];

    const pSeq = (await client.query(`SELECT nextval('customer_payment_seq') AS n`)).rows[0].n;
    const paymentNumber = `PAY_${String(pSeq).padStart(6, '0')}`;

    const { rows: payRows } = await client.query(
      `INSERT INTO customer_payments (payment_number, customer_id, customer_name, amount, payment_date, payment_method, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [paymentNumber, customer.id, customer.name, b.amount, b.paymentDate, b.paymentMethod, b.notes, req.user?.id || null],
    );

    // Oldest bill first (FIFO): clear older pending bills before newer ones
    const { rows: invoices } = await client.query(
      `SELECT id, invoice_number, total, coalesce(paid_amount, 0) AS paid_amount, status
       FROM invoices
       WHERE customer_id = $1 AND status <> 'paid'
       ORDER BY invoice_date ASC, created_at ASC
       FOR UPDATE`,
      [customer.id],
    );

    let remaining = b.amount;
    const clearedInvoices = [];

    for (const inv of invoices) {
      if (remaining <= 0) break;
      const invTotal = Number(inv.total);
      const currentPaid = Number(inv.paid_amount);
      const due = round2(invTotal - currentPaid);
      if (due <= 0) continue;

      const toPay = Math.min(remaining, due);
      const newPaid = round2(currentPaid + toPay);
      const newStatus = newPaid >= invTotal ? 'paid' : 'partial';

      await client.query(
        `UPDATE invoices SET paid_amount = $1, status = $2 WHERE id = $3`,
        [newPaid, newStatus, inv.id],
      );

      // Keep sales record table synchronized if record exists
      await client.query(
        `UPDATE customer_sales_records SET paid_amount = $1, status = $2 WHERE invoice_id = $3`,
        [newPaid, newStatus, inv.id],
      );

      clearedInvoices.push({
        invoiceNumber: inv.invoice_number,
        applied: toPay,
        status: newStatus,
      });

      remaining = round2(remaining - toPay);
    }

    return {
      payment: payRows[0],
      clearedInvoices,
      unallocatedAmount: remaining > 0 ? remaining : 0,
    };
  });

  if (result.error) return fail(res, result.status || 400, result.error);
  ok(res, result, 'Customer balance updated successfully');
}));

r.post('/', requirePerm('customers', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  try {
    const { rows } = await query(
      `INSERT INTO customers (name, company, email, phone, address, tax_number, price_level, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.name, b.company, b.email, b.phone, b.address, b.taxNumber, b.priceLevel, b.notes, b.status],
    );
    ok(res, out(rows[0]), 'Customer created', 201);
  } catch (e) {
    if (e.code === '23505') return dupEmail(res);
    throw e;
  }
}));

r.put('/:id', requirePerm('customers', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Customer not found');
  const b = validate(schema, req.body, res);
  if (!b) return;
  try {
    const { rows } = await query(
      `UPDATE customers SET name=$1, company=$2, email=$3, phone=$4, address=$5, tax_number=$6, price_level=$7, notes=$8, status=$9, updated_at=now()
        WHERE id=$10 RETURNING *`,
      [b.name, b.company, b.email, b.phone, b.address, b.taxNumber, b.priceLevel, b.notes, b.status, req.params.id],
    );
    if (!rows.length) return fail(res, 404, 'Customer not found');
    ok(res, out(rows[0]), 'Customer updated');
  } catch (e) {
    if (e.code === '23505') return dupEmail(res);
    throw e;
  }
}));

r.patch('/:id/status', requirePerm('customers', 'edit'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Customer not found');
  if (typeof req.body?.status !== 'boolean') return fail(res, 422, 'Invalid status');
  const { rowCount } = await query(`UPDATE customers SET status=$1, updated_at=now() WHERE id=$2`, [req.body.status, req.params.id]);
  if (!rowCount) return fail(res, 404, 'Customer not found');
  ok(res, null, 'Customer status updated');
}));

r.delete('/:id', requirePerm('customers', 'delete'), h(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'Customer not found');
  const { rowCount } = await query(`DELETE FROM customers WHERE id=$1`, [req.params.id]);
  if (!rowCount) return fail(res, 404, 'Customer not found');
  ok(res, null, 'Customer deleted');
}));

// ---------------------------------------------------------------- Import

// RFC 4180 CSV parser (quoted fields, doubled quotes, newlines inside quotes).
// The delimiter is detected from the header line so Excel's ";" exports work too.
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delim = [',', ';', '\t'].reduce((a, d) => (firstLine.split(d).length > firstLine.split(a).length ? d : a), ',');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_ALIASES = {
  name: ['name', 'customername', 'customer', 'fullname', 'client', 'clientname', 'contactname', 'contact'],
  firstName: ['firstname', 'first', 'givenname'],
  lastName: ['lastname', 'last', 'surname', 'familyname'],
  company: ['company', 'companyname', 'business', 'businessname', 'organisation', 'organization', 'firm'],
  email: ['email', 'emailaddress', 'mail', 'emailid'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'mobileno', 'phoneno', 'telephone', 'tel', 'contactnumber', 'contactno', 'whatsapp', 'cell'],
  address: ['address', 'billingaddress', 'streetaddress', 'fulladdress', 'location'],
  taxNumber: ['taxnumber', 'taxno', 'trn', 'vat', 'vatnumber', 'vatno', 'taxid', 'gst', 'gstin', 'tin'],
  priceLevel: ['pricelevel', 'pricetier', 'level', 'customertype', 'pricetype'],
  notes: ['notes', 'note', 'remarks', 'remark', 'comments', 'comment'],
  status: ['status', 'active'],
};
const ALIAS_TO_FIELD = Object.fromEntries(Object.entries(HEADER_ALIASES).flatMap(([f, as]) => as.map((a) => [a, f])));

const parseLevel = (v) => {
  const s = norm(v);
  if (!s || ['1', 'selling', 'sellingprice', 'retail', 'standard', 'normal', 'default'].includes(s)) return 'selling';
  if (['2', 'top', 'topcustomer', 'topcustomerprice', 'vip', 'wholesale'].includes(s)) return 'top_customer';
  if (['3', 'jobber', 'jobberprice', 'trade', 'dealer'].includes(s)) return 'jobber';
  return v; // left as-is so validation reports it
};
const parseStatus = (v) => !['inactive', 'disabled', 'no', 'false', '0', 'n', 'off'].includes(norm(v));
// Undo the formula-injection guard our own export adds ("'+971..." -> "+971...").
const clean = (v) => String(v ?? '').replace(/^'(?=[=+\-@])/, '').trim();

const importBody = express.text({ type: () => true, limit: '3mb' });

r.post('/import', requirePerm('customers', 'create'), importBody, h(async (req, res) => {
  const mode = req.query.mode === 'update' ? 'update' : 'skip';
  const dryRun = req.query.dryRun === '1';
  if (mode === 'update' && !can(req, 'customers', 'edit')) return fail(res, 403, 'Updating existing customers needs edit permission');
  if (typeof req.body !== 'string' || !req.body.trim()) return fail(res, 422, 'The file is empty');

  const table = parseCsv(req.body).filter((row) => row.some((c) => String(c).trim() !== ''));
  if (table.length < 2) return fail(res, 422, 'The file needs a header row and at least one customer');
  const header = table[0].map((h) => ALIAS_TO_FIELD[norm(h)] || null);
  if (!header.includes('name') && !header.includes('firstName') && !header.includes('company')) {
    return fail(res, 422, 'No name column found. The first row must contain column headings such as Name, Email, Phone.');
  }
  const body = table.slice(1);
  if (body.length > MAX_IMPORT_ROWS) return fail(res, 422, `Too many rows (${body.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`);

  const errors = [];
  const valid = [];
  const seenEmails = new Map();
  body.forEach((cells, i) => {
    const line = i + 2; // spreadsheet row number (header is row 1)
    const raw = {};
    header.forEach((f, j) => { if (f && raw[f] === undefined) raw[f] = clean(cells[j]); });
    const name = raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || raw.company || '';
    const parsed = schema.safeParse({
      name, company: raw.company || '', email: raw.email || '', phone: raw.phone || '', address: raw.address || '',
      taxNumber: raw.taxNumber || '', priceLevel: parseLevel(raw.priceLevel), notes: raw.notes || '',
      status: raw.status === undefined ? true : parseStatus(raw.status),
    });
    if (!parsed.success) {
      errors.push({ row: line, name, message: [...new Set(parsed.error.issues.map((x) => x.message))].join('; ') });
      return;
    }
    const c = parsed.data;
    // Match key: the email, or name + phone for customers without an email.
    const key = c.email ? `e:${c.email}` : `n:${c.name.toLowerCase()}|${c.phone}`;
    if (seenEmails.has(key)) {
      errors.push({ row: line, name, message: `${c.email ? 'Same email' : 'Same name and phone'} as row ${seenEmails.get(key)}` });
      return;
    }
    seenEmails.set(key, line);
    valid.push({ ...c, key, row: line });
  });

  const summary = await tx(async (client) => {
    const emails = valid.filter((c) => c.email).map((c) => c.email);
    const names = valid.filter((c) => !c.email).map((c) => c.name.toLowerCase());
    const { rows: existing } = await client.query(
      `SELECT id, CASE WHEN email <> '' THEN 'e:' || lower(email) ELSE 'n:' || lower(name) || '|' || phone END AS key
         FROM customers WHERE lower(email) = ANY($1::text[]) OR (email = '' AND lower(name) = ANY($2::text[]))`,
      [emails, names],
    );
    const byKey = new Map(existing.map((e) => [e.key, e.id]));
    let created = 0, updated = 0, skipped = 0;
    for (const c of valid) {
      const id = byKey.get(c.key);
      if (id && mode === 'skip') { skipped++; continue; }
      if (id) {
        updated++;
        if (dryRun) continue;
        // Blank cells keep the current value, so a partial sheet never wipes data.
        await client.query(
          `UPDATE customers SET name=$1, company=COALESCE(NULLIF($2,''),company), phone=COALESCE(NULLIF($3,''),phone),
                  address=COALESCE(NULLIF($4,''),address), tax_number=COALESCE(NULLIF($5,''),tax_number), price_level=$6,
                  notes=COALESCE(NULLIF($7,''),notes), status=$8, updated_at=now() WHERE id=$9`,
          [c.name, c.company, c.phone, c.address, c.taxNumber, c.priceLevel, c.notes, c.status, id],
        );
      } else {
        created++;
        if (dryRun) continue;
        await client.query(
          `INSERT INTO customers (name, company, email, phone, address, tax_number, price_level, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [c.name, c.company, c.email, c.phone, c.address, c.taxNumber, c.priceLevel, c.notes, c.status],
        );
      }
    }
    return { created, updated, skipped };
  });

  const columns = [...new Set(header.filter(Boolean))];
  const ignored = table[0].filter((h, j) => h.trim() && !header[j]);
  const result = {
    dryRun, mode, totalRows: body.length, ...summary, failed: errors.length,
    errors: errors.slice(0, 200), columns, ignoredColumns: ignored,
    preview: valid.slice(0, 5).map(({ row, key, ...c }) => c),
  };
  const msg = dryRun
    ? 'Preview ready'
    : `Imported: ${summary.created} added, ${summary.updated} updated, ${summary.skipped} skipped, ${errors.length} with errors`;
  ok(res, result, msg);
}));

export default r;
