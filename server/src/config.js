import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const encryptionKey = Buffer.from(required('ENCRYPTION_KEY'), 'hex');
if (encryptionKey.length !== 32) throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');

export const config = {
  port: Number(process.env.PORT) || 4000,
  appUrl: required('APP_URL').replace(/\/$/, ''),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  encryptionKey,
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  maxDevices: Number(process.env.MAX_DEVICES) || 5,
  isProduction: process.env.NODE_ENV === 'production',
  // Currency every price is shown in (prices are set in Admin → Settings → Plans).
  currency: (process.env.CURRENCY || 'RUB').toUpperCase(),
  // Where uploaded payment receipts are stored (keep this folder backed up).
  uploadDir: path.resolve(process.env.UPLOAD_DIR || fileURLToPath(new URL('../uploads', import.meta.url))),
  // Approved/rejected receipts are deleted this many days after review (0 = keep forever)
  receiptRetentionDays: Number(process.env.RECEIPT_RETENTION_DAYS ?? 90),
  // Outgoing email for verification codes (set in server/.env, never committed)
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || (Number(process.env.SMTP_PORT || 465) === 465 ? 'true' : 'false')) === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `JIREX <${process.env.SMTP_USER}>` : ''),
  },
};
