import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate } from '../http.js';
import { getSetting } from '../settings.js';
import { reportPdf, toCsv, PRICE_LEVELS } from '../pdf.js';
import { sendMail } from '../mailer.js';

// Reports are generated in memory, emailed as PDF + CSV, and discarded.
// Nothing about a report (contents, file, or history) is stored.
const r = Router();

export const REPORT_TYPES = {
  sales: 'Sales Report',
  inventory: 'Inventory Report',
  'low-stock': 'Low Stock Report',
  'out-of-stock': 'Out of Stock Report',
  'price-list': 'Price List',
};

const schema = z.object({
  type: z.enum(Object.keys(REPORT_TYPES)),
  to: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  threshold: z.coerce.number().int().min(0).max(1e6).default(5),
});

const n2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function build(b, sym) {
  const money = (n) => `${sym}${n2(n)}`;
  const catFilter = b.categoryId ? ` AND p.category_id = '${b.categoryId}'` : ''; // validated uuid
  const productSql = (extra) =>
    `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE true ${catFilter} ${extra} ORDER BY p.name`;

  if (b.type === 'sales') {
    const params = [];
    let where = 'WHERE true';
    if (b.from) { params.push(b.from); where += ` AND invoice_date >= $${params.length}`; }
    if (b.until) { params.push(b.until); where += ` AND invoice_date <= $${params.length}`; }
    const { rows } = await query(`SELECT * FROM invoices ${where} ORDER BY invoice_date, invoice_number`, params);
    const revenue = rows.reduce((a, i) => a + i.total, 0);
    const paid = rows.filter((i) => i.status === 'paid').reduce((a, i) => a + i.total, 0);
    return {
      subtitle: `Invoices ${b.from || 'any date'} → ${b.until || 'today'} (only invoices still inside the retention window)`,
      summary: [
        { label: 'Invoices', value: rows.length },
        { label: 'Total Revenue', value: money(revenue) },
        { label: 'Paid', value: money(paid) },
        { label: 'Unpaid', value: money(revenue - paid) },
      ],
      columns: [
        { key: 'number', label: 'Invoice ID', width: 14 },
        { key: 'date', label: 'Date', width: 11 },
        { key: 'customer', label: 'Customer', width: 22 },
        { key: 'level', label: 'Price Level', width: 16 },
        { key: 'items', label: 'Items', width: 7, align: 'right' },
        { key: 'total', label: 'Total', width: 14, align: 'right' },
        { key: 'status', label: 'Status', width: 9 },
      ],
      rows: rows.map((i) => ({
        number: i.invoice_number,
        date: new Date(i.invoice_date).toISOString().slice(0, 10),
        customer: i.customer_name,
        level: PRICE_LEVELS[i.price_level],
        items: i.items.reduce((a, it) => a + it.quantity, 0),
        total: money(i.total),
        status: i.status,
      })),
    };
  }

  const extra = { inventory: '', 'price-list': 'AND p.status = true', 'low-stock': `AND p.quantity > 0 AND p.quantity <= ${b.threshold}`, 'out-of-stock': 'AND p.quantity <= 0' }[b.type];
  const { rows } = await query(productSql(extra));

  if (b.type === 'price-list') {
    return {
      subtitle: 'Active products and their three price levels',
      summary: [{ label: 'Products', value: rows.length }],
      columns: [
        { key: 'name', label: 'Product', width: 26 },
        { key: 'barcode', label: 'Barcode', width: 14 },
        { key: 'category', label: 'Category', width: 14 },
        { key: 'p1', label: 'Selling (1)', width: 12, align: 'right' },
        { key: 'p2', label: 'Top Customer (2)', width: 13, align: 'right' },
        { key: 'p3', label: 'Jobber (3)', width: 12, align: 'right' },
      ],
      rows: rows.map((p) => ({
        name: p.name, barcode: p.barcode || '', category: p.category_name || 'N/A',
        p1: money(p.selling_price), p2: money(p.top_customer_price), p3: money(p.jobber_price),
      })),
    };
  }

  const stockValue = rows.reduce((a, p) => a + Math.max(p.quantity, 0) * p.cost, 0);
  const retailValue = rows.reduce((a, p) => a + Math.max(p.quantity, 0) * p.selling_price, 0);
  return {
    subtitle: {
      inventory: 'All products with stock on hand and valuation',
      'low-stock': `Products with 1–${b.threshold} units left`,
      'out-of-stock': 'Products with no stock',
    }[b.type],
    summary: [
      { label: 'Products', value: rows.length },
      { label: 'Units in Stock', value: rows.reduce((a, p) => a + Math.max(p.quantity, 0), 0) },
      { label: 'Stock Value (Cost)', value: money(stockValue) },
      { label: 'Stock Value (Selling)', value: money(retailValue) },
    ],
    columns: [
      { key: 'name', label: 'Product', width: 24 },
      { key: 'barcode', label: 'Barcode', width: 13 },
      { key: 'category', label: 'Category', width: 13 },
      { key: 'qty', label: 'Quantity', width: 9, align: 'right' },
      { key: 'cost', label: 'Cost', width: 11, align: 'right' },
      { key: 'selling', label: 'Selling (1)', width: 11, align: 'right' },
      { key: 'value', label: 'Stock Value', width: 12, align: 'right' },
    ],
    rows: rows.map((p) => ({
      name: p.name, barcode: p.barcode || '', category: p.category_name || 'N/A', qty: p.quantity,
      cost: money(p.cost), selling: money(p.selling_price), value: money(Math.max(p.quantity, 0) * p.cost),
    })),
  };
}

r.get('/types', requirePerm('reports', 'view'), h(async (req, res) => {
  const { archiveEmail } = await getSetting('email');
  ok(res, { types: REPORT_TYPES, defaultRecipient: archiveEmail || req.user.email });
}));

r.post('/send', requirePerm('reports', 'create'), h(async (req, res) => {
  const b = validate(schema, req.body, res);
  if (!b) return;
  const company = await getSetting('company');
  const report = await build(b, company.currencySymbol || '₹');
  const title = REPORT_TYPES[b.type];
  const pdf = await reportPdf({ title, company, ...report });
  const csv = toCsv(report.columns, report.rows);
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    await sendMail({
      to: b.to,
      subject: `${title} – ${company.companyName || 'Billing'} – ${stamp}`,
      text: `${title}\n${report.subtitle}\n\n${report.summary.map((s) => `${s.label}: ${s.value}`).join('\n')}\n\nPDF and CSV attached. This report is not stored in the app.`,
      attachments: [
        { filename: `${b.type}-report-${stamp}.pdf`, content: pdf, contentType: 'application/pdf' },
        { filename: `${b.type}-report-${stamp}.csv`, content: csv, contentType: 'text/csv' },
      ],
    });
  } catch (e) {
    return fail(res, 502, `Could not send the report: ${e.message}`);
  }
  ok(res, { rows: report.rows.length }, `${title} sent to ${b.to}`);
}));

export default r;
