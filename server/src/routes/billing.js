import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireCustomer } from '../auth.js';
import { config } from '../config.js';
import { getSetting, one, query } from '../db.js';
import { fail } from '../errors.js';
import { getPlan, listPlans } from '../plans.js';
import { readReceipt, receiptUpload, saveReceipt } from '../receipts.js';

const router = Router();


router.get('/plans', async (req, res) => {
  const instructions = await getSetting('payment_instructions');
  res.json({
    plans: (await listPlans()).filter((p) => p.active),
    // Every plan, including hidden ones, so old payments can still show their plan's name.
    allPlans: await listPlans(),
    currency: config.currency,
    maxDevices: config.maxDevices,
    paymentsOpen: Boolean(instructions.trim()),
  });
});

router.get('/transfer', requireCustomer, async (req, res) => {
  res.json({
    instructions: await getSetting('payment_instructions'),
    // The customer code, written in the transfer comment so you can match payments.
    reference: req.user.customer_code,
  });
});

// The customer's own payments, newest first (to show "under review" / "rejected").
router.get('/payments', requireCustomer, async (req, res) => {
  const { rows } = await query(
    `SELECT id, provider, plan, amount, currency, status, created_at, review_note
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [req.user.id],
  );
  res.json({ payments: rows });
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'too_many_requests'),
});

router.post('/transfer', requireCustomer, uploadLimiter, receiptUpload, async (req, res) => {
  const plan = await getPlan(req.body?.plan);
  if (!plan || !plan.active) return fail(res, 400, 'choose_plan');

  const payerName = String(req.body.payerName || '').trim().slice(0, 100);
  if (!payerName) return fail(res, 400, 'payer_name_required');

  const paidOn = String(req.body.paidOn || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn)) || new Date(paidOn) > new Date()) {
    return fail(res, 400, 'paid_on_required');
  }

  const { count } = await one(
    `SELECT count(*)::int AS count FROM payments WHERE user_id = $1 AND status = 'pending'`,
    [req.user.id],
  );
  if (count >= 2) return fail(res, 409, 'too_many_pending');

  const receipt = await saveReceipt(req.file);
  const payment = await one(
    `INSERT INTO payments
       (user_id, provider, provider_ref, plan, amount, currency, status, payer_name, paid_on, note, receipt_file, receipt_mime)
     VALUES ($1, 'transfer', $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
     RETURNING id, plan, amount, currency, status, created_at`,
    [
      req.user.id,
      `transfer-${crypto.randomUUID()}`,
      plan.id,
      plan.price,
      config.currency,
      payerName,
      paidOn,
      String(req.body.note || '').trim().slice(0, 500) || null,
      receipt.file,
      receipt.mime,
    ],
  );
  res.status(201).json({ payment });
});

const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// View a receipt: only the customer who uploaded it, or an admin. ?download=1 saves it instead.
router.get('/receipts/:id', requireAuth, async (req, res) => {
  const p = await one('SELECT user_id, receipt_file, receipt_mime FROM payments WHERE id = $1', [Number(req.params.id)]);
  if (!p?.receipt_file || (p.user_id !== req.user.id && !req.user.is_admin)) return fail(res, 404, 'receipt_not_found');
  const data = await readReceipt(p.receipt_file); // decrypted in memory, never written to disk
  if (!data) return fail(res, 404, 'receipt_not_found');

  // The site-wide security policy blocks the browser's PDF viewer (object-src 'none'), which
  // made PDF receipts open as a blank page. The file type was verified from its bytes on upload,
  // and nosniff (from helmet) stops the browser treating it as anything else.
  res.removeHeader('Content-Security-Policy');
  const disposition = req.query.download ? 'attachment' : 'inline';
  res.set({
    'Content-Type': p.receipt_mime,
    'Content-Disposition': `${disposition}; filename="receipt-${req.params.id}.${EXT[p.receipt_mime] || 'bin'}"`,
    'Cache-Control': 'private, no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.send(data);
});

export default router;
