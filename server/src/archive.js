import { query } from './db.js';
import { getSetting } from './settings.js';
import { config } from './config.js';
import { invoicePdf } from './pdf.js';
import { sendMail, escapeHtml } from './mailer.js';

const fmt = (sym, n) => `${sym}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function invoiceEmail(inv, to, { archive }) {
  const company = await getSetting('company');
  const sym = '$';
  const pdf = await invoicePdf(inv, company);
  const subject = archive
    ? `[Archive] Invoice ${inv.invoice_number} – ${inv.customer_name}`
    : `Invoice ${inv.invoice_number} from ${company.companyName || 'us'}`;
  const intro = archive
    ? `This invoice reached the end of its ${inv.retentionHours ?? 48}-hour retention window and has been removed from the billing app. This email is now the only copy.`
    : `Please find your invoice attached.`;
  await sendMail({
    to,
    subject,
    text: `${intro}\n\nInvoice: ${inv.invoice_number}\nCustomer: ${inv.customer_name}\nTotal: ${fmt(sym, inv.total)}\nStatus: ${inv.status}`,
    html: `<p>${escapeHtml(intro)}</p>
      <table cellpadding="4" style="font-family:sans-serif;font-size:14px">
        <tr><td><b>Invoice</b></td><td>${escapeHtml(inv.invoice_number)}</td></tr>
        <tr><td><b>Customer</b></td><td>${escapeHtml(inv.customer_name)}</td></tr>
        <tr><td><b>Total</b></td><td>${escapeHtml(fmt(sym, inv.total))}</td></tr>
        <tr><td><b>Status</b></td><td>${escapeHtml(inv.status)}</td></tr>
      </table>`,
    attachments: [{ filename: `${inv.invoice_number}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
}

// Email the invoice to the private archive address, then hard-delete it.
// The delete only happens after the email is accepted by the SMTP server, so a
// mail outage never loses an invoice: it stays and is retried.
export async function archiveAndDelete(id) {
  const { rows } = await query(`SELECT * FROM invoices WHERE id = $1`, [id]);
  const inv = rows[0];
  if (!inv) return { ok: false, error: 'Invoice not found' };
  const { archiveEmail } = config;
  if (!archiveEmail) {
    const error = 'No archive email is configured on the server (ARCHIVE_EMAIL in server/.env).';
    await query(`UPDATE invoices SET archive_error = $1 WHERE id = $2`, [error, id]);
    return { ok: false, error };
  }
  try {
    await invoiceEmail(inv, archiveEmail, { archive: true });
  } catch (e) {
    const error = `Email failed: ${String(e.message).slice(0, 300)}`;
    await query(`UPDATE invoices SET archive_attempts = archive_attempts + 1, archive_error = $1 WHERE id = $2`, [error, id]);
    return { ok: false, error };
  }
  await query(`DELETE FROM invoices WHERE id = $1`, [id]);
  return { ok: true };
}

// When an invoice's retention window ends it is emailed to ARCHIVE_EMAIL and
// then deleted. If the email fails it is kept and retried on the next run.
let running = false;
export async function purgeExpiredInvoices() {
  if (running) return;
  running = true;
  try {
    const { rows } = await query(`SELECT id, invoice_number FROM invoices WHERE expires_at <= now() ORDER BY expires_at LIMIT 50`);
    for (const { id, invoice_number } of rows) {
      const r = await archiveAndDelete(id);
      console.log(`[purge] ${invoice_number}: ${r.ok ? 'emailed to archive and deleted' : r.error}`);
    }
  } catch (e) {
    console.error('[purge] failed', e);
  } finally {
    running = false;
  }
}
