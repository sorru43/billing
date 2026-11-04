import { getSetting, setSetting } from './settings.js';
import { query } from './db.js';

// Custom logos live in the settings table as { mime, data (base64), v }.
// "dashboard" = sidebar + login page; "invoice" = invoice screens, invoice PDF and report PDFs.
export const LOGO_KINDS = ['dashboard', 'invoice'];
export const LOGO_MAX_BYTES = 1024 * 1024;
// pdfkit only embeds PNG/JPEG, so the invoice logo is limited to those.
export const LOGO_TYPES = { dashboard: ['image/png', 'image/jpeg', 'image/webp'], invoice: ['image/png', 'image/jpeg'] };

// Identify the real type from magic bytes; the client's Content-Type is not trusted. SVG is never accepted.
export function sniffImage(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const key = (kind) => `logo_${kind}`;

export async function getLogo(kind) {
  const v = await getSetting(key(kind));
  return v?.data ? { mime: v.mime, buffer: Buffer.from(v.data, 'base64'), v: v.v } : null;
}

export async function saveLogo(kind, mime, buffer) {
  const v = Date.now();
  await setSetting(key(kind), { mime, data: buffer.toString('base64'), v });
  return v;
}

export async function deleteLogo(kind) {
  await query('DELETE FROM settings WHERE key = $1', [key(kind)]);
}

// Versions only (no image data), for cache-busting URLs on the client.
export async function logoVersions() {
  const { rows } = await query(
    `SELECT key, (value->>'v')::bigint AS v FROM settings WHERE key = ANY($1)`,
    [LOGO_KINDS.map(key)],
  );
  const out = { dashboard: null, invoice: null };
  for (const r of rows) out[r.key.slice(5)] = Number(r.v) || null;
  return out;
}
