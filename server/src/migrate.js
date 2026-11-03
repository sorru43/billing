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

CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
`;

async function main() {
  await pool.query(schema);

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
