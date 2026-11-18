import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { clearSession, endAllSessions, hashAccessKey, publicUser, requireAuth, requireCustomer, setSession } from '../auth.js';
import { decrypt } from '../crypto.js';
import { canonicalEmail, domainAcceptsMail, isDisposable, validEmailFormat } from '../email.js';
import { checkCode, createChallenge, issueCode, readChallenge } from '../otp.js';
import { one, query } from '../db.js';
import { fail } from '../errors.js';
import { clientAddress, reconcileServer } from '../peers.js';

// Your own account: profile, key, sign-in details, and closing the account.
const router = Router();
const deleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'too_many_requests'),
});

// Deletes (closes) the account. Requires the account's key or password to confirm.
// This is a soft delete: the person can't sign in any more, their devices are disconnected and
// time left on the plan ends, but the record is kept so an admin can look it up or restore it.
router.post('/delete', requireCustomer, deleteLimiter, async (req, res) => {
  const user = req.user;
  if (user.auth_type === 'key') {
    const key = String(req.body?.key || '').trim();
    if (!key || hashAccessKey(key) !== user.access_key_hash) return fail(res, 401, 'wrong_key');
  } else if (!(await bcrypt.compare(String(req.body?.password || ''), user.password_hash))) {
    return fail(res, 401, 'wrong_password');
  }
  // Servers the person's devices were on, so they can be disconnected right away.
  const { rows: servers } = await query(
    'SELECT DISTINCT s.* FROM servers s JOIN devices d ON d.server_id = s.id WHERE d.user_id = $1 AND s.enabled',
    [user.id],
  );
  await query(
    `UPDATE users SET deleted_at = now(), access_until = LEAST(access_until, now()), token_version = token_version + 1
      WHERE id = $1`,
    [user.id],
  );
  // Payments still waiting for review can't be approved any more: close them.
  await query(
    `UPDATE payments SET status = 'rejected', review_note = 'Account deleted by the customer', reviewed_at = now()
      WHERE user_id = $1 AND status = 'pending'`,
    [user.id],
  );
  await endAllSessions(user.id);
  for (const s of servers) await reconcileServer(s).catch((e) => console.error(`[account] ${e.message}`));
  clearSession(res);
  res.json({ ok: true });
});

// ---------- Profile: edit your own details ----------

const cleanName = (v) => String(v ?? '').trim();

// Name. Admins must have one; for customers it's optional (key accounts can stay anonymous).
router.patch('/profile', requireAuth, async (req, res) => {
  const firstName = cleanName(req.body?.firstName);
  const lastName = cleanName(req.body?.lastName);
  if (firstName.length > 50 || lastName.length > 50) return fail(res, 400, 'names_too_long');
  if (req.user.is_admin && (!firstName || !lastName)) return fail(res, 400, 'names_required');
  const user = await one('UPDATE users SET first_name = $2, last_name = $3 WHERE id = $1 RETURNING *', [
    req.user.id,
    firstName,
    lastName,
  ]);
  res.json({ user: publicUser(user) });
});

// Change password (email accounts). Other devices are signed out; this one stays signed in.
router.post('/password', requireAuth, deleteLimiter, async (req, res) => {
  const user = req.user;
  if (user.auth_type !== 'email') return fail(res, 400, 'not_for_key_accounts');
  if (!(await bcrypt.compare(String(req.body?.currentPassword || ''), user.password_hash))) {
    return fail(res, 401, 'wrong_password');
  }
  const password = String(req.body?.newPassword || '');
  if (password.length < 8) return fail(res, 400, 'password_short');
  if (password !== String(req.body?.newPasswordConfirm ?? '')) return fail(res, 400, 'password_mismatch');
  const updated = await one(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING *',
    [user.id, await bcrypt.hash(password, 12)],
  );
  // Other devices are signed out; this one gets a fresh session.
  await query('DELETE FROM sessions WHERE user_id = $1', [updated.id]);
  await setSession(res, updated, req);
  res.json({ ok: true });
});

// Change email (email accounts), step 1: send a code to the NEW address.
router.post('/email', requireAuth, deleteLimiter, async (req, res) => {
  const user = req.user;
  if (user.auth_type !== 'email') return fail(res, 400, 'not_for_key_accounts');
  if (!(await bcrypt.compare(String(req.body?.password || ''), user.password_hash))) {
    return fail(res, 401, 'wrong_password');
  }
  const email = String(req.body?.newEmail || '').trim().toLowerCase();
  if (!validEmailFormat(email)) return fail(res, 400, 'invalid_email');
  if (canonicalEmail(email) === user.email_canonical) return fail(res, 400, 'same_email');
  if (isDisposable(email)) return fail(res, 400, 'email_disposable');
  if (!(await domainAcceptsMail(email))) return fail(res, 400, 'email_domain_invalid');
  if (await one('SELECT 1 FROM users WHERE email_canonical = $1', [canonicalEmail(email)])) {
    return fail(res, 409, 'email_taken');
  }
  await query('UPDATE users SET pending_email = $2 WHERE id = $1', [user.id, email]);
  // The code goes to the new address, proving the person can read it.
  await issueCode({ ...user, email }, 'email', req.body?.lang === 'ru' ? 'ru' : 'en');
  res.json({ challenge: createChallenge(user.id, 'email'), email });
});

// Change email, step 2: the code from the new inbox.
router.post('/email/confirm', requireAuth, async (req, res) => {
  const c = readChallenge(req.body?.challenge, ['email']);
  if (c.sub !== req.user.id || !req.user.pending_email) return fail(res, 400, 'challenge_expired');
  await checkCode(req.user.id, 'email', req.body?.code);
  const email = req.user.pending_email;
  const canonical = canonicalEmail(email);
  if (await one('SELECT 1 FROM users WHERE email_canonical = $1 AND id <> $2', [canonical, req.user.id])) {
    return fail(res, 409, 'email_taken');
  }
  const user = await one(
    `UPDATE users SET email = $2, email_canonical = $3, pending_email = NULL, email_verified = TRUE
      WHERE id = $1 RETURNING *`,
    [req.user.id, email, canonical],
  );
  res.json({ user: publicUser(user) });
});

// Show the customer their own access key. New keys are only issued by an admin
// (Admin → Customers → new key), so a lost key always goes through support.
router.get('/key', requireCustomer, async (req, res) => {
  const user = req.user;
  if (user.auth_type !== 'key') return fail(res, 400, 'not_for_email_accounts');
  let accessKey = null;
  try {
    accessKey = user.access_key_enc ? decrypt(user.access_key_enc) : null;
  } catch {
    accessKey = null;
  }
  // null = an older account whose key was only stored in one-way (hashed) form
  res.set('Cache-Control', 'no-store');
  res.json({ accessKey });
});

export default router;
