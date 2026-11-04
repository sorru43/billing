import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { MODULE_SLUGS } from './modules.js';

export const COOKIE = 'billing_session';
const SESSION_HOURS = 12;

export function issueSession(res, user, remember) {
  const token = jwt.sign({ sub: user.id, v: user.token_version }, config.jwtSecret, {
    expiresIn: remember ? '7d' : `${SESSION_HOURS}h`,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE, token, {
    httpOnly: true, // not readable by page scripts, so XSS cannot steal it
    secure: config.env === 'production',
    sameSite: 'strict',
    path: '/',
    ...(remember ? { maxAge: 7 * 24 * 3600 * 1000 } : {}),
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/', sameSite: 'strict', secure: config.env === 'production', httpOnly: true });
}

// Public shape of a user: never includes the password hash.
export function publicUser(u) {
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    phone: u.phone,
    user_type: u.user_type,
    roleId: u.role_id,
    roleName: u.role_name ?? null,
    status: u.status,
    createdAt: u.created_at,
  };
}

export async function loadPermissions(user) {
  const perms = {};
  if (user.user_type === 1) {
    for (const slug of MODULE_SLUGS) perms[slug] = { view: true, create: true, edit: true, delete: true };
    return perms;
  }
  if (!user.role_id) return perms;
  const { rows } = await query(
    `SELECT rp.* FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
      WHERE rp.role_id = $1 AND r.status = true`,
    [user.role_id],
  );
  for (const r of rows) {
    perms[r.module_slug] = { view: r.can_view, create: r.can_create, edit: r.can_edit, delete: r.can_delete };
  }
  return perms;
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const { rows } = await query(
      `SELECT u.*, r.role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    // Disabled users and sessions from before a password change are rejected.
    if (!user || !user.status || user.token_version !== payload.v) {
      clearSession(res);
      return res.status(401).json({ success: false, message: 'Session expired' });
    }
    req.user = user;
    req.permissions = await loadPermissions(user);
    next();
  } catch {
    clearSession(res);
    return res.status(401).json({ success: false, message: 'Session expired' });
  }
}

export function can(req, slug, action) {
  return req.user?.user_type === 1 || Boolean(req.permissions?.[slug]?.[action]);
}

export const requirePerm = (slug, action) => (req, res, next) =>
  can(req, slug, action)
    ? next()
    : res.status(403).json({ success: false, message: 'You do not have permission to do this' });

export const requireSuperAdmin = (req, res, next) =>
  req.user?.user_type === 1 ? next() : res.status(403).json({ success: false, message: 'Admin only' });

// CSRF defence in depth on top of SameSite=Strict: state-changing requests must
// carry a custom header (which cross-site forms cannot set) and a same-site Origin.
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ success: false, message: 'Bad request origin' });
  }
  const origin = req.get('Origin');
  if (origin && !config.allowedOrigins.includes(origin) && config.env === 'production') {
    return res.status(403).json({ success: false, message: 'Bad request origin' });
  }
  next();
}
