import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one, query } from './db.js';
import { fail } from './errors.js';

const COOKIE = 'session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const hashAccessKey = (key) => crypto.createHash('sha256').update(String(key).toLowerCase()).digest('hex');

const COOKIE_OPTIONS = { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' };

// Reads this browser's session token, even if it has expired (used when signing out).
function readToken(req) {
  const token = req?.cookies?.[COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, { ignoreExpiration: true });
  } catch {
    return null;
  }
}

// Every sign-in creates a session record on the server; the cookie only carries its id.
// Signing out deletes the record, so a copied cookie stops working straight away.
// The token also carries token_version; bumping it signs the account out everywhere.
export async function setSession(res, user, req) {
  const previous = readToken(req);
  if (previous?.sid) await query('DELETE FROM sessions WHERE id = $1', [previous.sid]);
  const sid = crypto.randomBytes(24).toString('base64url');
  await query(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent)
     VALUES ($1, $2, now() + interval '30 days', $3)`,
    [sid, user.id, String(req?.headers?.['user-agent'] || '').slice(0, 200)],
  );
  const token = jwt.sign({ sub: user.id, ver: user.token_version, sid, typ: 'session' }, config.jwtSecret, {
    expiresIn: '30d',
  });
  res.cookie(COOKIE, token, { ...COOKIE_OPTIONS, maxAge: MAX_AGE_MS });
}

// Removes only the cookie (e.g. after the account itself was deleted).
export function clearSession(res) {
  res.clearCookie(COOKIE, COOKIE_OPTIONS);
}

// Sign out this browser: delete its session on the server and remove the cookie.
export async function endSession(req, res) {
  const t = readToken(req);
  if (t?.sid) await query('DELETE FROM sessions WHERE id = $1', [t.sid]);
  clearSession(res);
}

// Sign out every device of this account.
export async function endAllSessions(userId) {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) return fail(res, 401, 'not_logged_in');
    const { sub, ver, sid, typ } = jwt.verify(token, config.jwtSecret);
    if (typ !== 'session' || !sid) return fail(res, 401, 'not_logged_in');
    // The session must still exist on the server (it's deleted when you sign out).
    const user = await one(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.expires_at > now()`,
      [sid, sub],
    );
    if (!user || user.deleted_at || (user.auth_type !== 'key' && !user.email_verified) || user.token_version !== ver) {
      return fail(res, 401, 'not_logged_in');
    }
    req.user = user;
    req.sessionId = sid;
    next();
  } catch {
    fail(res, 401, 'not_logged_in');
  }
}

// Customer-only features (plans, payments, devices). Admins run the business; they aren't customers.
export async function requireCustomer(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.is_admin) return fail(res, 403, 'admin_not_customer');
    next();
  });
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return fail(res, 403, 'admins_only');
  next();
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export function newCustomerCode() {
  const pick = () => Array.from({ length: 3 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  return `JX-${pick()}-${pick()}`;
}

export function hasAccess(user) {
  return Boolean(user.access_until && new Date(user.access_until) > new Date());
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    loginType: user.auth_type,
    firstName: user.first_name,
    lastName: user.last_name,
    isAdmin: user.is_admin,
    accessUntil: user.access_until,
    active: hasAccess(user),
    createdAt: user.created_at,
    customerCode: user.customer_code || null,
  };
}
