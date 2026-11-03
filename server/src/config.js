import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3710),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  settingsEncKey: required('SETTINGS_ENC_KEY'),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://localhost:3710',
  // Invoices are kept this long, then emailed to ARCHIVE_EMAIL and deleted.
  invoiceRetentionHours: Number(process.env.INVOICE_RETENTION_HOURS || 48),
  archiveEmail: (process.env.ARCHIVE_EMAIL || '').trim().toLowerCase(),
  smtpDefaults: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASSWORD || '',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
  },
};
