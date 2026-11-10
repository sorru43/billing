// Shared money-in / money-out settlement for customers and vendors.
//
// A payment is applied to the bill it was taken against first (if any), then to
// the oldest open bills (FIFO). Whatever is left after every bill is cleared is
// kept as credit on the customer/vendor and used up automatically by their next
// invoice/receiving. Nothing a person pays is ever dropped.
//
// Every function takes a pg client that is already inside a transaction.

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

const SIDES = {
  customer: {
    owner: 'customers',
    bills: 'invoices',
    ownerCol: 'customer_id',
    order: 'invoice_date ASC, created_at ASC',
    number: 'invoice_number',
    // invoices also mirror into the permanent sales ledger
    after: (client, id, paid, status) =>
      client.query(`UPDATE customer_sales_records SET paid_amount = $1, status = $2 WHERE invoice_id = $3`, [paid, status, id]),
  },
  vendor: {
    owner: 'vendors',
    bills: 'receivings',
    ownerCol: 'vendor_id',
    order: 'received_date ASC, created_at ASC',
    number: 'receiving_number',
    after: async () => {},
  },
};

// Apply `amount` to open bills of one owner. Returns { applied: [...], leftover }.
async function settle(client, side, ownerId, amount, firstBillId) {
  const s = SIDES[side];
  const { rows: bills } = await client.query(
    `SELECT id, ${s.number} AS number, total, coalesce(paid_amount, 0) AS paid_amount
       FROM ${s.bills}
      WHERE ${s.ownerCol} = $1 AND status <> 'paid'
      ORDER BY (id = $2) DESC, ${s.order}
      FOR UPDATE`,
    [ownerId, firstBillId || '00000000-0000-0000-0000-000000000000'],
  );
  let remaining = round2(amount);
  const applied = [];
  for (const b of bills) {
    if (remaining <= 0) break;
    const total = Number(b.total);
    const due = round2(total - Number(b.paid_amount));
    if (due <= 0) continue;
    const pay = Math.min(remaining, due);
    const paid = round2(Number(b.paid_amount) + pay);
    const status = paid >= total ? 'paid' : 'partial';
    await client.query(`UPDATE ${s.bills} SET paid_amount = $1, status = $2 WHERE id = $3`, [paid, status, b.id]);
    await s.after(client, b.id, paid, status);
    applied.push({ id: b.id, number: b.number, applied: pay, status });
    remaining = round2(remaining - pay);
  }
  return { applied, leftover: Math.max(0, remaining) };
}

async function lockOwner(client, side, ownerId) {
  const { rows } = await client.query(`SELECT * FROM ${SIDES[side].owner} WHERE id = $1 FOR UPDATE`, [ownerId]);
  return rows[0] || null;
}

// Money received from a customer. Records one payment row, settles bills, stores any excess as credit.
export async function receiveCustomerPayment(client, { customerId, amount, method, date, reference = '', notes = '', userId, invoiceId }) {
  const customer = await lockOwner(client, 'customer', customerId);
  if (!customer) return { error: 'Customer not found', status: 404 };
  const seq = (await client.query(`SELECT nextval('customer_payment_seq') AS n`)).rows[0].n;
  const { rows } = await client.query(
    `INSERT INTO customer_payments (payment_number, customer_id, customer_name, amount, payment_date, payment_method, reference, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [`PAY_${String(seq).padStart(6, '0')}`, customer.id, customer.name, round2(amount), date, method, reference, notes, userId || null],
  );
  const { applied, leftover } = await settle(client, 'customer', customer.id, amount, invoiceId);
  if (leftover > 0) {
    await client.query(`UPDATE customers SET credit_balance = credit_balance + $1 WHERE id = $2`, [leftover, customer.id]);
  }
  return { payment: rows[0], applied, creditAdded: leftover, creditBalance: round2(Number(customer.credit_balance) + leftover) };
}

// Money paid to a vendor. Same rules as customers.
export async function payVendor(client, { vendorId, amount, method, date, reference = '', notes = '', userId, receivingId }) {
  const vendor = await lockOwner(client, 'vendor', vendorId);
  if (!vendor) return { error: 'Vendor not found', status: 404 };
  const seq = (await client.query(`SELECT nextval('vendor_payment_seq') AS n`)).rows[0].n;
  const { rows } = await client.query(
    `INSERT INTO vendor_payments (payment_number, vendor_id, vendor_name, amount, payment_date, payment_method, reference, notes, receiving_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [`VPAY_${String(seq).padStart(6, '0')}`, vendor.id, vendor.name, round2(amount), date, method, reference, notes, receivingId || null, userId || null],
  );
  const { applied, leftover } = await settle(client, 'vendor', vendor.id, amount, receivingId);
  if (leftover > 0) {
    await client.query(`UPDATE vendors SET credit_balance = credit_balance + $1 WHERE id = $2`, [leftover, vendor.id]);
  }
  return { payment: rows[0], applied, creditAdded: leftover, creditBalance: round2(Number(vendor.credit_balance) + leftover) };
}

// Use up stored credit against open bills (called right after a new invoice/receiving is saved).
async function useCredit(client, side, ownerId, firstBillId) {
  const owner = await lockOwner(client, side, ownerId);
  const credit = round2(owner?.credit_balance || 0);
  if (!owner || credit <= 0) return 0;
  const { leftover } = await settle(client, side, ownerId, credit, firstBillId);
  await client.query(`UPDATE ${SIDES[side].owner} SET credit_balance = $1 WHERE id = $2`, [leftover, ownerId]);
  return round2(credit - leftover);
}
export const useCustomerCredit = (client, customerId, invoiceId) => useCredit(client, 'customer', customerId, invoiceId);
export const useVendorCredit = (client, vendorId, receivingId) => useCredit(client, 'vendor', vendorId, receivingId);
