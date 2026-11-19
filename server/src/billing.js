import { query, transaction } from './db.js';
import { HttpError } from './errors.js';
import { syncUser } from './peers.js';

// Payments are handled entirely inside the site: customers pay by bank transfer,
// upload a receipt, and an admin approves it. Approval calls this.
//
// Adds `days` of access, starting from whichever is later: now, or the current expiry.
function addDays(execute, userId, days) {
  return execute(
    `UPDATE users
        SET access_until = GREATEST(COALESCE(access_until, now()), now()) + make_interval(days => $2)
      WHERE id = $1 AND deleted_at IS NULL`,
    [userId, days],
  );
}

export async function extendAccess(userId, days) {
  await addDays(query, userId, days);
  await syncUser(userId);
}

export async function approveTransfer(paymentId) {
  const userId = await transaction(async (client) => {
    const { rows: [payment] } = await client.query(
      `UPDATE payments SET status = 'successful', reviewed_at = now(), review_note = NULL
        WHERE id = $1 AND provider = 'transfer' AND status = 'pending'
        RETURNING user_id, plan`,
      [paymentId],
    );
    if (!payment) throw new HttpError(409, 'already_reviewed');
    const { rows: [plan] } = await client.query('SELECT days FROM plans WHERE id = $1', [payment.plan]);
    if (!plan) throw new HttpError(409, 'choose_plan');
    const { rowCount } = await addDays(client.query.bind(client), payment.user_id, plan.days);
    if (!rowCount) throw new HttpError(409, 'account_deleted');
    return payment.user_id;
  });
  await syncUser(userId).catch((error) => console.error('[payment sync]', error.message));
}
