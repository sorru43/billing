import { Router } from 'express';
import { z } from 'zod';
import { requirePerm } from '../auth.js';
import { h, ok, fail, validate } from '../http.js';
import express from 'express';
import PDFDocument from 'pdfkit';
import { getSetting, setSetting } from '../settings.js';
import { LOGO_KINDS, LOGO_MAX_BYTES, LOGO_TYPES, sniffImage, saveLogo, deleteLogo } from '../logos.js';

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

// Inventory rules. Anyone signed in may read them (the invoice screen needs them); only settings editors change them.
r.get('/inventory', h(async (req, res) => {
  const s = await getSetting('inventory');
  ok(res, { allowOutOfStockSales: s.allowOutOfStockSales === true });
}));

r.put('/inventory', requirePerm('settings', 'edit'), h(async (req, res) => {
  const b = validate(z.object({ allowOutOfStockSales: z.boolean() }), req.body, res);
  if (!b) return;
  await setSetting('inventory', b);
  ok(res, b, b.allowOutOfStockSales ? 'Out-of-stock selling turned ON' : 'Out-of-stock selling turned OFF');
}));

const rawImage = express.raw({ type: () => true, limit: LOGO_MAX_BYTES });

r.put('/logo/:kind', requirePerm('settings', 'edit'), rawImage, h(async (req, res) => {
  const { kind } = req.params;
  if (!LOGO_KINDS.includes(kind)) return fail(res, 404, 'Not found');
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!buf.length) return fail(res, 422, 'Choose an image file');
  const mime = sniffImage(buf);
  if (!mime || !LOGO_TYPES[kind].includes(mime)) {
    return fail(res, 422, kind === 'invoice' ? 'Invoice logo must be a PNG or JPG image' : 'Logo must be a PNG, JPG or WebP image');
  }
  if (kind === 'invoice') {
    // Make sure the PDF generator can actually embed it.
    try {
      new PDFDocument({ autoFirstPage: false }).openImage(buf);
    } catch {
      return fail(res, 422, 'This image could not be read. Try re-saving it as a standard PNG or JPG.');
    }
  }
  const v = await saveLogo(kind, mime, buf);
  ok(res, { v }, 'Logo updated');
}));

r.delete('/logo/:kind', requirePerm('settings', 'edit'), h(async (req, res) => {
  if (!LOGO_KINDS.includes(req.params.kind)) return fail(res, 404, 'Not found');
  await deleteLogo(req.params.kind);
  ok(res, null, 'Logo reset to default');
}));

export default r;
