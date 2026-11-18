import https from 'node:https';

// Talks to the agent running on a VPN server. The agent uses a self-signed certificate,
// which we pin by passing it as the only trusted CA, so no one can impersonate the agent.
// Simulated servers (see demo.js) answer here instead, keeping peers in memory.
const simulatedPeers = new Map();
function simulatedAgent(method, path, body) {
  if (method === 'GET' && path === '/peers') {
    return [...simulatedPeers].map(([publicKey, allowedIps]) => ({ publicKey, allowedIps, latestHandshake: 0, rxBytes: 0, txBytes: 0 }));
  }
  if (method === 'POST' && path === '/peers') simulatedPeers.set(body.publicKey, body.allowedIp);
  if (method === 'POST' && path === '/peers/remove') simulatedPeers.delete(body.publicKey);
  return { ok: true };
}

export function agentRequest(server, method, path, body) {
  if (String(server.agent_url).startsWith('simulate:')) return Promise.resolve(simulatedAgent(method, path, body));
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      new URL(path, server.agent_url),
      {
        method,
        ca: server.agent_cert,
        checkServerIdentity: () => undefined, // identity is guaranteed by the pinned cert
        timeout: 10_000,
        headers: {
          Authorization: `Bearer ${server.agent_token}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (buf += chunk));
        res.on('end', () => {
          if (res.statusCode >= 300) {
            return reject(new Error(`Agent "${server.name}" replied ${res.statusCode}: ${buf}`));
          }
          try {
            resolve(buf ? JSON.parse(buf) : null);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Agent "${server.name}" timed out`)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
