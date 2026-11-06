import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from './db.js';

const schema = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name   text NOT NULL UNIQUE,
  status      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  can_view    boolean NOT NULL DEFAULT false,
  can_create  boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (role_id, module_slug)
);

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     text NOT NULL,
  last_name      text NOT NULL DEFAULT '',
  email          text NOT NULL UNIQUE,
  phone          text NOT NULL DEFAULT '',
  password_hash  text NOT NULL,
  user_type      smallint NOT NULL DEFAULT 2,          -- 1 = super admin, 2 = staff
  role_id        uuid REFERENCES roles(id) ON DELETE SET NULL,
  status         boolean NOT NULL DEFAULT true,
  token_version  integer NOT NULL DEFAULT 0,           -- bump to invalidate sessions
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  status      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  cost                numeric(14,2) NOT NULL DEFAULT 0,
  selling_price       numeric(14,2) NOT NULL DEFAULT 0,   -- price level 1
  top_customer_price  numeric(14,2) NOT NULL DEFAULT 0,   -- price level 2
  jobber_price        numeric(14,2) NOT NULL DEFAULT 0,   -- price level 3
  quantity            integer NOT NULL DEFAULT 0,
  barcode             text UNIQUE,
  description         text NOT NULL DEFAULT '',
  category_id         uuid REFERENCES categories(id) ON DELETE SET NULL,
  status              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- Invoices are short-lived: kept for the retention window, then emailed to the
-- private archive address and hard-deleted. Line items are a JSON snapshot so the
-- emailed copy is complete even if a product is later edited or removed.
CREATE TABLE IF NOT EXISTS invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    text NOT NULL UNIQUE,
  invoice_date      date NOT NULL,
  due_date          date,
  customer_name     text NOT NULL,
  customer_email    text NOT NULL DEFAULT '',
  customer_phone    text NOT NULL DEFAULT '',
  customer_address  text NOT NULL DEFAULT '',
  price_level       text NOT NULL DEFAULT 'selling',
  items             jsonb NOT NULL,
  subtotal          numeric(14,2) NOT NULL,
  discount_total    numeric(14,2) NOT NULL,
  tax_total         numeric(14,2) NOT NULL,
  total             numeric(14,2) NOT NULL,
  notes             text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'unpaid',
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  archive_attempts  integer NOT NULL DEFAULT 0,
  archive_error     text
);
CREATE INDEX IF NOT EXISTS invoices_expires_idx ON invoices(expires_at);

CREATE TABLE IF NOT EXISTS customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  company      text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  tax_number   text NOT NULL DEFAULT '',
  price_level  text NOT NULL DEFAULT 'selling',      -- default price level for their invoices
  notes        text NOT NULL DEFAULT '',
  status       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Email is optional, but two customers cannot share one (it is the import match key).
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uq ON customers (lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (lower(name));

-- Matrix items: one parent (e.g. "Vape Juice") with up to two attributes
-- (e.g. Flavor x Size). Every variant is a normal row in products, so stock,
-- barcodes, invoices, reports and import/export keep working unchanged.
CREATE TABLE IF NOT EXISTS product_matrices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  category_id         uuid REFERENCES categories(id) ON DELETE SET NULL,
  description         text NOT NULL DEFAULT '',
  attr1_name          text NOT NULL,
  attr1_values        jsonb NOT NULL DEFAULT '[]',
  attr2_name          text NOT NULL DEFAULT '',
  attr2_values        jsonb NOT NULL DEFAULT '[]',
  cost                numeric(14,2) NOT NULL DEFAULT 0,
  selling_price       numeric(14,2) NOT NULL DEFAULT 0,
  top_customer_price  numeric(14,2) NOT NULL DEFAULT 0,
  jobber_price        numeric(14,2) NOT NULL DEFAULT 0,
  status              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_matrices_name_uq ON product_matrices (lower(name));
ALTER TABLE products ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES product_matrices(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS option1 text NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS option2 text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS products_matrix_idx ON products(matrix_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_matrix_opts_uq ON products (matrix_id, lower(option1), lower(option2)) WHERE matrix_id IS NOT NULL;

-- Customer statements: invoices remember which saved customer they belong to.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices(customer_id);
-- Link older invoices to a saved customer by email, else by exact name (only when that name is unique).
UPDATE invoices i SET customer_id = c.id FROM customers c
 WHERE i.customer_id IS NULL AND i.customer_email <> '' AND lower(c.email) = lower(i.customer_email);
UPDATE invoices i SET customer_id = c.id FROM customers c
 WHERE i.customer_id IS NULL AND lower(trim(c.name)) = lower(trim(i.customer_name))
   AND (SELECT count(*) FROM customers c2 WHERE lower(trim(c2.name)) = lower(trim(i.customer_name))) = 1;

-- Vendors and inventory receiving (purchases). Kept permanently.
CREATE TABLE IF NOT EXISTS vendors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  company     text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  status      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendors_name_idx ON vendors (lower(name));

CREATE SEQUENCE IF NOT EXISTS receiving_number_seq START 1;
CREATE TABLE IF NOT EXISTS receivings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_number   text NOT NULL UNIQUE,
  vendor_id          uuid REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name        text NOT NULL,
  vendor_invoice_no  text NOT NULL DEFAULT '',
  received_date      date NOT NULL,
  status             text NOT NULL DEFAULT 'unpaid',
  price_rule         text NOT NULL DEFAULT 'percent',
  items              jsonb NOT NULL,
  total              numeric(14,2) NOT NULL,
  notes              text NOT NULL DEFAULT '',
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receivings_vendor_idx ON receivings(vendor_id);

-- Returns: items given back against an invoice or by customer name, at the price the customer paid. Kept permanently.
CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1;
CREATE TABLE IF NOT EXISTS returns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number   text NOT NULL UNIQUE,
  invoice_id      uuid,
  invoice_number  text DEFAULT '',
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   text NOT NULL,
  settlement      text NOT NULL DEFAULT 'credit',
  items           jsonb NOT NULL,
  total           numeric(14,2) NOT NULL,
  reason          text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS returns_invoice_idx ON returns(invoice_number);
CREATE INDEX IF NOT EXISTS returns_customer_idx ON returns(customer_id);

-- Permanent sales ledger so invoice expiration (1hr retention) never loses what customers owe or purchased.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE receivings ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS customer_sales_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid,
  invoice_number text NOT NULL,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  text NOT NULL,
  invoice_date   date NOT NULL,
  total          numeric(14,2) NOT NULL,
  paid_amount    numeric(14,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'unpaid',
  items          jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sales_cust_idx ON customer_sales_records(customer_id);
CREATE INDEX IF NOT EXISTS customer_sales_name_idx ON customer_sales_records(lower(trim(customer_name)));
CREATE INDEX IF NOT EXISTS customer_sales_inv_idx ON customer_sales_records(invoice_number);
CREATE INDEX IF NOT EXISTS customer_sales_date_idx ON customer_sales_records(invoice_date);

ALTER TABLE customer_sales_records ADD COLUMN IF NOT EXISTS invoice_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE customer_sales_records ADD COLUMN IF NOT EXISTS payment_method text DEFAULT '';
ALTER TABLE customer_sales_records ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

-- Backfill any invoices into customer_sales_records so sales values are permanently preserved
INSERT INTO customer_sales_records (invoice_id, invoice_number, customer_id, customer_name, invoice_date, total, paid_amount, status, items, created_at)
SELECT i.id, i.invoice_number, i.customer_id, i.customer_name, i.invoice_date, i.total, i.paid_amount, i.status, i.items, i.created_at
FROM invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM customer_sales_records csr WHERE csr.invoice_number = i.invoice_number
);

-- Customer item price history: tracks what each customer paid so returns automatically use their lowest paid price.
CREATE TABLE IF NOT EXISTS customer_item_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  text NOT NULL,
  product_id     uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name   text NOT NULL,
  barcode        text NOT NULL DEFAULT '',
  unit_price     numeric(14,2) NOT NULL,
  quantity       integer NOT NULL DEFAULT 1,
  invoice_number text NOT NULL DEFAULT '',
  invoice_date   date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cip_cust_prod_idx ON customer_item_prices(customer_id, product_id);
CREATE INDEX IF NOT EXISTS cip_name_prod_idx ON customer_item_prices(lower(trim(customer_name)), product_id);

-- Customer payments collected (subtracts automatically from balance owed).
CREATE SEQUENCE IF NOT EXISTS customer_payment_seq START 1;
CREATE TABLE IF NOT EXISTS customer_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number  text NOT NULL UNIQUE,
  customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   text NOT NULL,
  amount          numeric(14,2) NOT NULL,
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  payment_method  text NOT NULL DEFAULT 'cash',
  notes           text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cp_cust_idx ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS cp_name_idx ON customer_payments(lower(trim(customer_name)));

-- Supplier payments made (subtracts automatically from balance owed to supplier).
CREATE SEQUENCE IF NOT EXISTS vendor_payment_seq START 1;
CREATE TABLE IF NOT EXISTS vendor_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number  text NOT NULL UNIQUE,
  vendor_id       uuid REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name     text NOT NULL,
  amount          numeric(14,2) NOT NULL,
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  payment_method  text NOT NULL DEFAULT 'cash',
  notes           text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vp_vendor_idx ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS vp_name_idx ON vendor_payments(lower(trim(vendor_name)));
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS reference text DEFAULT '';
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS receiving_id uuid;

CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
`;

async function main() {
  await pool.query(schema);
  await pool.query("UPDATE invoices SET paid_amount = total WHERE status = 'paid' AND (paid_amount IS NULL OR paid_amount = 0);");

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users WHERE user_type = 1');
  if (rows[0].n === 0) {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) throw new Error('No admin exists yet: set ADMIN_EMAIL to create the first one.');
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, user_type) VALUES ($1,$2,$3,$4,1)`,
      [process.env.ADMIN_FIRST_NAME || 'Admin', process.env.ADMIN_LAST_NAME || '', email, hash],
    );
    console.log(`Created super admin ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`Generated password: ${password}`);
  }

  await pool.query(
    `INSERT INTO settings (key, value) VALUES
       ('company', $1), ('invoice', $2), ('email', $3)
     ON CONFLICT (key) DO NOTHING`,
    [
      JSON.stringify({ companyName: 'Wise Hustlers', email: '', phone: '', address: '', currencySymbol: '$' }),
      JSON.stringify({ prefix: 'INV_' }),
      JSON.stringify({ useCustomSmtp: false, archiveEmail: '' }),
    ],
  );
  console.log('Migration complete');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
