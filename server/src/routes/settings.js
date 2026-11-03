import { Router } from 'express';
import { z } from 'zod';
import { requirePerm } from '../auth.js';
import { config } from '../config.js';
import { h, ok, fail, validate } from '../http.js';
import { getSetting, setSetting } from '../settings.js';
import { encrypt } from '../secrets.js';
import { sendMail } from '../mailer.js';
import { expiryActionOf } from '../archive.js';

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

// The SMTP password is never sent back to the browser, only whether one is set.
r.get('/email', requirePerm('settings', 'view'), h(async (req, res) => {
  const s = await getSetting('email');
  ok(res, {
    archiveEmail: s.archiveEmail || '',
    expiryAction: expiryActionOf(s),
    useCustomSmtp: Boolean(s.useCustomSmtp),
    smtp: {
      host: s.smtp?.host || '', port: s.smtp?.port || 465, secure: s.smtp?.secure ?? true,
      user: s.smtp?.user || '', from: s.smtp?.from || '', passwordSet: Boolean(s.smtp?.passEnc),
    },
    defaultSmtp: { host: config.smtpDefaults.host, from: config.smtpDefaults.from },
    retentionHours: config.invoiceRetentionHours,
  });
}));

const emailSchema = z.object({
  archiveEmail: z.string().trim().toLowerCase().max(200).email('Enter a valid email').or(z.literal('')),
  expiryAction: z.enum(['delete', 'email']).default('delete'),
  useCustomSmtp: z.boolean(),
  smtp: z.object({
    host: z.string().trim().max(200).regex(/^[A-Za-z0-9.-]*$/, 'Invalid host').default(''),
    port: z.coerce.number().int().min(1).max(65535).default(465),
    secure: z.boolean().default(true),
    user: z.string().trim().max(200).default(''),
    from: z.string().trim().max(200).email('Enter a valid email').or(z.literal('')).default(''),
    password: z.string().max(500).optional(),
  }),
});

r.put('/email', requirePerm('settings', 'edit'), h(async (req, res) => {
  const b = validate(emailSchema, req.body, res);
  if (!b) return;
  if (b.useCustomSmtp && (!b.smtp.host || !b.smtp.user)) {
    return fail(res, 422, 'SMTP host and username are required', { 'smtp.host': 'Required when using custom SMTP' });
  }
  if (b.expiryAction === 'email' && !b.archiveEmail) {
    return fail(res, 422, 'Enter the private email that expired invoices are sent to', { archiveEmail: 'Required to email invoices' });
  }
  const prev = await getSetting('email');
  const { password, ...smtp } = b.smtp;
  smtp.passEnc = password ? encrypt(password) : prev.smtp?.passEnc || '';
  await setSetting('email', { archiveEmail: b.archiveEmail, expiryAction: b.expiryAction, useCustomSmtp: b.useCustomSmtp, smtp });
  ok(res, null, 'Email settings saved');
}));

r.post('/email/test', requirePerm('settings', 'edit'), h(async (req, res) => {
  const to = z.string().trim().email().safeParse(req.body?.to);
  if (!to.success) return fail(res, 422, 'Enter a valid email address');
  try {
    await sendMail({ to: to.data, subject: 'Billing – test email', text: 'Your email settings work. This is a test message.' });
  } catch (e) {
    return fail(res, 502, `Test failed: ${e.message}`);
  }
  ok(res, null, `Test email sent to ${to.data}`);
}));

export default r;
