import { Router } from 'express';
import { agentRequest } from '../agentClient.js';
import { hasAccess, requireCustomer } from '../auth.js';
import { config } from '../config.js';
import { decrypt, encrypt, generateWireguardKeyPair } from '../crypto.js';
import { one, query, transaction } from '../db.js';
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

async function nextFreeIpIndex(client, serverId) {
  const { rows } = await client.query('SELECT ip_index FROM devices WHERE server_id = $1 ORDER BY ip_index', [serverId]);
  let candidate = MIN_IP_INDEX;
  for (const { ip_index } of rows) {
    if (ip_index > candidate) break;
    if (ip_index === candidate) candidate++;
  }
  if (candidate > MAX_IP_INDEX) throw new HttpError(409, 'server_full');
  return candidate;
}

router.post('/devices', requireCustomer, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40) || 'My device';
  const kind = DEVICE_KINDS.includes(req.body.kind) ? req.body.kind : 'phone';
  const server = await one('SELECT * FROM servers WHERE id = $1 AND enabled', [Number(req.body.serverId)]);
  if (!server) return fail(res, 400, 'choose_location');
  const installationId = req.body.installationId ?? null;
  if (installationId !== null && (typeof installationId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId))) {
    return fail(res, 400, 'invalid_installation');
  }
  const { device, created } = await transaction(async (client) => {
    const { rows: [user] } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (!user || user.deleted_at || !hasAccess(user)) throw new HttpError(402, 'plan_required');
    if (installationId) {
      const { rows: [registered] } = await client.query(
        'SELECT * FROM devices WHERE user_id = $1 AND server_id = $2 AND installation_id = $3',
        [user.id, server.id, installationId],
      );
      if (registered) return { device: registered, created: false };
    }
    const { rows: [{ count }] } = await client.query('SELECT count(*)::int AS count FROM devices WHERE user_id = $1', [user.id]);
    if (count >= config.maxDevices) throw new HttpError(409, 'device_limit', { max: config.maxDevices });
    const keys = generateWireguardKeyPair();
    const privateKey = encrypt(keys.privateKey);
    for (let attempt = 0; attempt < 5; attempt++) {
      const ip = await nextFreeIpIndex(client, server.id);
      const { rows: [registered] } = await client.query(
        `INSERT INTO devices (user_id, server_id, name, kind, public_key, private_key_enc, ip_index, installation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (server_id, ip_index) DO NOTHING RETURNING *`,
        [user.id, server.id, name, kind, keys.publicKey, privateKey, ip, installationId],
      );
      if (registered) return { device: registered, created: true };
    }
    throw new HttpError(503, 'try_again');
  });

  try {
    await reconcileServer(server);
  } catch (err) {
    console.error(`[devices] could not push peer to ${server.name}: ${err.message}`);
  }
  res.status(created ? 201 : 200).json({
    id: device.id,
    name: device.name,
    kind: device.kind,
    config: buildClientConfig({ privateKey: decrypt(device.private_key_enc), ipIndex: device.ip_index, server }),
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
  const configuration = buildClientConfig({
    privateKey: decrypt(row.private_key_enc),
    ipIndex: row.ip_index,
    server: { public_key: row.s_public_key, endpoint: row.endpoint, dns: row.dns, obfuscation: row.obfuscation },
  });
  res.set('Cache-Control', 'private, no-store');
  if (req.query.download === '1') {
    const name = String(req.query.name || '').match(/^[a-zA-Z0-9_=+.-]{1,15}\.conf$/)?.[0] || 'jirex.conf';
    return res.attachment(name).type('text/plain').send(configuration);
  }
  res.json({
    id: row.id,
    name: row.name,
    kind: row.kind,
    config: configuration,
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
