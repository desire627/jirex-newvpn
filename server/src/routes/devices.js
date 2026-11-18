import { Router } from 'express';
import { agentRequest } from '../agentClient.js';
import { hasAccess, requireCustomer } from '../auth.js';
import { config } from '../config.js';
import { decrypt, encrypt, generateWireguardKeyPair } from '../crypto.js';
import { one, query } from '../db.js';
import { HttpError, fail } from '../errors.js';
import { MAX_IP_INDEX, MIN_IP_INDEX, buildClientConfig, clientAddress, reconcileServer } from '../peers.js';

const router = Router();

// Public list of locations the customer can pick from.
router.get('/servers', requireCustomer, async (req, res) => {
  const { rows } = await query('SELECT id, name, country FROM servers WHERE enabled ORDER BY name');
  res.json({ servers: rows });
});

const DEVICE_KINDS = ['phone', 'tablet', 'laptop', 'desktop'];

// Ask each VPN server when this customer's devices last connected. Best effort:
// an unreachable server just means "unknown", never a failed page.
async function lastHandshakes(rows) {
  const serverIds = [...new Set(rows.map((r) => r.server_id))];
  const handshakes = new Map();
  await Promise.allSettled(
    serverIds.map(async (id) => {
      const server = await one('SELECT * FROM servers WHERE id = $1 AND enabled', [id]);
      if (!server) return;
      const peers = await agentRequest(server, 'GET', '/peers');
      for (const p of peers) handshakes.set(p.publicKey, p.latestHandshake);
    }),
  );
  return handshakes;
}

router.get('/devices', requireCustomer, async (req, res) => {
  const { rows } = await query(
    `SELECT d.id, d.name, d.kind, d.ip_index, d.public_key, d.server_id, d.created_at,
            s.name AS server_name, s.country
       FROM devices d JOIN servers s ON s.id = d.server_id
      WHERE d.user_id = $1 ORDER BY d.created_at`,
    [req.user.id],
  );
  const handshakes = rows.length ? await lastHandshakes(rows) : new Map();
  res.json({
    devices: rows.map((d) => {
      const hs = handshakes.get(d.public_key);
      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        address: clientAddress(d.ip_index),
        server: d.server_name,
        country: d.country,
        createdAt: d.created_at,
        // seconds since epoch of the last WireGuard handshake; null = never / unknown
        lastSeen: hs ? hs : null,
      };
    }),
  });
});

async function nextFreeIpIndex(serverId) {
  const { rows } = await query('SELECT ip_index FROM devices WHERE server_id = $1 ORDER BY ip_index', [serverId]);
  let candidate = MIN_IP_INDEX;
  for (const { ip_index } of rows) {
    if (ip_index > candidate) break;
    if (ip_index === candidate) candidate++;
  }
  if (candidate > MAX_IP_INDEX) throw new HttpError(409, 'server_full');
  return candidate;
}

router.post('/devices', requireCustomer, async (req, res) => {
  if (!hasAccess(req.user)) return fail(res, 402, 'plan_required');

  const name = String(req.body.name || '').trim().slice(0, 40) || 'My device';
  const kind = DEVICE_KINDS.includes(req.body.kind) ? req.body.kind : 'phone';
  const server = await one('SELECT * FROM servers WHERE id = $1 AND enabled', [Number(req.body.serverId)]);
  if (!server) return fail(res, 400, 'choose_location');

  const { count } = await one('SELECT count(*)::int AS count FROM devices WHERE user_id = $1', [req.user.id]);
  if (count >= config.maxDevices) {
    return fail(res, 409, 'device_limit', { max: config.maxDevices });
  }

  const keys = generateWireguardKeyPair();
  let device;
  for (let attempt = 0; attempt < 5 && !device; attempt++) {
    try {
      device = await one(
        `INSERT INTO devices (user_id, server_id, name, kind, public_key, private_key_enc, ip_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, server.id, name, kind, keys.publicKey, encrypt(keys.privateKey), await nextFreeIpIndex(server.id)],
      );
    } catch (err) {
      if (err.code !== '23505') throw err; // another device grabbed the same IP; retry
    }
  }
  if (!device) return fail(res, 503, 'try_again');

  try {
    await reconcileServer(server);
  } catch (err) {
    console.error(`[devices] could not push peer to ${server.name}: ${err.message}`);
  }
  res.status(201).json({
    id: device.id,
    name: device.name,
    kind: device.kind,
    config: buildClientConfig({ privateKey: keys.privateKey, ipIndex: device.ip_index, server }),
  });
});

router.get('/devices/:id/config', requireCustomer, async (req, res) => {
  const row = await one(
    `SELECT d.*, s.public_key AS s_public_key, s.endpoint, s.dns, s.obfuscation
       FROM devices d JOIN servers s ON s.id = d.server_id
      WHERE d.id = $1 AND d.user_id = $2`,
    [Number(req.params.id), req.user.id],
  );
  if (!row) return fail(res, 404, 'device_not_found');
  res.json({
    id: row.id,
    name: row.name,
    kind: row.kind,
    config: buildClientConfig({
      privateKey: decrypt(row.private_key_enc),
      ipIndex: row.ip_index,
      server: { public_key: row.s_public_key, endpoint: row.endpoint, dns: row.dns, obfuscation: row.obfuscation },
    }),
  });
});

router.delete('/devices/:id', requireCustomer, async (req, res) => {
  const device = await one('DELETE FROM devices WHERE id = $1 AND user_id = $2 RETURNING server_id', [
    Number(req.params.id),
    req.user.id,
  ]);
  if (!device) return fail(res, 404, 'device_not_found');
  const server = await one('SELECT * FROM servers WHERE id = $1', [device.server_id]);
  try {
    if (server?.enabled) await reconcileServer(server);
  } catch (err) {
    console.error(`[devices] could not remove peer from ${server.name}: ${err.message}`);
  }
  res.json({ ok: true });
});

export default router;
