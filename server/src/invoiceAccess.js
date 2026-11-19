import { query } from './db.js';
import { can } from './auth.js';

// Cashier invoice lock.
// Staff whose role lacks "See past invoices" (module invoice_history) can open an invoice only
// while they hold an open window for it:
//   - the one they get when they create the invoice, or
//   - one an admin approves after they tap "Request access".
// A window closes on the first print, PDF download or email (after a short grace, because the
// browser may fetch the PDF more than once), or ACCESS_MINUTES after it opened, whichever is first.
// Admins and roles with "See past invoices" are never locked.

export const ACCESS_MINUTES = 30;
const PRINT_GRACE_SECONDS = 60;

export const LOCKED_MESSAGE = 'This invoice is locked. Ask an admin to approve access to open it again.';

export const seesAllInvoices = (req) => can(req, 'invoice_history', 'view');

// { restricted, open, viewUntil, request: 'requested' | 'declined' | null }
export async function lockState(req, invoiceId) {
  if (seesAllInvoices(req)) return { restricted: false, open: true, viewUntil: null, request: null };
  const { rows } = await query(
    `SELECT status, view_until, (status = 'approved' AND view_until > now()) AS open
       FROM invoice_access WHERE invoice_id = $1 AND user_id = $2`,
    [invoiceId, req.user.id],
  );
  const a = rows[0];
  return {
    restricted: true,
    open: Boolean(a?.open),
    viewUntil: a?.open ? a.view_until : null,
    request: a && a.status !== 'approved' ? a.status : null,
  };
}

// Opens (or reopens) a window for this user. decidedBy is the approving admin, null for the creator.
export const openWindow = (db, invoiceId, userId, decidedBy = null) =>
  db.query(
    `INSERT INTO invoice_access (invoice_id, user_id, status, view_until, decided_by, decided_at)
     VALUES ($1, $2, 'approved', now() + make_interval(mins => $3), $4::uuid, CASE WHEN $4::uuid IS NULL THEN NULL ELSE now() END)
     ON CONFLICT (invoice_id, user_id) DO UPDATE
       SET status = 'approved', view_until = EXCLUDED.view_until, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at`,
    [invoiceId, userId, ACCESS_MINUTES, decidedBy],
  );

// First print / PDF / email: the window closes after the grace period.
export async function closeAfterPrint(req, invoiceId) {
  if (seesAllInvoices(req)) return;
  await query(
    `UPDATE invoice_access SET view_until = least(view_until, now() + make_interval(secs => $3))
      WHERE invoice_id = $1 AND user_id = $2 AND status = 'approved'`,
    [invoiceId, req.user.id, PRINT_GRACE_SECONDS],
  );
}

export const requestAccess = (invoiceId, userId) =>
  query(
    `INSERT INTO invoice_access (invoice_id, user_id, status, requested_at) VALUES ($1, $2, 'requested', now())
     ON CONFLICT (invoice_id, user_id) DO UPDATE
       SET status = 'requested', requested_at = now(), view_until = NULL, decided_by = NULL, decided_at = NULL`,
    [invoiceId, userId],
  );

// Approve or decline a pending request. Returns false when there is no pending request.
export async function decideRequest(invoiceId, userId, approve, adminId) {
  const pending = await query(
    `SELECT 1 FROM invoice_access WHERE invoice_id = $1 AND user_id = $2 AND status = 'requested'`,
    [invoiceId, userId],
  );
  if (!pending.rowCount) return false;
  if (approve) await openWindow({ query }, invoiceId, userId, adminId);
  else {
    await query(
      `UPDATE invoice_access SET status = 'declined', decided_by = $3, decided_at = now() WHERE invoice_id = $1 AND user_id = $2`,
      [invoiceId, userId, adminId],
    );
  }
  return true;
}

export async function pendingRequests() {
  const { rows } = await query(
    `SELECT a.invoice_id, a.user_id, a.requested_at, i.invoice_number, i.customer_name, i.total, i.status,
            u.first_name, u.last_name, u.email
       FROM invoice_access a
       JOIN invoices i ON i.id = a.invoice_id
       JOIN users u ON u.id = a.user_id
      WHERE a.status = 'requested'
      ORDER BY a.requested_at`,
  );
  return rows.map((r) => ({
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    customerName: r.customer_name,
    total: r.total,
    status: r.status,
    userId: r.user_id,
    userName: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
    requestedAt: r.requested_at,
  }));
}
