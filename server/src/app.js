import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { config } from './config.js';
import { migrate, query } from './db.js';
import { errorBody } from './errors.js';
import { checkMailer } from './mailer.js';
import { seedDemoServer } from './demo.js';
import { deleteReceipt } from './receipts.js';
import { reconcileAll } from './peers.js';
import accountRoutes from './routes/account.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import deviceRoutes from './routes/devices.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Scheduled maintenance for hosts without a long-running process (Vercel Cron calls this).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set.
app.get('/api/cron/maintenance', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json(errorBody('not_logged_in'));
  await cleanup();
  await reconcileAll();
  res.json({ ok: true });
});
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', deviceRoutes);

app.use((req, res) => res.status(404).json(errorBody('not_found')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json(errorBody(err.code === 'LIMIT_FILE_SIZE' ? 'receipt_too_large' : 'receipt_one_file'));
  }
  if (err.code && err.status) return res.status(err.status).json(errorBody(err.code, err.params));
  console.error(err);
  res.status(500).json(errorBody('server_error'));
});

// Runs once per process (or per serverless cold start): database tables, admin rights, demo server.
let readyPromise = null;
export function ready() {
  readyPromise ??= (async () => {
    await migrate();
    // Make sure the ADMIN_EMAIL account is an admin, even if it signed up before ADMIN_EMAIL was set.
    if (config.adminEmail) {
      // Only once the email is verified, so nobody can claim the admin address without its inbox.
      const { rowCount } = await query('UPDATE users SET is_admin = TRUE WHERE email = $1 AND email_verified AND NOT is_admin', [
        config.adminEmail,
      ]);
      if (rowCount) console.log(`Admin rights given to ${config.adminEmail}`);
    }
    await seedDemoServer();
    // Checking the mail server can take a few seconds; don't hold up the first request for it.
    checkMailer().catch((err) => console.error('[mail]', err.message));
  })().catch((err) => {
    readyPromise = null; // try again on the next request
    throw err;
  });
  return readyPromise;
}

// Remove unverified email accounts and old one-time codes. Keep the configured bootstrap
// admin account so its owner can retry email verification.
export async function cleanup() {
  try {
    const { rowCount } = await query(
      `DELETE FROM users
        WHERE auth_type = 'email' AND NOT email_verified
          AND created_at < now() - interval '24 hours'
          AND (NOT is_admin OR email <> $1)`,
      [config.adminEmail],
    );
    await query(`DELETE FROM otp_codes WHERE created_at < now() - interval '2 days'`);
    await query('DELETE FROM sessions WHERE expires_at < now()');
    if (rowCount) console.log(`[cleanup] removed ${rowCount} unverified sign-up(s)`);

    // Receipts can show bank details: delete them once they're no longer needed.
    if (config.receiptRetentionDays > 0) {
      const { rows } = await query(
        `SELECT id, receipt_file FROM payments
          WHERE receipt_file IS NOT NULL AND status <> 'pending'
            AND reviewed_at < now() - make_interval(days => $1)`,
        [config.receiptRetentionDays],
      );
      for (const p of rows) {
        await deleteReceipt(p.receipt_file);
        await query('UPDATE payments SET receipt_file = NULL, receipt_deleted_at = now() WHERE id = $1', [p.id]);
      }
      if (rows.length) console.log(`[cleanup] deleted ${rows.length} old receipt(s)`);
    }
  } catch (err) {
    console.error('[cleanup]', err.message);
  }
}
