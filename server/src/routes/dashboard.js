import { Router } from 'express';
import { query } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { h, ok } from '../http.js';
import { ALERT_SQL } from '../stock.js';

const r = Router();

r.get('/', requirePerm('dashboard', 'view'), h(async (req, res) => {
  const one = async (sql) => (await query(sql)).rows[0];
  const data = {};
  if (can(req, 'products', 'view')) {
    data.products = await one(`SELECT count(*)::int total,
        count(*) FILTER (WHERE quantity <= 0)::int out_of_stock,
        count(*) FILTER (WHERE quantity > 0 AND quantity <= ${ALERT_SQL})::int low_stock,
        COALESCE(sum(GREATEST(quantity,0) * cost),0) stock_value
      FROM products p`);
    data.lowStock = (await query(`SELECT p.id, p.name, p.quantity, ${ALERT_SQL} AS alert_level FROM products p WHERE p.quantity <= ${ALERT_SQL} ORDER BY p.quantity, p.name LIMIT 5`)).rows;
  }
  if (can(req, 'categories', 'view')) data.categories = (await one(`SELECT count(*)::int total FROM categories`)).total;
  if (can(req, 'invoices', 'view')) {
    data.invoices = await one(`SELECT count(*)::int total, COALESCE(sum(total),0) amount,
        COALESCE(sum(total) FILTER (WHERE status='paid'),0) paid
      FROM invoices`);
    data.recentInvoices = (await query(
      `SELECT id, invoice_number, customer_name, total, status FROM invoices ORDER BY created_at DESC LIMIT 5`,
    )).rows;
  }
  if (can(req, 'users', 'view')) data.users = (await one(`SELECT count(*)::int total FROM users WHERE user_type=2`)).total;
  ok(res, data);
}));

export default r;
