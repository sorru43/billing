import { z } from 'zod';

export const ok = (res, data, message = 'OK', status = 200) => res.status(status).json({ success: true, message, data });
export const fail = (res, status, message, errors) =>
  res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });

// Wrap async handlers so thrown errors reach the error middleware.
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function paging(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const search = String(req.query.search || '').trim().slice(0, 100);
  return { limit, page, offset: (page - 1) * limit, search };
}

export const pagination = (total, page, limit) => ({ total, page, limit, totalPages: Math.ceil(total / limit) });

// Validate a body with zod; on failure respond 422 with { field: message } like the original API.
export function validate(schema, body, res) {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const errors = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join('.') || 'form';
    if (!errors[k]) errors[k] = issue.message;
  }
  fail(res, 422, 'Please fix the highlighted fields', errors);
  return null;
}

export const uuid = z.string().uuid();
export const isUuid = (s) => uuid.safeParse(s).success;

// Escape LIKE wildcards in user search input.
export const likeEscape = (s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
