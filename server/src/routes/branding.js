import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, ok, fail } from '../http.js';
import { LOGO_KINDS, getLogo, logoVersions } from '../logos.js';

// Public (no session): the login page needs the dashboard logo before sign-in.
const r = Router();
const DEFAULT_LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'public', 'static', 'wise-logo.svg');

r.get('/', h(async (req, res) => ok(res, { logos: await logoVersions() })));

r.get('/logo/:kind', h(async (req, res) => {
  if (!LOGO_KINDS.includes(req.params.kind)) return fail(res, 404, 'Not found');
  const logo = await getLogo(req.params.kind);
  // Versioned URLs (?v=) are immutable; unversioned ones must revalidate.
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.set('X-Content-Type-Options', 'nosniff');
  if (!logo) return res.type('image/svg+xml').sendFile(DEFAULT_LOGO);
  res.type(logo.mime).send(logo.buffer);
}));

export default r;
