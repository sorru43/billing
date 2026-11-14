import { query, pool } from '../src/db.js';
import { config } from '../src/config.js';

// STRICT SAFETY GUARD: Never run against wholesaledistropos or unapproved databases!
if (config.databaseUrl.includes('wholesaledistropos')) {
  console.error('CRITICAL SAFETY STOP: Cannot run French showcase seed against wholesaledistropos production!');
  process.exit(1);
}

async function runFrenchSeed() {
  console.log('--- Starting French Showcase Demo Data Seeding ---');
  console.log('Database:', config.databaseUrl.replace(/:[^:@]+@/, ':***@'));

  // Get first admin user for created_by
  const userRes = await query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  const userId = userRes.rows[0]?.id || null;

  // 1. Categories
  const categories = [
    { name: 'Boulangerie & Pâtisserie', slug: 'boulangerie-patisserie' },
    { name: 'Boissons & Vins Fins', slug: 'boissons-vins' },
    { name: 'Épicerie Fine & Fromages', slug: 'epicerie-fromages' },
    { name: 'Café & Thés Bio', slug: 'cafe-thes' },
    { name: 'Traiteur & Produits Frais', slug: 'traiteur-frais' },
  ];

  const catMap = new Map();
  for (const c of categories) {
    const { rows } = await query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, slug`,
      [c.name, c.slug]
    );
    catMap.set(c.slug, rows[0].id);
    console.log(`[Category] ${c.name} (id: ${rows[0].id})`);
  }

  // 2. French Products
  const products = [
    {
      name: 'Baguette de tradition française',
      cost: 0.45,
      selling: 1.30,
      topCustomer: 1.10,
      jobber: 0.95,
      quantity: 85,
      barcode: '300010000001',
      category: 'boulangerie-patisserie',
    },
    {
      name: 'Croissant artisanal au beurre AOP',
      cost: 0.55,
      selling: 1.50,
      topCustomer: 1.30,
      jobber: 1.15,
      quantity: 60,
      barcode: '300010000002',
      category: 'boulangerie-patisserie',
    },
    {
      name: 'Pain au chocolat pur beurre',
      cost: 0.60,
      selling: 1.65,
      topCustomer: 1.45,
      jobber: 1.25,
      quantity: 50,
      barcode: '300010000003',
      category: 'boulangerie-patisserie',
    },
    {
      name: 'Brioche tressée au sucre perlé 400g',
      cost: 1.90,
      selling: 4.50,
      topCustomer: 3.90,
      jobber: 3.40,
      quantity: 25,
      barcode: '300010000004',
      category: 'boulangerie-patisserie',
    },
    {
      name: 'Vin rouge Bordeaux Supérieur Château 75cl',
      cost: 6.50,
      selling: 14.90,
      topCustomer: 12.50,
      jobber: 10.50,
      quantity: 40,
      barcode: '300010000005',
      category: 'boissons-vins',
    },
    {
      name: 'Champagne Brut Réserve 75cl',
      cost: 18.00,
      selling: 36.00,
      topCustomer: 31.00,
      jobber: 27.00,
      quantity: 18,
      barcode: '300010000006',
      category: 'boissons-vins',
    },
    {
      name: 'Fromage Comté AOP affiné 18 mois 250g',
      cost: 3.80,
      selling: 7.50,
      topCustomer: 6.40,
      jobber: 5.50,
      quantity: 30,
      barcode: '300010000007',
      category: 'epicerie-fromages',
    },
    {
      name: 'Fromage Brie de Meaux AOP 200g',
      cost: 2.60,
      selling: 5.20,
      topCustomer: 4.50,
      jobber: 3.90,
      quantity: 4, // low stock alert!
      barcode: '300010000008',
      category: 'epicerie-fromages',
    },
    {
      name: 'Huile d’olive vierge extra bio 500ml',
      cost: 4.50,
      selling: 9.80,
      topCustomer: 8.50,
      jobber: 7.20,
      quantity: 35,
      barcode: '300010000009',
      category: 'epicerie-fromages',
    },
    {
      name: 'Café en grains Pur Arabica bio 500g',
      cost: 4.20,
      selling: 8.90,
      topCustomer: 7.60,
      jobber: 6.50,
      quantity: 28,
      barcode: '300010000010',
      category: 'cafe-thes',
    },
    {
      name: 'Thé vert Earl Grey Supérieur 100g',
      cost: 3.10,
      selling: 6.90,
      topCustomer: 5.90,
      jobber: 4.90,
      quantity: 3, // low stock alert!
      barcode: '300010000011',
      category: 'cafe-thes',
    },
    {
      name: 'Boîte de Macarons assortis (12 pièces)',
      cost: 5.50,
      selling: 12.50,
      topCustomer: 10.50,
      jobber: 9.00,
      quantity: 0, // out of stock!
      barcode: '300010000012',
      category: 'boulangerie-patisserie',
    },
  ];

  const productRows = [];
  for (const p of products) {
    const { rows } = await query(
      `INSERT INTO products (name, cost, selling_price, top_customer_price, jobber_price, quantity, barcode, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT (barcode) DO UPDATE SET
         name = EXCLUDED.name, cost = EXCLUDED.cost, selling_price = EXCLUDED.selling_price,
         top_customer_price = EXCLUDED.top_customer_price, jobber_price = EXCLUDED.jobber_price,
         quantity = EXCLUDED.quantity, category_id = EXCLUDED.category_id
       RETURNING id, name, selling_price`,
      [p.name, p.cost, p.selling, p.topCustomer, p.jobber, p.quantity, p.barcode, catMap.get(p.category)]
    );
    productRows.push(rows[0]);
    console.log(`[Product] ${p.name} (${rows[0].selling_price} €)`);
  }

  // 3. French Customers
  const customers = [
    {
      name: 'Jean-Luc Dupont',
      company: 'Dupont Distribution SARL',
      email: 'jldupont@dupont-distrib.fr',
      phone: '+33 1 42 68 55 00',
      address: '18 Boulevard Haussmann, 75009 Paris',
      priceLevel: 'top_customer',
    },
    {
      name: 'Marie-Claire Lefebvre',
      company: 'Maison Lefebvre Lyon',
      email: 'contact@maison-lefebvre.fr',
      phone: '+33 4 78 30 12 34',
      address: '24 Rue de la République, 69002 Lyon',
      priceLevel: 'selling',
    },
    {
      name: 'Pierre Martin',
      company: 'Café & Épicerie Saint-Germain',
      email: 'pmartin@bordeaux-gourmet.fr',
      phone: '+33 5 56 44 20 10',
      address: '12 Place de la Bourse, 33000 Bordeaux',
      priceLevel: 'jobber',
    },
    {
      name: 'Sophie Moreau',
      company: 'Le Comptoir Provençal',
      email: 'sophie@comptoir-provencal.fr',
      phone: '+33 4 91 13 89 00',
      address: '45 La Canebière, 13001 Marseille',
      priceLevel: 'top_customer',
    },
  ];

  const custMap = new Map();
  for (const c of customers) {
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
    console.log(`[Customer] ${c.name} (${c.company})`);
  }

  // 4. Sample French Invoices
  async function addFrenchInvoice({ number, date, custName, items, total, paidAmount, status, notes }) {
    const custId = custMap.get(custName);
    const serializedItems = JSON.stringify(items);
    const res = await query(
      `INSERT INTO invoices (
        invoice_number, invoice_date, customer_name, customer_email, customer_phone,
        price_level, items, subtotal, discount_total, tax_total, total, paid_amount,
        notes, status, created_by, expires_at, customer_id
      ) VALUES (
        $1, $2, $3, '', '', 'selling', $4, $5, 0, 0, $5, $6, $7, $8, $9, now() + interval '30 days', $10
      ) ON CONFLICT (invoice_number) DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        total = EXCLUDED.total,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        items = EXCLUDED.items,
        notes = EXCLUDED.notes
      RETURNING id`,
      [number, date, custName, serializedItems, total, paidAmount, notes || '', status, userId, custId]
    );
    const invoiceId = res.rows[0]?.id;

    // Record in sales log
    await query('DELETE FROM customer_sales_records WHERE invoice_number = $1', [number]);
    await query(
      `INSERT INTO customer_sales_records (
        invoice_id, invoice_number, customer_id, customer_name, invoice_date,
        total, paid_amount, status, items, invoice_deleted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
      [invoiceId, number, custId, custName, date, total, paidAmount, status, serializedItems]
    );
    console.log(`[Invoice] ${number} - ${custName}: ${total} € (${status})`);
  }

  // Seed invoices
  await addFrenchInvoice({
    number: 'FAC-2026-001',
    date: '2026-11-10',
    custName: 'Jean-Luc Dupont',
    items: [
      { productId: productRows[4].id, description: 'Vin rouge Bordeaux Supérieur Château 75cl', quantity: 10, rate: 12.50, discount: 0, taxRate: 0 },
      { productId: productRows[6].id, description: 'Fromage Comté AOP affiné 18 mois 250g', quantity: 8, rate: 7.44, discount: 0, taxRate: 0 },
    ],
    total: 184.50,
    paidAmount: 184.50,
    status: 'paid',
    notes: 'Règlement au comptoir par carte bancaire',
  });

  await addFrenchInvoice({
    number: 'FAC-2026-002',
    date: '2026-11-12',
    custName: 'Marie-Claire Lefebvre',
    items: [
      { productId: productRows[5].id, description: 'Champagne Brut Réserve 75cl', quantity: 10, rate: 36.00, discount: 0, taxRate: 0 },
      { productId: productRows[1].id, description: 'Croissant artisanal au beurre AOP', quantity: 40, rate: 1.50, discount: 0, taxRate: 0 },
    ],
    total: 420.00,
    paidAmount: 200.00,
    status: 'partial',
    notes: 'Acompte de 200 € reçu par virement bancaire',
  });

  await addFrenchInvoice({
    number: 'FAC-2026-003',
    date: '2026-11-13',
    custName: 'Pierre Martin',
    items: [
      { productId: productRows[9].id, description: 'Café en grains Pur Arabica bio 500g', quantity: 20, rate: 8.90, discount: 0, taxRate: 0 },
      { productId: productRows[8].id, description: 'Huile d’olive vierge extra bio 500ml', quantity: 10, rate: 9.80, discount: 0, taxRate: 0 },
      { productId: productRows[3].id, description: 'Brioche tressée au sucre perlé 400g', quantity: 8, rate: 4.975, discount: 0, taxRate: 0 },
    ],
    total: 315.80,
    paidAmount: 0.00,
    status: 'unpaid',
    notes: 'Livraison hebdomadaire Bordeaux, échéance à 30 jours',
  });

  await addFrenchInvoice({
    number: 'FAC-2026-004',
    date: '2026-11-14',
    custName: 'Sophie Moreau',
    items: [
      { productId: productRows[0].id, description: 'Baguette de tradition française', quantity: 60, rate: 1.10, discount: 0, taxRate: 0 },
      { productId: productRows[2].id, description: 'Pain au chocolat pur beurre', quantity: 50, rate: 1.45, discount: 0, taxRate: 0 },
      { productId: productRows[6].id, description: 'Fromage Comté AOP affiné 18 mois 250g', quantity: 2, rate: 8.75, discount: 0, taxRate: 0 },
    ],
    total: 156.00,
    paidAmount: 156.00,
    status: 'paid',
    notes: 'Payé intégralement par chèque n° 449201',
  });

  console.log('--- French Showcase Demo Data Seeding Completed Successfully! ---');
  await pool.end();
}

runFrenchSeed().catch((err) => {
  console.error('French seed failed:', err);
  process.exit(1);
});
