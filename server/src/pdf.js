import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogo } from './logos.js';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const FONT = path.join(ASSETS, 'DejaVuSans.ttf'); // Unicode font, used for all PDF text
const FONT_BOLD = path.join(ASSETS, 'DejaVuSans-Bold.ttf');
const LOGO = path.join(ASSETS, 'wise-logo.png');
const RED = '#cc1f1a';

// The custom invoice logo if one is set (fitted into a box so wide logos don't overlap the title).
async function drawLogo(doc, x, y, h) {
  try {
    const custom = await getLogo('invoice');
    if (custom) return void doc.image(custom.buffer, x, y, { fit: [h * 4.5, h] });
  } catch (e) {
    console.error('invoice logo failed, using default:', e.message);
  }
  doc.image(LOGO, x, y, { height: h });
}
const GRAY = '#4b5563';

export const PRICE_LEVELS = {
  selling: 'Selling Price',
  top_customer: 'Top Customer Price',
  jobber: 'Jobber Price',
};

const money = (sym, n) =>
  `${sym}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-';

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function newDoc(layout = 'portrait') {
  const doc = new PDFDocument({ size: 'A4', layout, margin: 40 });
  doc.registerFont('body', FONT);
  doc.registerFont('bold', FONT_BOLD);
  doc.font('body');
  return doc;
}

// Simple table renderer with page breaks and a repeated header row.
function table(doc, { columns, rows, startY }) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalW = columns.reduce((a, c) => a + c.width, 0);
  const cols = columns.map((c) => ({ ...c, w: (c.width / totalW) * width }));
  let y = startY;

  const header = () => {
    doc.rect(left, y, width, 22).fill('#111111');
    let x = left;
    doc.font('bold').fontSize(9).fillColor('#ffffff');
    for (const c of cols) {
      doc.text(c.label, x + 6, y + 6, { width: c.w - 12, align: c.align || 'left' });
      x += c.w;
    }
    y += 22;
    doc.font('body').fillColor('#111111');
  };
  header();

  rows.forEach((r, i) => {
    doc.fontSize(9);
    const h = Math.max(20, ...cols.map((c) => doc.heightOfString(String(r[c.key] ?? ''), { width: c.w - 12 }) + 10));
    if (y + h > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    if (i % 2 === 1) doc.rect(left, y, width, h).fill('#f3f4f6');
    let x = left;
    doc.fillColor('#111111');
    for (const c of cols) {
      doc.text(String(r[c.key] ?? ''), x + 6, y + 5, { width: c.w - 12, align: c.align || 'left' });
      x += c.w;
    }
    y += h;
  });
  if (rows.length === 0) {
    doc.fontSize(9).fillColor(GRAY).text('No records found', left, y + 8, { width, align: 'center' });
    y += 28;
  }
  return y;
}

export async function invoicePdf(inv, company) {
  const sym = '$';
  const doc = newDoc();
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;

  await drawLogo(doc, L, 36, 44);
  doc.font('bold').fontSize(22).fillColor('#111111').text('INVOICE', L, 40, { width: W, align: 'right' });
  doc.font('body').fontSize(10).fillColor(GRAY)
    .text(`Invoice No: ${inv.invoice_number}`, L, 70, { width: W, align: 'right' })
    .text(`Invoice Date: ${fmtDate(inv.invoice_date)}`, { width: W, align: 'right' })
    .text(`Due Date: ${fmtDate(inv.due_date)}`, { width: W, align: 'right' });

  const boxY = 140;
  doc.font('bold').fontSize(11).fillColor(RED).text('Bill From', L, boxY);
  doc.font('body').fontSize(10).fillColor('#111111')
    .text(company.companyName || '', L, boxY + 16, { width: W / 2 - 10 })
    .fillColor(GRAY)
    .text([company.address, company.email, company.phone].filter(Boolean).join('\n'), { width: W / 2 - 10 });
  doc.font('bold').fontSize(11).fillColor(RED).text('Bill To', L + W / 2, boxY);
  doc.font('body').fontSize(10).fillColor('#111111')
    .text(inv.customer_name, L + W / 2, boxY + 16, { width: W / 2 })
    .fillColor(GRAY)
    .text([inv.customer_address, inv.customer_email, inv.customer_phone].filter(Boolean).join('\n'), { width: W / 2 });

  let y = Math.max(doc.y, boxY + 80) + 16;
  y = table(doc, {
    startY: y,
    columns: [
      { key: 'name', label: 'Item', width: 22 },
      { key: 'description', label: 'Description', width: 33 },
      { key: 'quantity', label: 'Quantity', width: 11, align: 'right' },
      { key: 'rate', label: 'Price', width: 14, align: 'right' },
      { key: 'amount', label: 'Total', width: 15, align: 'right' },
    ],
    rows: inv.items.map((it) => ({
      name: it.barcode ? `${it.name}\n${it.barcode}` : it.name,
      description: it.description || '',
      quantity: it.quantity,
      rate: money(sym, it.rate),
      amount: money(sym, it.amount),
    })),
  });

  if (y > doc.page.height - 200) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  const sx = L + W - 230;
  y += 14;
  const line = (label, value, bold) => {
    doc.font(bold ? 'bold' : 'body').fontSize(bold ? 12 : 10).fillColor(bold ? '#111111' : GRAY);
    doc.text(label, sx, y, { width: 110 });
    doc.text(value, sx + 110, y, { width: 120, align: 'right' });
    y += bold ? 22 : 17;
  };
  doc.moveTo(sx, y).lineTo(sx + 230, y).lineWidth(1.5).strokeColor('#111111').stroke();
  y += 8;
  line('Invoice Total', money(sym, inv.total), true);
  doc.font('body').fontSize(10).fillColor(GRAY).text(`Status: ${String(inv.status).toUpperCase()}`, sx, y, { width: 230, align: 'right' });

  if (inv.notes) {
    doc.font('bold').fontSize(11).fillColor('#111111').text('Notes', L, y + 30);
    doc.font('body').fontSize(10).fillColor(GRAY).text(inv.notes, L, doc.y + 4, { width: W });
  }
  return toBuffer(doc);
}

// Purchase order sent to a vendor: our company as the buyer, priced at cost.
export async function purchaseOrderPdf(po, vendor, company) {
  const sym = '$';
  const doc = newDoc();
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;

  await drawLogo(doc, L, 36, 44);
  doc.font('bold').fontSize(20).fillColor('#111111').text('PURCHASE ORDER', L, 40, { width: W, align: 'right' });
  doc.font('body').fontSize(10).fillColor(GRAY)
    .text(`PO No: ${po.po_number}`, L, 70, { width: W, align: 'right' })
    .text(`Order Date: ${fmtDate(po.order_date)}`, { width: W, align: 'right' });

  const boxY = 130;
  doc.font('bold').fontSize(11).fillColor(RED).text('Ordered By', L, boxY);
  doc.font('body').fontSize(10).fillColor('#111111')
    .text(company.companyName || '', L, boxY + 16, { width: W / 2 - 10 })
    .fillColor(GRAY)
    .text([company.address, company.email, company.phone].filter(Boolean).join('\n'), { width: W / 2 - 10 });
  doc.font('bold').fontSize(11).fillColor(RED).text('Vendor', L + W / 2, boxY);
  doc.font('body').fontSize(10).fillColor('#111111')
    .text(po.vendor_name, L + W / 2, boxY + 16, { width: W / 2 })
    .fillColor(GRAY)
    .text([vendor.company, vendor.address, vendor.email, vendor.phone].filter(Boolean).join('\n'), { width: W / 2 });

  let y = Math.max(doc.y, boxY + 80) + 16;
  y = table(doc, {
    startY: y,
    columns: [
      { key: 'n', label: '#', width: 5 },
      { key: 'name', label: 'Item', width: 40 },
      { key: 'barcode', label: 'Barcode', width: 18 },
      { key: 'quantity', label: 'Qty', width: 9, align: 'right' },
      { key: 'cost', label: 'Cost', width: 13, align: 'right' },
      { key: 'amount', label: 'Total', width: 15, align: 'right' },
    ],
    rows: po.items.map((it, i) => ({
      n: i + 1, name: it.name, barcode: it.barcode || '', quantity: it.quantity, cost: money(sym, it.cost), amount: money(sym, it.amount),
    })),
  });
  if (y > doc.page.height - 160) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  const sx = L + W - 230;
  y += 14;
  doc.moveTo(sx, y).lineTo(sx + 230, y).lineWidth(1.5).strokeColor('#111111').stroke();
  y += 8;
  doc.font('bold').fontSize(12).fillColor('#111111').text('Order Total', sx, y, { width: 110 });
  doc.text(money(sym, po.total), sx + 110, y, { width: 120, align: 'right' });
  if (po.notes) {
    doc.font('bold').fontSize(11).fillColor('#111111').text('Notes', L, y + 36);
    doc.font('body').fontSize(10).fillColor(GRAY).text(po.notes, L, doc.y + 4, { width: W });
  }
  return toBuffer(doc);
}

export async function reportPdf({ title, subtitle, summary, columns, rows, company }) {
  const doc = newDoc('landscape');
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  await drawLogo(doc, L, 30, 36);
  doc.font('bold').fontSize(18).fillColor('#111111').text(title, L, 34, { width: W, align: 'right' });
  doc.font('body').fontSize(9).fillColor(GRAY)
    .text(subtitle, L, 58, { width: W, align: 'right' })
    .text(`${company.companyName || ''} · Generated ${new Date().toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`, { width: W, align: 'right' });

  let y = 92;
  if (summary?.length) {
    const cw = W / summary.length;
    summary.forEach((s, i) => {
      const x = L + i * cw;
      doc.roundedRect(x + 2, y, cw - 4, 46, 6).strokeColor('#e5e7eb').stroke();
      doc.font('body').fontSize(8).fillColor(GRAY).text(s.label, x + 10, y + 8, { width: cw - 20 });
      doc.font('bold').fontSize(13).fillColor('#111111').text(String(s.value), x + 10, y + 22, { width: cw - 20 });
    });
    y += 60;
  }
  table(doc, { startY: y, columns, rows });
  return toBuffer(doc);
}

export function toCsv(columns, rows) {
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n');
}
