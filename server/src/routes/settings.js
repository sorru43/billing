import { Router } from 'express';
import { z } from 'zod';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate } from '../http.js';
import { getSetting, setSetting } from '../settings.js';

const r = Router();

r.get('/company', requirePerm('settings', 'view'), h(async (req, res) => {
  ok(res, { ...(await getSetting('company')), invoicePrefix: (await getSetting('invoice')).prefix || 'INV_' });
}));

const companySchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  email: z.string().trim().max(200).email('Enter a valid email').or(z.literal('')),
  phone: z.string().trim().max(30).default(''),
  address: z.string().trim().max(1000).default(''),
  currencySymbol: z.string().trim().min(1).max(5).default('$'),
  invoicePrefix: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9_\-/]+$/, 'Letters, numbers, _ - / only'),
});

r.put('/company', requirePerm('settings', 'edit'), h(async (req, res) => {
  const b = validate(companySchema, req.body, res);
  if (!b) return;
  const { invoicePrefix, ...company } = b;
  await setSetting('company', company);
  await setSetting('invoice', { prefix: invoicePrefix });
  ok(res, null, 'Company settings saved');
}));

export default r;
