#!/usr/bin/env node
// VPN node agent: runs on each AmneziaWG server and lets the API add/remove peers.
// AmneziaWG is WireGuard with traffic camouflage, so DPI systems can't recognise and block it.
// Its `awg` command works exactly like WireGuard's `wg`.
// No npm dependencies. Installed by deploy/install-vpn-node.sh.
//
// Endpoints (all need "Authorization: Bearer <token>"):
//   GET  /peers         -> [{ publicKey, allowedIps, latestHandshake, rxBytes, txBytes }]
//   POST /peers         { publicKey, allowedIp }  add or update a peer
//   POST /peers/remove  { publicKey }             remove a peer

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// AGENT_SIMULATE=1 keeps peers in memory instead of calling `awg`, so the whole system
// can be tried on a Windows/Mac PC without AmneziaWG. Never use it on a real server.
const SIMULATE = process.env.AGENT_SIMULATE === '1';
const simulatedPeers = new Map();

async function run(cmd, args) {
  if (!SIMULATE) return execFileAsync(cmd, args);
  const [, , , publicKey, action, allowedIp] = args; // awg set <iface> peer <key> ...
  if (args[0] === 'show') {
    const lines = [...simulatedPeers].map(([k, ip]) => [k, '(none)', '(none)', ip, 0, 0, 0, 'off'].join('\t'));
    return { stdout: ['simulated-interface', ...lines].join('\n') + '\n' };
  }
  if (action === 'remove') simulatedPeers.delete(publicKey);
  else simulatedPeers.set(publicKey, allowedIp);
  return { stdout: '' };
}

const CONFIG_DIR = process.env.AGENT_CONFIG_DIR || '/etc/vpn-agent';
const IFACE = process.env.WG_INTERFACE || 'awg0';
const WG_BIN = process.env.WG_BIN || 'awg'; // set to 'wg' to manage plain WireGuard instead
const PORT = Number(process.env.AGENT_PORT) || 8443;
const TOKEN = fs.readFileSync(`${CONFIG_DIR}/token`, 'utf8').trim();

const KEY_RE = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/; // 32-byte base64 WireGuard key
const IP_RE = /^10\.8\.(\d{1,3})\.(\d{1,3})\/32$/;

function authorized(req) {
  const given = Buffer.from(String(req.headers.authorization || ''));
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function validIp(ip) {
  const m = IP_RE.exec(ip);
  return Boolean(m) && Number(m[1]) <= 255 && Number(m[2]) <= 255;
}

async function listPeers() {
  const { stdout } = await run(WG_BIN, ['show', IFACE, 'dump']);
  // First line is the interface itself; peer lines have 8 tab-separated fields.
  return stdout
    .trim()
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [publicKey, , , allowedIps, latestHandshake, rxBytes, txBytes] = line.split('\t');
      return {
        publicKey,
        allowedIps,
        latestHandshake: Number(latestHandshake),
        rxBytes: Number(rxBytes),
        txBytes: Number(txBytes),
      };
    });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) req.destroy(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = https.createServer(
  {
    key: fs.readFileSync(`${CONFIG_DIR}/key.pem`),
    cert: fs.readFileSync(`${CONFIG_DIR}/cert.pem`),
  },
  async (req, res) => {
    try {
      if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' });

      if (req.method === 'GET' && req.url === '/peers') {
        return send(res, 200, await listPeers());
      }

      if (req.method === 'POST' && req.url === '/peers') {
        const { publicKey, allowedIp } = await readJson(req);
        if (!KEY_RE.test(publicKey || '') || !validIp(allowedIp || '')) {
          return send(res, 400, { error: 'Invalid publicKey or allowedIp' });
        }
        await run(WG_BIN, ['set', IFACE, 'peer', publicKey, 'allowed-ips', allowedIp]);
        return send(res, 200, { ok: true });
      }

      if (req.method === 'POST' && req.url === '/peers/remove') {
        const { publicKey } = await readJson(req);
        if (!KEY_RE.test(publicKey || '')) return send(res, 400, { error: 'Invalid publicKey' });
        await run(WG_BIN, ['set', IFACE, 'peer', publicKey, 'remove']);
        return send(res, 200, { ok: true });
      }

      send(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'Agent error' });
    }
  },
);

server.listen(PORT, () =>
  console.log(`vpn-agent listening on :${PORT} for ${IFACE}${SIMULATE ? ' (SIMULATED - no real VPN)' : ''}`),
);
