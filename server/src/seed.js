import { query, pool } from './db.js';

const round2 = (n) => Math.round(n * 100) / 100;

async function seed() {
  console.log('Seeding sample data...');

  const userRes = await query('SELECT id FROM users LIMIT 1');
  const userId = userRes.rows[0]?.id || null;

  // 1. Categories
  const catNames = [
    { name: 'Disposables & Vapes', slug: 'disposables-vapes' },
    { name: 'E-Liquids & Salts', slug: 'e-liquids-salts' },
    { name: 'Devices & Kits', slug: 'devices-kits' },
    { name: 'Accessories & Coils', slug: 'accessories-coils' },
  ];
  const catMap = new Map();
  for (const c of catNames) {
    const { rows } = await query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, slug`,
      [c.name, c.slug]
    );
    catMap.set(c.slug, rows[0].id);
  }

  // 2. Products
  const sampleProducts = [
    {
      name: 'Geek Bar Pulse 15000 - Blue Razz Ice',
      cost: 11.50,
      selling: 24.99,
      topCustomer: 21.00,
      jobber: 17.50,
      quantity: 120,
      barcode: '890123456701',
      category: 'disposables-vapes',
    },
    {
      name: 'Raz CA6000 - Strawberry Kiwi',
      cost: 8.50,
      selling: 18.99,
      topCustomer: 15.50,
      jobber: 13.00,
      quantity: 95,
      barcode: '890123456702',
      category: 'disposables-vapes',
    },
    {
      name: 'Lost Mary OS5000 - Watermelon Ice',
      cost: 9.00,
      selling: 19.99,
      topCustomer: 16.50,
      jobber: 14.00,
      quantity: 80,
      barcode: '890123456703',
      category: 'disposables-vapes',
    },
    {
      name: 'Pod Juice Salt 30ml - Jewel Mint 50mg',
      cost: 6.00,
      selling: 14.99,
      topCustomer: 12.00,
      jobber: 9.50,
      quantity: 150,
      barcode: '890123456704',
      category: 'e-liquids-salts',
    },
    {
      name: 'Naked 100 Salt 30ml - Hawaiian POG',
      cost: 6.25,
      selling: 15.49,
      topCustomer: 12.50,
      jobber: 10.00,
      quantity: 110,
      barcode: '890123456705',
      category: 'e-liquids-salts',
    },
    {
      name: 'Uwell Caliburn G3 Pod Kit',
      cost: 16.00,
      selling: 34.99,
      topCustomer: 29.00,
      jobber: 24.00,
      quantity: 45,
      barcode: '890123456706',
      category: 'devices-kits',
    },
    {
      name: 'Caliburn G3 Replacement Pods (4-Pack)',
      cost: 7.00,
      selling: 16.99,
      topCustomer: 14.00,
      jobber: 11.50,
      quantity: 75,
      barcode: '890123456707',
      category: 'accessories-coils',
    },
  ];

  const productRows = [];
  for (const p of sampleProducts) {
    const { rows } = await query(
      `INSERT INTO products (name, cost, selling_price, top_customer_price, jobber_price, quantity, barcode, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (barcode) DO UPDATE SET
         name = EXCLUDED.name, cost = EXCLUDED.cost, selling_price = EXCLUDED.selling_price,
         top_customer_price = EXCLUDED.top_customer_price, jobber_price = EXCLUDED.jobber_price,
         quantity = EXCLUDED.quantity
       RETURNING id, name, selling_price, top_customer_price, jobber_price`,
      [p.name, p.cost, p.selling, p.topCustomer, p.jobber, p.quantity, p.barcode, catMap.get(p.category)]
    );
    productRows.push(rows[0]);
  }

  // 3. Customers
  const sampleCustomers = [
    {
      name: 'Moe',
      company: 'tor',
      email: 'moe@tor.local',
      phone: '+1 416-555-0199',
      address: '100 King St W, Toronto, ON',
      priceLevel: 'top_customer',
    },
    {
      name: 'Sourabh Jhamb',
      company: 'wise',
      email: 'sourabh@wise.local',
      phone: '+1 647-555-0144',
      address: '450 Bay St, Toronto, ON',
      priceLevel: 'selling',
    },
    {
      name: 'Alex Rivera',
      company: 'Apex Wholesale',
      email: 'alex@apexwholesale.local',
      phone: '+1 905-555-0188',
      address: '220 Industrial Pkwy, Mississauga, ON',
      priceLevel: 'jobber',
    },
    {
      name: 'Sarah Chen',
      company: 'Metro Mart',
      email: 'sarah@metromart.local',
      phone: '+1 416-555-0122',
      address: '88 Queen St E, Toronto, ON',
      priceLevel: 'top_customer',
    },
  ];

  const custMap = new Map();
  for (const c of sampleCustomers) {
    const existing = await query('SELECT id FROM customers WHERE lower(name) = lower($1)', [c.name]);
    let custId;
    if (existing.rows.length) {
      custId = existing.rows[0].id;
      await query(
        `UPDATE customers SET company=$1, email=$2, phone=$3, address=$4, price_level=$5 WHERE id=$6`,
        [c.company, c.email, c.phone, c.address, c.priceLevel, custId]
      );
    } else {
      const { rows } = await query(
        `INSERT INTO customers (name, company, email, phone, address, price_level, status)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
        [c.name, c.company, c.email, c.phone, c.address, c.priceLevel]
      );
      custId = rows[0].id;
    }
    custMap.set(c.name, custId);
  }

  // 4. Invoices matching customer balances
  // Clean prior sample invoices for these customers to ensure exact matching amounts
  for (const [name, id] of custMap.entries()) {
    await query('DELETE FROM invoices WHERE customer_id = $1', [id]);
  }

  const p0 = productRows[0];
  const p1 = productRows[1];
  const p2 = productRows[2];

  // Helper to insert an invoice
  async function addInvoice({ number, date, custName, total, paidAmount, status, notes }) {
    const custId = custMap.get(custName);
    const item = {
      productId: p0.id,
      description: p0.name,
      quantity: 1,
      rate: total,
      discount: 0,
      taxRate: 0,
    };
    const res = await query(
      `INSERT INTO invoices (
        invoice_number, invoice_date, customer_name, customer_email, customer_phone,
        price_level, items, subtotal, discount_total, tax_total, total, paid_amount,
        notes, status, created_by, expires_at, customer_id
      ) VALUES (
        $1, $2, $3, '', '', 'selling', $4, $5, 0, 0, $5, $6, $7, $8, $9, now() + interval '30 days', $10
      ) ON CONFLICT (invoice_number) DO UPDATE SET
        total = EXCLUDED.total, paid_amount = EXCLUDED.paid_amount, status = EXCLUDED.status
      RETURNING id`,
      [
        number, date, custName, JSON.stringify([item]), total, paidAmount,
        notes || '', status, userId, custId
      ]
    );
    const invoiceId = res.rows[0]?.id;
    await query(
      `INSERT INTO customer_sales_records (
        invoice_id, invoice_number, customer_id, customer_name, invoice_date,
        total, paid_amount, status, items, invoice_deleted
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, false
      )`,
      [invoiceId, number, custId, custName, date, total, paidAmount, status, JSON.stringify([item])]
    );
  }

  // Invoices for Moe (Matching screenshot: 3 invoices, Total $541.00, Paid $62.00, Owed $479.00)
  await addInvoice({
    number: 'INV_000101',
    date: '2026-10-25',
    custName: 'Moe',
    total: 62.00,
    paidAmount: 62.00,
    status: 'paid',
    notes: 'Paid via cash at counter',
  });
  await addInvoice({
    number: 'INV_000102',
    date: '2026-11-01',
    custName: 'Moe',
    total: 239.00,
    paidAmount: 0.00,
    status: 'unpaid',
    notes: 'Weekly wholesale supply',
  });
  await addInvoice({
    number: 'INV_000103',
    date: '2026-11-04',
    custName: 'Moe',
    total: 240.00,
    paidAmount: 0.00,
    status: 'unpaid',
    notes: 'Pod kits and disposables order',
  });

  // Invoices for Sourabh Jhamb (Matching screenshot: 2 invoices, Total $4,630.00, Paid $4,510.00, Owed $120.00)
  await addInvoice({
    number: 'INV_000104',
    date: '2026-10-20',
    custName: 'Sourabh Jhamb',
    total: 4510.00,
    paidAmount: 4510.00,
    status: 'paid',
    notes: 'Bulk inventory shipment',
  });
  await addInvoice({
    number: 'INV_000105',
    date: '2026-11-03',
    custName: 'Sourabh Jhamb',
    total: 120.00,
    paidAmount: 0.00,
    status: 'unpaid',
    notes: 'Restock pods',
  });

  // Invoices for Alex Rivera (Partial payment demonstration)
  await addInvoice({
    number: 'INV_000106',
    date: '2026-10-28',
    custName: 'Alex Rivera',
    total: 500.00,
    paidAmount: 200.00,
    status: 'partial',
    notes: 'Partial payment on deposit',
  });
  await addInvoice({
    number: 'INV_000107',
    date: '2026-11-05',
    custName: 'Alex Rivera',
    total: 450.00,
    paidAmount: 0.00,
    status: 'unpaid',
    notes: 'Jobber order',
  });

  // Invoice for Sarah Chen (Fully settled customer)
  await addInvoice({
    number: 'INV_000108',
    date: '2026-11-02',
    custName: 'Sarah Chen',
    total: 350.00,
    paidAmount: 350.00,
    status: 'paid',
    notes: 'Direct settlement',
  });

  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // Today's active sale (Sarah Chen)
  await addInvoice({
    number: 'INV_000109',
    date: todayStr,
    custName: 'Sarah Chen',
    total: 215.00,
    paidAmount: 215.00,
    status: 'paid',
    notes: 'Today counter checkout',
  });

  // Sample deleted invoice: invoice deleted from active table, but sale value permanently recorded in customer_sales_records
  const deletedItem = {
    productId: p0.id,
    description: 'Purged Walk-in Vape Pods',
    quantity: 2,
    rate: 70.00,
    discount: 0,
    taxRate: 0,
  };
  await query(
    `INSERT INTO customer_sales_records (
      invoice_number, customer_id, customer_name, invoice_date, total, paid_amount, status, items, invoice_deleted
    ) VALUES (
      'INV_000098_PURGED', NULL, 'Walk-in Customer (Guest)', $1, 140.00, 140.00, 'paid', $2, true
    )`,
    [todayStr, JSON.stringify([deletedItem])],
  );

  // --- VENDORS & RECEIVINGS WITH PORTION PAYMENTS (Check, Cash, Wire) ---
  console.log('Seeding vendors and receivings...');
  await query('DELETE FROM vendor_payments');
  await query('DELETE FROM receivings');
  await query('DELETE FROM vendors');

  const vendors = [
    {
      name: 'Vapor Wholesale Direct',
      company: 'VWD Global Logistics',
      email: 'orders@vwd-global.local',
      phone: '+1 800-555-0199',
      address: '740 Industrial Pkwy, Dallas, TX',
      notes: 'Key distributor for disposables and salts. Net 30 with Wire/Check.',
    },
    {
      name: 'Apex Distribution LLC',
      company: 'Apex Supply Co.',
      email: 'billing@apexsupply.local',
      phone: '+1 888-555-0144',
      address: '120 Commerce Way, Los Angeles, CA',
      notes: 'Hardware & pod devices distributor. Accepts cash portions on delivery.',
    },
    {
      name: 'Master Vape Supplies',
      company: 'MVS Trading Inc.',
      email: 'accounts@mvstrading.local',
      phone: '+1 877-555-0188',
      address: '55 Gateway Blvd, Miami, FL',
      notes: 'Coils and accessories vendor. Fully settled via Wire.',
    },
  ];

  const vendorMap = {};
  for (const v of vendors) {
    const res = await query(
      `INSERT INTO vendors (name, company, email, phone, address, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      [v.name, v.company, v.email, v.phone, v.address, v.notes],
    );
    vendorMap[v.name] = res.rows[0].id;
  }

  // Helper for adding receiving and portion payments
  async function addReceiving({ number, vendorName, invoiceNo, date, total, paidAmount, status, notes, payments }) {
    const vId = vendorMap[vendorName];
    const item = {
      productId: p0.id,
      name: p0.name,
      barcode: p0.barcode || '',
      quantity: 100,
      cost: round2(total / 100),
      oldCost: round2(total / 100),
      amount: total,
      oldPrices: { selling: 19.99, topCustomer: 16.50, jobber: 14.00 },
      newPrices: { selling: 19.99, topCustomer: 16.50, jobber: 14.00 },
    };

    const rRes = await query(
      `INSERT INTO receivings (
        receiving_number, vendor_id, vendor_name, vendor_invoice_no,
        received_date, status, price_rule, items, total, paid_amount, notes, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'percent', $7, $8, $9, $10, $11
      ) RETURNING id`,
      [
        number, vId, vendorName, invoiceNo, date, status,
        JSON.stringify([item]), total, paidAmount, notes || '', userId,
      ],
    );
    const rcvId = rRes.rows[0].id;

    if (payments && payments.length) {
      for (const p of payments) {
        const pSeq = (await query(`SELECT nextval('vendor_payment_seq') AS n`)).rows[0].n;
        const pNum = `VPAY_${String(pSeq).padStart(6, '0')}`;
        await query(
          `INSERT INTO vendor_payments (
            payment_number, vendor_id, vendor_name, amount, payment_date,
            payment_method, reference, notes, receiving_id, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            pNum, vId, vendorName, p.amount, p.date || date,
            p.method, p.reference || '', p.notes || '', rcvId, userId,
          ],
        );
      }
    }
  }

  // 1. Vapor Wholesale Direct:
  // - RCV_000001: $4,000.00, paid in full ($4,000.00) via Wire Transfer
  // - RCV_000002: $2,500.00, partial portion paid ($1,000.00) via Check #CHK-8812, owed $1,500.00
  await addReceiving({
    number: 'RCV_000001',
    vendorName: 'Vapor Wholesale Direct',
    invoiceNo: 'VWD-99120',
    date: '2026-10-22',
    total: 4000.00,
    paidAmount: 4000.00,
    status: 'paid',
    notes: 'Initial monthly bulk shipment',
    payments: [{ amount: 4000.00, method: 'wire', reference: 'WIRE-88912', notes: 'Wire transfer payment in full' }],
  });

  await addReceiving({
    number: 'RCV_000002',
    vendorName: 'Vapor Wholesale Direct',
    invoiceNo: 'VWD-99540',
    date: '2026-11-03',
    total: 2500.00,
    paidAmount: 1000.00,
    status: 'partial',
    notes: 'Restock disposables - Paid partial check deposit',
    payments: [{ amount: 1000.00, method: 'check', reference: 'CHK-8812', notes: 'Partial check payment on delivery' }],
  });

  // 2. Apex Distribution LLC:
  // - RCV_000003: $3,200.00, partial portion paid ($1,200.00) via Cash, owed $2,000.00
  await addReceiving({
    number: 'RCV_000003',
    vendorName: 'Apex Distribution LLC',
    invoiceNo: 'APX-7740',
    date: '2026-11-04',
    total: 3200.00,
    paidAmount: 1200.00,
    status: 'partial',
    notes: 'Pod devices - $1,200 cash portion paid to courier',
    payments: [{ amount: 1200.00, method: 'cash', reference: 'CASH-COURIER', notes: 'Cash portion paid at receiving dock' }],
  });

  // 3. Master Vape Supplies:
  // - RCV_000004: $1,800.00, fully paid ($1,800.00) via Wire Transfer, owed $0.00
  await addReceiving({
    number: 'RCV_000004',
    vendorName: 'Master Vape Supplies',
    invoiceNo: 'MVS-3321',
    date: '2026-11-02',
    total: 1800.00,
    paidAmount: 1800.00,
    status: 'paid',
    notes: 'Coils and accessories - Wire transfer',
    payments: [{ amount: 1800.00, method: 'wire', reference: 'WIRE-7741', notes: 'Wire transfer settlement' }],
  });

  console.log('Seeding completed successfully!');
  await pool.end();
}

seed().catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
