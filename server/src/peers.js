import { agentRequest } from './agentClient.js';
import { query } from './db.js';

// Client addresses live in 10.8.0.0/16; 10.8.0.1 is the server itself.
export const MIN_IP_INDEX = 2;
export const MAX_IP_INDEX = 65534;

export function clientAddress(ipIndex) {
  return `10.8.${Math.floor(ipIndex / 256)}.${ipIndex % 256}`;
}

// AmneziaWG settings, in the order they appear in configs.
export const OBFUSCATION_KEYS = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'H1', 'H2', 'H3', 'H4'];

// Checks the values against the limits in the AmneziaWG documentation.
export function validObfuscation(o) {
  if (!o || typeof o !== 'object') return false;
  const n = Object.fromEntries(OBFUSCATION_KEYS.map((k) => [k, Number(o[k])]));
  if (!OBFUSCATION_KEYS.every((k) => Number.isInteger(n[k]) && n[k] >= 0)) return false;
  const hs = [n.H1, n.H2, n.H3, n.H4];
  return (
    n.Jc >= 1 && n.Jc <= 128 &&
    n.Jmin < n.Jmax && n.Jmax <= 1280 &&
    n.S1 <= 1132 && n.S2 <= 1188 && n.S1 + 56 !== n.S2 &&
    new Set(hs).size === 4 && hs.every((h) => h >= 5 && h <= 2147483647)
  );
}

export function buildClientConfig({ privateKey, ipIndex, server }) {
  const o = server.obfuscation;
  return [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${clientAddress(ipIndex)}/32`,
    `DNS = ${server.dns}`,
    ...(o ? OBFUSCATION_KEYS.map((k) => `${k} = ${o[k]}`) : []),
    '',
    '[Peer]',
    `PublicKey = ${server.public_key}`,
    `Endpoint = ${server.endpoint}`,
    // ::/0 sends IPv6 into the tunnel too, which prevents IPv6 leaks
    'AllowedIPs = 0.0.0.0/0, ::/0',
    'PersistentKeepalive = 25',
    '',
  ].join('\n');
}

// Makes the server's live WireGuard peers exactly match "devices of paying customers".
// This one function handles new devices, deleted devices, expired subscriptions,
// renewals and server reboots.
export async function reconcileServer(server) {
  const { rows } = await query(
    `SELECT d.public_key, d.ip_index
       FROM devices d JOIN users u ON u.id = d.user_id
      WHERE d.server_id = $1 AND u.access_until > now()`,
    [server.id],
  );
  const desired = new Map(rows.map((r) => [r.public_key, `${clientAddress(r.ip_index)}/32`]));
  const live = await agentRequest(server, 'GET', '/peers');
  const liveMap = new Map(live.map((p) => [p.publicKey, p.allowedIps]));

  let added = 0;
  let removed = 0;
  for (const [publicKey, allowedIp] of desired) {
    if (liveMap.get(publicKey) !== allowedIp) {
      await agentRequest(server, 'POST', '/peers', { publicKey, allowedIp });
      added++;
    }
  }
  for (const publicKey of liveMap.keys()) {
    if (!desired.has(publicKey)) {
      await agentRequest(server, 'POST', '/peers/remove', { publicKey });
      removed++;
    }
  }
  if (added || removed) console.log(`[sync] ${server.name}: +${added} -${removed} peers`);
}

export async function reconcileAll() {
  const { rows: servers } = await query('SELECT * FROM servers WHERE enabled');
  for (const server of servers) {
    try {
      await reconcileServer(server);
    } catch (err) {
      console.error(`[sync] ${server.name} failed: ${err.message}`);
    }
  }
}

// Called after a payment or cancellation so the change takes effect immediately
// instead of waiting for the next periodic sync.
export async function syncUser(userId) {
  const { rows: servers } = await query(
    `SELECT DISTINCT s.* FROM servers s JOIN devices d ON d.server_id = s.id
      WHERE d.user_id = $1 AND s.enabled`,
    [userId],
  );
  for (const server of servers) {
    try {
      await reconcileServer(server);
    } catch (err) {
      console.error(`[sync] ${server.name} failed: ${err.message}`);
    }
  }
}
