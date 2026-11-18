import { query } from './db.js';
import { syncUser } from './peers.js';

// Payments are handled entirely inside the site: customers pay by bank transfer,
// upload a receipt, and an admin approves it. Approval calls this.
//
// Adds `days` of access, starting from whichever is later: now, or the current expiry.
export async function extendAccess(userId, days) {
  await query(
    `UPDATE users
        SET access_until = GREATEST(COALESCE(access_until, now()), now()) + make_interval(days => $2)
      WHERE id = $1`,
    [userId, days],
  );
  await syncUser(userId);
}
