// What the returns against an invoice did with its money.
//   returned: value of everything that came back
//   credited: the part taken off the invoice itself. It counts in the invoice's paid_amount, but it
//             is goods that came back, not money.
//   refunded: cash handed back to the customer
// Returns saved before these amounts were recorded (applied_amount / refund_amount NULL) count a
// refund as all cash and an applied credit as all taken off the invoice.

// For a query over `returns` (alias optional), grouped per invoice or for one invoice.
export const RETURN_SUMS = `
  coalesce(sum(total), 0) AS returned,
  coalesce(sum(coalesce(applied_amount, CASE WHEN settlement = 'credit' AND applied THEN total ELSE 0 END)), 0) AS credited,
  coalesce(sum(coalesce(refund_amount, CASE WHEN settlement = 'refund' THEN total ELSE 0 END)), 0) AS refunded`;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// `db` is a pg client or { query }.
export async function returnMoney(db, invoiceId) {
  const { rows } = await db.query(`SELECT ${RETURN_SUMS} FROM returns WHERE invoice_id = $1`, [invoiceId]);
  return { returned: round2(rows[0].returned), credited: round2(rows[0].credited), refunded: round2(rows[0].refunded) };
}

// Money (and stored credit) really paid on an invoice and not refunded yet: what a refund may hand back.
export function moneyPaid(paidAmount, { credited, refunded }) {
  const paid = round2(paidAmount || 0);
  return Math.max(0, round2(paid - Math.min(paid, credited) - refunded));
}
