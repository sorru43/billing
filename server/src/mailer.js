import nodemailer from 'nodemailer';
import { getSmtp, getSetting } from './settings.js';

export async function sendMail({ to, subject, text, html, attachments }) {
  const smtp = await getSmtp();
  if (!smtp.host || !smtp.user) throw new Error('Email is not configured. Set it up in Settings → Email Settings.');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  const company = await getSetting('company');
  const from = company.companyName ? `"${company.companyName.replace(/"/g, '')}" <${smtp.from}>` : smtp.from;
  return transport.sendMail({ from, to, subject, text, html, attachments });
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
