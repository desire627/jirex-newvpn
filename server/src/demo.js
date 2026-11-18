import crypto from 'node:crypto';
import { one, query } from './db.js';

// DEMO_SERVER=1 adds a simulated "JIRE SERVER" when there are no servers yet, so the whole
// site can be tried on hosting that can't run a real VPN server (e.g. Vercel).
// Configs it hands out are real AmneziaWG files, but nothing is listening at its address.
export const SIMULATED_AGENT_URL = 'simulate://demo';

export async function seedDemoServer() {
  if (process.env.DEMO_SERVER !== '1') return;
  const { n } = await one('SELECT count(*)::int AS n FROM servers');
  if (n > 0) return;
  const { publicKey } = crypto.generateKeyPairSync('x25519');
  const key = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64');
  await query(
    `INSERT INTO servers (name, country, endpoint, public_key, agent_url, agent_token, agent_cert, obfuscation)
     VALUES ('JIRE SERVER', 'Demo', $1, $2, $3, 'simulated', 'simulated', $4)`,
    [
      process.env.DEMO_SERVER_ENDPOINT || 'demo.jirex.invalid:51820',
      key,
      SIMULATED_AGENT_URL,
      JSON.stringify({ Jc: 5, Jmin: 8, Jmax: 80, S1: 42, S2: 117, H1: 1630278341, H2: 902114567, H3: 1188823410, H4: 2004311529 }),
    ],
  );
  console.log('[demo] added the simulated JIRE SERVER');
}
