// Local test database: PGlite (real Postgres compiled to WebAssembly) exposed on a TCP port.
// Run by start.mjs as a separate process so its output can be filtered and it can't take
// the other services down with it.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const { DB_DIR, DB_PORT, SCHEMA_FILE, SEED_FILE } = process.env;

// A client disconnecting abruptly (e.g. the API restarting) makes pglite-socket reject an
// internal promise nobody awaits. That's harmless: the next connection works fine.
const harmless = (err) => ['ECONNRESET', 'EPIPE', 'ECONNABORTED'].includes(err?.code);
process.on('unhandledRejection', (err) => {
  if (harmless(err)) return;
  console.error('Database error:', err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  if (harmless(err)) return;
  console.error('Database error:', err);
  process.exit(1);
});

let db;
try {
  db = await PGlite.create(DB_DIR);
} catch (err) {
  // The data files can't be read, usually because the database was killed while writing.
  console.log('DATABASE_DAMAGED');
  console.error(String(err?.message || err));
  process.exit(2);
}

await db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));

const { rows } = await db.query('SELECT count(*)::int AS n FROM servers');
if (rows[0].n === 0 && SEED_FILE) {
  const s = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  await db.query(
    `INSERT INTO servers (name, country, endpoint, public_key, agent_url, agent_token, agent_cert, obfuscation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [s.name, s.country, s.endpoint, s.publicKey, s.agentUrl, s.agentToken, s.agentCert, JSON.stringify(s.obfuscation)],
  );
}

// Sample bank details so the transfer flow can be tried right away.
const hasInstructions = await db.query("SELECT 1 FROM settings WHERE key = 'payment_instructions'");
if (hasInstructions.rows.length === 0) {
  await db.query("INSERT INTO settings (key, value) VALUES ('payment_instructions', $1)", [
    `TEST DETAILS: replace in Admin → Settings
Bank: Example Bank
Card number: 2200 0000 0000 0000
Recipient: Ivan Ivanov
SBP (fast payment) phone: +7 900 000-00-00`,
  ]);
}

const server = new PGLiteSocketServer({ db, port: Number(DB_PORT), host: '127.0.0.1' });
server.addEventListener('error', () => {}); // logged above if it matters
await server.start();
console.log('DATABASE_READY');

// Close cleanly so every change is written to disk. Triggered by Ctrl+C (SIGINT), by the
// launcher writing "stop" to our input, or by SIGTERM.
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  console.log('DATABASE_CLOSED');
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => d.includes('stop') && stop());
