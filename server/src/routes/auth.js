import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { issueSession, clearSession, publicUser, requireAuth } from '../auth.js';
import { h, ok, fail, validate } from '../http.js';
import { getSetting } from '../settings.js';

const r = Router();

// Brute-force protection: 10 attempts per 15 minutes per IP + email.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

// A fixed dummy hash so unknown emails take as long as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional(),
});

r.post('/login', loginLimiter, h(async (req, res) => {
  const body = validate(loginSchema, req.body, res);
  if (!body) return;
  const { rows } = await query(
    `SELECT u.*, r.role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.email = $1`,
    [body.email],
  );
  const user = rows[0];
  const valid = await bcrypt.compare(body.password, user?.password_hash || DUMMY_HASH);
  if (!user || !valid) return fail(res, 401, 'Invalid email or password');
  if (!user.status) return fail(res, 403, 'This account is disabled. Contact your administrator.');
  issueSession(res, user, body.remember);
  ok(res, { user: publicUser(user) }, 'Login successful');
}));

r.post('/logout', (req, res) => {
  clearSession(res);
  ok(res, null, 'Logged out');
});

// Current user, permissions, and the app-wide display settings the UI needs.
r.get('/me', requireAuth, h(async (req, res) => {
  const company = await getSetting('company');
  ok(res, { user: publicUser(req.user), permissions: req.permissions, company });
}));

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
});

r.put('/password', requireAuth, h(async (req, res) => {
  const body = validate(passwordSchema, req.body, res);
  if (!body) return;
  if (!(await bcrypt.compare(body.currentPassword, req.user.password_hash))) {
    return fail(res, 422, 'Current password is incorrect', { currentPassword: 'Current password is incorrect' });
  }
  const hash = await bcrypt.hash(body.newPassword, 12);
  const { rows } = await query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2 RETURNING *`,
    [hash, req.user.id],
  );
  issueSession(res, rows[0], false); // other sessions are now invalid; keep this one
  ok(res, null, 'Password updated');
}));

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().max(100).default(''),
  phone: z.string().trim().max(30).default(''),
});

r.put('/profile', requireAuth, h(async (req, res) => {
  const body = validate(profileSchema, req.body, res);
  if (!body) return;
  const { rows } = await query(
    `UPDATE users SET first_name=$1, last_name=$2, phone=$3, updated_at=now() WHERE id=$4 RETURNING *`,
    [body.firstName, body.lastName, body.phone, req.user.id],
  );
  ok(res, publicUser(rows[0]), 'Profile updated');
}));

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  currentPassword: z.string().min(1, 'Current password is required'),
});

// Change the login email. Needs the current password, like a password change.
r.put('/email', requireAuth, h(async (req, res) => {
  const body = validate(emailSchema, req.body, res);
  if (!body) return;
  if (!(await bcrypt.compare(body.currentPassword, req.user.password_hash))) {
    return fail(res, 422, 'Current password is incorrect', { emailPassword: 'Current password is incorrect' });
  }
  try {
    const { rows } = await query(
      `UPDATE users SET email = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [body.email, req.user.id],
    );
    ok(res, publicUser(rows[0]), 'Login email updated');
  } catch (e) {
    if (e.code === '23505') return fail(res, 422, 'Email already in use', { email: 'Another user already has this email' });
    throw e;
  }
}));

export default r;
