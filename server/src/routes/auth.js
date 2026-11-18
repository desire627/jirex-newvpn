import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { clearSession, endAllSessions, endSession, hashAccessKey, newCustomerCode, publicUser, requireAuth, setSession } from '../auth.js';
import { config } from '../config.js';
import { encrypt } from '../crypto.js';
import { one } from '../db.js';
import { canonicalEmail, domainAcceptsMail, isDisposable, validEmailFormat } from '../email.js';
import { fail } from '../errors.js';
import { checkCode, createChallenge, issueCode, readChallenge } from '../otp.js';

// Customers authenticate with their generated access key. Admins use email/password plus a
// one-time email code, and must verify the address before their first sign-in.

const router = Router();
const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => fail(res, 429, 'too_many_requests'),
  });
// Attempts per 15 minutes from one network (AUTH_RATE_LIMIT scales both, default 20/30).
const base = Number(process.env.AUTH_RATE_LIMIT) || 20;
const startLimiter = limiter(base); // register, login, forgot
const codeLimiter = limiter(Math.round(base * 1.5)); // otp, resend, reset
// Anti-spam: at most 5 new sign-ups per hour from one network (SIGNUP_LIMIT_PER_HOUR to change).
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.SIGNUP_LIMIT_PER_HOUR) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'too_many_signups'),
});

const langOf = (req) => (req.body?.lang === 'ru' ? 'ru' : 'en');
const cleanEmail = (v) => String(v || '').trim().toLowerCase();

// Finds the account for an email, treating variants of the same inbox as one.
const findByEmail = async (email) =>
  validEmailFormat(email)
    ? one("SELECT * FROM users WHERE email_canonical = $1 AND is_admin AND auth_type = 'email'", [canonicalEmail(email)])
    : null;

router.get('/admin/bootstrap-status', async (req, res) => {
  const admin = await one("SELECT id FROM users WHERE is_admin AND auth_type = 'email' LIMIT 1");
  res.json({ available: Boolean(config.adminEmail && !admin) });
});

router.post('/admin/bootstrap', startLimiter, signupLimiter, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const firstName = String(req.body?.firstName || '').trim().slice(0, 50);
  const lastName = String(req.body?.lastName || '').trim().slice(0, 50);
  if (!firstName || !lastName) return fail(res, 400, 'names_required');
  if (!config.adminEmail || email !== config.adminEmail) return fail(res, 403, 'bootstrap_unavailable');
  if (!validEmailFormat(email)) return fail(res, 400, 'invalid_email');
  if (password.length < 8) return fail(res, 400, 'password_short');
  if (password !== String(req.body?.passwordConfirm ?? '')) return fail(res, 400, 'password_mismatch');
  if (isDisposable(email)) return fail(res, 400, 'email_disposable');
  if (!(await domainAcceptsMail(email))) return fail(res, 400, 'email_domain_invalid');
  if (await one("SELECT id FROM users WHERE is_admin AND auth_type = 'email' LIMIT 1")) {
    return fail(res, 409, 'bootstrap_unavailable');
  }

  const canonical = canonicalEmail(email);
  let user = await one('SELECT * FROM users WHERE email_canonical = $1', [canonical]);
  const passwordHash = await bcrypt.hash(password, 12);
  if (user) {
    if (user.is_admin || user.email_verified || user.auth_type !== 'email') {
      return fail(res, 409, 'bootstrap_unavailable');
    }
    user = await one(
      `UPDATE users SET email = $2, password_hash = $3, is_admin = TRUE, first_name = $4, last_name = $5
        WHERE id = $1 RETURNING *`,
      [user.id, email, passwordHash, firstName, lastName],
    );
  } else {
    user = await one(
      `INSERT INTO users (email, email_canonical, password_hash, is_admin, first_name, last_name)
       VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING *`,
      [email, canonical, passwordHash, firstName, lastName],
    );
  }
  await issueCode(user, 'verify', langOf(req), { reuse: true });
  res.status(201).json({ challenge: createChallenge(user.id, 'verify'), purpose: 'verify', email });
});

router.post('/register', startLimiter, signupLimiter, async (req, res) => {
  const key = crypto.randomUUID();
  let user;
  for (let attempt = 0; !user; attempt++) {
    try {
      user = await one(
        `INSERT INTO users (auth_type, access_key_hash, access_key_enc, customer_code)
         VALUES ('key', $1, $2, $3) RETURNING *`,
        [hashAccessKey(key), encrypt(key), newCustomerCode()],
      );
    } catch (err) {
      if (err.code !== '23505' || attempt >= 4) throw err; // customer code already taken: pick another
    }
  }
  res.status(201).json({ accessKey: key, user: publicUser(user) });
});

router.post('/login', startLimiter, async (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(key)) {
    return fail(res, 401, 'wrong_login');
  }
  const user = await one("SELECT * FROM users WHERE access_key_hash = $1 AND auth_type = 'key' AND deleted_at IS NULL", [hashAccessKey(key)]);
  if (!user) return fail(res, 401, 'wrong_login');
  await setSession(res, user, req);
  res.json({ user: publicUser(user) });
});

router.post('/admin/login', startLimiter, async (req, res) => {
  const user = await findByEmail(cleanEmail(req.body?.email));
  if (!user || !(await bcrypt.compare(String(req.body?.password || ''), user.password_hash))) {
    return fail(res, 401, 'wrong_login');
  }
  // An unverified admin must verify the email first; the UI then returns to admin sign-in.
  const purpose = user.email_verified ? 'login' : 'verify';
  await issueCode(user, purpose, langOf(req), { reuse: true });
  res.json({ challenge: createChallenge(user.id, purpose), purpose, email: user.email });
});

// Step 2 for admin verification and sign-in.
router.post('/otp', codeLimiter, async (req, res) => {
  const c = readChallenge(req.body.challenge, ['verify', 'login']);
  await checkCode(c.sub, c.purpose, req.body.code);
  let user = await one('SELECT * FROM users WHERE id = $1', [c.sub]);
  if (!user) return fail(res, 400, 'challenge_expired');
  if (c.purpose === 'verify') {
    user = await one(
      'UPDATE users SET email_verified = TRUE, is_admin = is_admin OR email = $2 WHERE id = $1 RETURNING *',
      [user.id, config.adminEmail],
    );
    if (user.is_admin) return res.json({ requiresSignIn: true });
  }
  await setSession(res, user, req);
  res.json({ user: publicUser(user), firstTime: c.purpose === 'verify' });
});

router.post('/resend', codeLimiter, async (req, res) => {
  const c = readChallenge(req.body.challenge, ['verify', 'login', 'reset']);
  const user = c.sub ? await one('SELECT * FROM users WHERE id = $1', [c.sub]) : null;
  // For an unknown email (password reset) pretend it worked, so accounts can't be discovered.
  if (user) await issueCode(user, c.purpose, langOf(req));
  res.json({ ok: true });
});

router.post('/forgot', startLimiter, async (req, res) => {
  const email = cleanEmail(req.body.email);
  if (!validEmailFormat(email)) return fail(res, 400, 'invalid_email');
  const user = await findByEmail(email);
  if (user) {
    try {
      await issueCode(user, 'reset', langOf(req), { reuse: true });
    } catch (err) {
      // Limits are applied silently here: a different answer would reveal the account exists.
      if (!['resend_wait', 'too_many_codes'].includes(err.code)) throw err;
    }
  }
  // Same answer whether or not the account exists.
  res.json({ challenge: createChallenge(user ? user.id : 0, 'reset'), purpose: 'reset', email });
});

router.post('/reset', codeLimiter, async (req, res) => {
  const c = readChallenge(req.body.challenge, ['reset']);
  const password = String(req.body.password || '');
  if (password.length < 8) return fail(res, 400, 'password_short');
  if (password !== String(req.body.passwordConfirm ?? '')) return fail(res, 400, 'password_mismatch');
  await checkCode(c.sub, 'reset', req.body.code);
  // New password, inbox proven, and every existing session is signed out.
  const user = await one(
    `UPDATE users SET password_hash = $2, email_verified = TRUE, token_version = token_version + 1,
            is_admin = is_admin OR email = $3
      WHERE id = $1 RETURNING *`,
    [c.sub, await bcrypt.hash(password, 12), config.adminEmail],
  );
  if (!user) return fail(res, 400, 'code_invalid');
  await setSession(res, user, req);
  res.json({ user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

// "Sign out everywhere": every device of this account, including this one.
router.post('/logout-all', requireAuth, async (req, res) => {
  await endAllSessions(req.user.id);
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
