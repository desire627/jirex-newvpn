import bcrypt from 'bcryptjs';
import { Router } from 'express';
import crypto from 'node:crypto';
import { hashAccessKey, requireAdmin, requireAuth } from '../auth.js';
import { agentRequest } from '../agentClient.js';
import { extendAccess } from '../billing.js';
import { getSetting, one, query, setSetting } from '../db.js';
import { getPlan, listPlans, newPlanId, readPlanInput } from '../plans.js';
import { encrypt } from '../crypto.js';
import { fail } from '../errors.js';
import { canonicalEmail, domainAcceptsMail, isDisposable, validEmailFormat } from '../email.js';
import { issueCode } from '../otp.js';
import { reconcileServer, validObfuscation } from '../peers.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ?page=1&pageSize=10 → { limit, offset, page, pageSize }
function paging(req, fallbackSize = 10) {
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || fallbackSize));
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

router.get('/admins', async (req, res) => {
  const { page, pageSize, limit, offset } = paging(req);
  const { rows } = await query(
    `SELECT id, email, first_name, last_name, email_verified, created_at
       FROM users WHERE is_admin AND auth_type = 'email'
      ORDER BY created_at, id LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const { total } = await one("SELECT count(*)::int AS total FROM users WHERE is_admin AND auth_type = 'email'");
  res.json({ admins: rows, total, page, pageSize });
});

router.post('/admins', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const firstName = String(req.body?.firstName || '').trim().slice(0, 50);
  const lastName = String(req.body?.lastName || '').trim().slice(0, 50);
  if (!firstName || !lastName) return fail(res, 400, 'names_required');
  if (!validEmailFormat(email)) return fail(res, 400, 'invalid_email');
  if (password.length < 8) return fail(res, 400, 'password_short');
  if (password !== String(req.body?.passwordConfirm ?? '')) return fail(res, 400, 'password_mismatch');
  if (isDisposable(email)) return fail(res, 400, 'email_disposable');
  if (!(await domainAcceptsMail(email))) return fail(res, 400, 'email_domain_invalid');

  const canonical = canonicalEmail(email);
  let user = await one('SELECT * FROM users WHERE email_canonical = $1', [canonical]);
  if (user && (!user.is_admin || user.email_verified)) return fail(res, 409, 'email_taken');

  const passwordHash = await bcrypt.hash(password, 12);
  if (user) {
    user = await one(
      `UPDATE users SET email = $2, password_hash = $3, first_name = $4, last_name = $5
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
  await issueCode(user, 'verify', req.body?.lang === 'ru' ? 'ru' : 'en', { reuse: true });
  res.status(201).json({ email: user.email });
});

router.get('/stats', async (req, res) => {
  const users = await one(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE access_until > now())::int AS active
       FROM users WHERE NOT is_admin AND deleted_at IS NULL`,
  );
  const devices = await one(
    'SELECT count(*)::int AS total FROM devices d JOIN users u ON u.id = d.user_id WHERE u.deleted_at IS NULL',
  );
  const { rows: revenue } = await query(
    `SELECT currency, sum(amount)::float AS total, count(*)::int AS payments
       FROM payments
      WHERE status = 'successful' AND created_at > now() - interval '30 days'
      GROUP BY currency ORDER BY currency`,
  );
  const pending = await one(
    `SELECT count(*)::int AS n FROM payments WHERE status = 'pending'`,
  );
  res.json({ users, devices: devices.total, revenue30d: revenue, pendingReviews: pending.n });
});

router.get('/users', async (req, res) => {
  const { page, pageSize, limit, offset } = paging(req);
  const search = `%${String(req.query.q || '').toLowerCase()}%`;
  const status = req.query.status;
  const where = `WHERE NOT u.is_admin
        AND (COALESCE(u.email, '') LIKE $1 OR lower(u.first_name || ' ' || u.last_name) LIKE $1
             OR lower(COALESCE(u.customer_code, '')) LIKE $1
             OR replace(lower(COALESCE(u.customer_code, '')), '-', '') LIKE replace($1, '-', ''))
        ${status === 'active' ? 'AND u.access_until > now()' : ''}
        ${status === 'inactive' ? 'AND (u.access_until IS NULL OR u.access_until <= now())' : ''}`;
  const { rows } = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin, u.email_verified, u.auth_type, u.access_until, u.created_at,
            u.customer_code, u.deleted_at,
            (SELECT count(*)::int FROM devices d WHERE d.user_id = u.id) AS devices
       FROM users u
      ${where}
      ORDER BY (u.deleted_at IS NOT NULL), u.created_at DESC, u.id DESC LIMIT $2 OFFSET $3`,
    [search, limit, offset],
  );
  const { total } = await one(`SELECT count(*)::int AS total FROM users u ${where}`, [search]);
  res.json({ users: rows, total, page, pageSize });
});

// ---------- Plans: prices and the plans shown on the website ----------
router.get('/plans', async (req, res) => {
  const plans = await listPlans();
  const { rows } = await query('SELECT plan, count(*)::int AS n FROM payments GROUP BY plan');
  const used = Object.fromEntries(rows.map((r) => [r.plan, r.n]));
  res.json({ plans: plans.map((p) => ({ ...p, payments: used[p.id] || 0 })) });
});

router.post('/plans', async (req, res) => {
  const { error, values } = readPlanInput(req.body);
  if (error) return fail(res, 400, error);
  const id = newPlanId(values.name_en);
  if (values.featured) await query('UPDATE plans SET featured = FALSE');
  await query(
    `INSERT INTO plans (id, name_en, name_ru, days, price, active, featured)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, values.name_en, values.name_ru, values.days, values.price, values.active ?? true, values.featured ?? false],
  );
  res.status(201).json({ plan: await getPlan(id) });
});

router.patch('/plans/:id', async (req, res) => {
  const plan = await getPlan(req.params.id);
  if (!plan) return fail(res, 404, 'plan_not_found');
  const { error, values } = readPlanInput(req.body, { partial: true });
  if (error) return fail(res, 400, error);
  if (values.active === false && plan.active) {
    const { n } = await one('SELECT count(*)::int AS n FROM plans WHERE active AND id <> $1', [plan.id]);
    if (n === 0) return fail(res, 400, 'last_plan');
  }
  if (values.featured) await query('UPDATE plans SET featured = FALSE WHERE id <> $1', [plan.id]);
  const keys = Object.keys(values);
  if (keys.length) {
    await query(
      `UPDATE plans SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [plan.id, ...keys.map((k) => values[k])],
    );
  }
  res.json({ plan: await getPlan(plan.id) });
});

// Only plans nobody has paid for can be deleted; others can be hidden instead.
router.delete('/plans/:id', async (req, res) => {
  const plan = await getPlan(req.params.id);
  if (!plan) return fail(res, 404, 'plan_not_found');
  if (await one('SELECT 1 FROM payments WHERE plan = $1 LIMIT 1', [plan.id])) return fail(res, 409, 'plan_in_use');
  if (plan.active) {
    const { n } = await one('SELECT count(*)::int AS n FROM plans WHERE active AND id <> $1', [plan.id]);
    if (n === 0) return fail(res, 400, 'last_plan');
  }
  await query('DELETE FROM plans WHERE id = $1', [plan.id]);
  res.json({ ok: true });
});

// For customers who pay you in cash or by direct transfer.
router.post('/users/:id/grant', async (req, res) => {
  const days = Number(req.body.days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return fail(res, 400, 'days_range');
  const user = await one('SELECT id, deleted_at FROM users WHERE id = $1', [Number(req.params.id)]);
  if (!user) return fail(res, 404, 'user_not_found');
  if (user.deleted_at) return fail(res, 400, 'account_deleted');
  await query(
    `INSERT INTO payments (user_id, provider, provider_ref, plan, amount, currency, status)
     VALUES ($1, 'manual', $2, $3, 0, 'N/A', 'successful')`,
    [user.id, `manual-${Date.now()}`, `${days} days`],
  );
  await extendAccess(user.id, days);
  res.json({ ok: true });
});

router.post('/users/:id/revoke', async (req, res) => {
  const user = await one('UPDATE users SET access_until = now() WHERE id = $1 RETURNING id', [Number(req.params.id)]);
  if (!user) return fail(res, 404, 'user_not_found');
  const { rows: servers } = await query(
    'SELECT DISTINCT s.* FROM servers s JOIN devices d ON d.server_id = s.id WHERE d.user_id = $1 AND s.enabled',
    [user.id],
  );
  for (const s of servers) await reconcileServer(s).catch((e) => console.error(e.message));
  res.json({ ok: true });
});

// Reopens an account the customer deleted. Time left on the plan isn't given back; grant days if needed.
router.post('/users/:id/restore', async (req, res) => {
  const user = await one(
    'UPDATE users SET deleted_at = NULL WHERE id = $1 AND NOT is_admin AND deleted_at IS NOT NULL RETURNING id',
    [Number(req.params.id)],
  );
  if (!user) return fail(res, 404, 'user_not_found');
  res.json({ ok: true });
});

router.post('/users/:id/reset-key', async (req, res) => {
  const accessKey = crypto.randomUUID();
  const user = await one(
    `UPDATE users
        SET access_key_hash = $1, access_key_enc = $3, token_version = token_version + 1
      WHERE id = $2 AND auth_type = 'key' AND NOT is_admin
      RETURNING id, customer_code`,
    [hashAccessKey(accessKey), Number(req.params.id), encrypt(accessKey)],
  );
  if (!user) return fail(res, 404, 'user_not_found');
  res.json({ userId: user.id, customerCode: user.customer_code, accessKey });
});

router.get('/payments', async (req, res) => {
  const pendingOnly = req.query.status === 'pending';
  // Receipts waiting for review are all shown at once (oldest first); the history is paged.
  const { page, pageSize, limit, offset } = pendingOnly ? { page: 1, pageSize: 200, limit: 200, offset: 0 } : paging(req);
  const where = pendingOnly ? "WHERE p.status = 'pending'" : '';
  const { rows } = await query(
    `SELECT p.id, p.user_id, p.provider, p.plan, p.amount, p.currency, p.status, p.created_at,
            p.payer_name, p.paid_on, p.note, p.review_note, p.reviewed_at, p.receipt_deleted_at,
            (p.receipt_file IS NOT NULL) AS has_receipt, p.receipt_mime,
            u.email, u.first_name, u.last_name, u.id AS customer_id, u.access_until, u.customer_code, u.deleted_at
       FROM payments p LEFT JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY ${pendingOnly ? 'p.created_at ASC' : 'p.created_at DESC, p.id DESC'} LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const { total } = await one(`SELECT count(*)::int AS total FROM payments p ${where}`);
  res.json({ payments: rows, total, page, pageSize });
});

// Approve a bank-transfer receipt: marks it paid and adds the plan's days.
router.post('/payments/:id/approve', async (req, res) => {
  const payment = await one(
    `UPDATE payments SET status = 'successful', reviewed_at = now(), review_note = NULL
      WHERE id = $1 AND status = 'pending'
      RETURNING user_id, plan`,
    [Number(req.params.id)],
  );
  if (!payment) return fail(res, 409, 'already_reviewed');
  const plan = await getPlan(payment.plan);
  if (payment.user_id && plan) await extendAccess(payment.user_id, plan.days);
  res.json({ ok: true });
});

router.post('/payments/:id/reject', async (req, res) => {
  const reason = String(req.body?.reason || '').trim().slice(0, 300);
  if (!reason) return fail(res, 400, 'reason_required');
  const payment = await one(
    `UPDATE payments SET status = 'rejected', reviewed_at = now(), review_note = $2
      WHERE id = $1 AND status = 'pending' RETURNING id`,
    [Number(req.params.id), reason],
  );
  if (!payment) return fail(res, 409, 'already_reviewed');
  res.json({ ok: true });
});

// ---------- Settings ----------
router.get('/settings', async (req, res) => {
  res.json({ paymentInstructions: await getSetting('payment_instructions') });
});

router.put('/settings', async (req, res) => {
  await setSetting('payment_instructions', String(req.body?.paymentInstructions || '').slice(0, 2000));
  res.json({ ok: true });
});

router.get('/servers', async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.name, s.country, s.endpoint, s.enabled, s.created_at,
            (SELECT count(*)::int FROM devices d WHERE d.server_id = s.id) AS devices
       FROM servers s ORDER BY s.id`,
  );
  res.json({ servers: rows });
});

// Body is the JSON printed at the end of deploy/install-vpn-node.sh, plus name/country.
router.post('/servers', async (req, res) => {
  const b = req.body || {};
  const fields = ['name', 'endpoint', 'publicKey', 'agentUrl', 'agentToken', 'agentCert'];
  const missing = fields.filter((f) => !String(b[f] || '').trim());
  if (missing.length) return fail(res, 400, 'server_fields_missing', { fields: missing.join(', ') });

  if (!validObfuscation(b.obfuscation)) return fail(res, 400, 'obfuscation_invalid');

  const candidate = {
    name: String(b.name).trim(),
    agent_url: String(b.agentUrl).trim(),
    agent_token: String(b.agentToken).trim(),
    agent_cert: String(b.agentCert).trim(),
  };
  try {
    await agentRequest(candidate, 'GET', '/peers');
  } catch (err) {
    return fail(res, 400, 'agent_unreachable', { detail: err.message });
  }
  const server = await one(
    `INSERT INTO servers (name, country, endpoint, public_key, dns, agent_url, agent_token, agent_cert, obfuscation)
     VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, ''), '1.1.1.1, 1.0.0.1'), $6, $7, $8, $9) RETURNING id`,
    [
      candidate.name,
      String(b.country || '').trim() || null,
      String(b.endpoint).trim(),
      String(b.publicKey).trim(),
      String(b.dns || '').trim(),
      candidate.agent_url,
      candidate.agent_token,
      candidate.agent_cert,
      JSON.stringify(b.obfuscation),
    ],
  );
  res.status(201).json({ id: server.id });
});

router.get('/servers/:id/status', async (req, res) => {
  const server = await one('SELECT * FROM servers WHERE id = $1', [Number(req.params.id)]);
  if (!server) return fail(res, 404, 'server_not_found');
  try {
    const peers = await agentRequest(server, 'GET', '/peers');
    const fiveMinAgo = Date.now() / 1000 - 300;
    res.json({
      online: true,
      peers: peers.length,
      connectedNow: peers.filter((p) => p.latestHandshake > fiveMinAgo).length,
      rxBytes: peers.reduce((n, p) => n + p.rxBytes, 0),
      txBytes: peers.reduce((n, p) => n + p.txBytes, 0),
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

router.patch('/servers/:id', async (req, res) => {
  const server = await one('UPDATE servers SET enabled = $2 WHERE id = $1 RETURNING id', [
    Number(req.params.id),
    Boolean(req.body.enabled),
  ]);
  if (!server) return fail(res, 404, 'server_not_found');
  res.json({ ok: true });
});

export default router;
