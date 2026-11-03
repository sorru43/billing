import { query } from './db.js';
import { config } from './config.js';
import { decrypt } from './secrets.js';

export async function getSetting(key) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? {};
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

// SMTP transport settings: the custom ones from Settings if enabled, else the server defaults.
export async function getSmtp() {
  const email = await getSetting('email');
  if (email.useCustomSmtp && email.smtp?.host) {
    return {
      host: email.smtp.host,
      port: Number(email.smtp.port),
      secure: Boolean(email.smtp.secure),
      user: email.smtp.user,
      pass: decrypt(email.smtp.passEnc),
      from: email.smtp.from || email.smtp.user,
    };
  }
  return config.smtpDefaults;
}
