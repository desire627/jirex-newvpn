import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one, query } from './db.js';
import { HttpError } from './errors.js';
import { sendCodeEmail } from './mailer.js';

// One-time codes for admin email verification ('verify'), sign-in ('login') and password reset ('reset').
const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_S = 60;
const MAX_PER_HOUR = 6;
const CHALLENGE_TTL = '20m';

// Codes are never stored in plain text.
const hashCode = (userId, purpose, code) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${purpose}:${code}`).digest('hex');

// The "challenge" ties the code-entry step to the account and purpose, without a session yet.
export function createChallenge(userId, purpose) {
  return jwt.sign({ sub: userId, purpose, typ: 'challenge' }, config.jwtSecret, { expiresIn: CHALLENGE_TTL });
}

export function readChallenge(token, purposes) {
  try {
    const c = jwt.verify(String(token || ''), config.jwtSecret);
    if (c.typ !== 'challenge' || !purposes.includes(c.purpose)) throw new Error('wrong challenge');
    return c;
  } catch {
    throw new HttpError(400, 'challenge_expired');
  }
}

// Creates and emails a new code. With `reuse`, a code sent in the last minute is kept
// (e.g. the person pressed "sign in" twice) instead of sending another email.
export async function issueCode(user, purpose, lang, { reuse = false } = {}) {
  // The 60-second wait only applies while a fresh, unused code of this kind is still in the
  // inbox (stops spamming "resend"). Once a code is used, a new one can be sent right away.
  // The hourly limit counts every code sent to this account.
  const pending = await one(
    `SELECT extract(epoch FROM now() - created_at)::int AS age FROM otp_codes
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [user.id, purpose],
  );
  if (pending && pending.age < RESEND_AFTER_S) {
    if (reuse) return; // e.g. "Continue" pressed twice: the code already sent is still valid
    throw new HttpError(429, 'resend_wait', { seconds: RESEND_AFTER_S - pending.age });
  }
  const { last_hour } = await one(
    `SELECT count(*)::int AS last_hour FROM otp_codes WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [user.id],
  );
  if (last_hour >= MAX_PER_HOUR) throw new HttpError(429, 'too_many_codes');

  await query(`UPDATE otp_codes SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [
    user.id,
    purpose,
  ]);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const row = await one(
    `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id`,
    [user.id, purpose, hashCode(user.id, purpose, code), CODE_TTL_MIN],
  );
  try {
    await sendCodeEmail({ to: user.email, code, purpose, lang, name: user.first_name });
  } catch (err) {
    console.error(`[mail] could not send ${purpose} code to ${user.email}: ${err.message}`);
    await query('DELETE FROM otp_codes WHERE id = $1', [row.id]);
    throw new HttpError(502, 'email_send_failed');
  }
}

// Checks a code. Wrong and expired codes give the same answer, so nobody can learn
// whether an email address has an account.
export async function checkCode(userId, purpose, code) {
  const clean = String(code || '').replace(/\D/g, '');
  const row = userId
    ? await one(
        `SELECT id, code_hash, attempts FROM otp_codes
          WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1`,
        [userId, purpose],
      )
    : null;
  if (!row) throw new HttpError(400, 'code_invalid');
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');

  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(hashCode(userId, purpose, clean), 'hex');
  if (clean.length !== 6 || !crypto.timingSafeEqual(expected, given)) {
    const { attempts } = await one('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [
      row.id,
    ]);
    if (attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');
    throw new HttpError(400, 'code_invalid');
  }
  // Mark used atomically so the same code can't be used twice at once.
  const used = await one('UPDATE otp_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id', [row.id]);
  if (!used) throw new HttpError(400, 'code_invalid');
}
