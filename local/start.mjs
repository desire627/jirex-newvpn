// Runs the whole VPN system on your PC for testing:
//   database (PGlite), simulated VPN server, API, website.
//
//   cd local && npm install && npm start       -> open http://localhost:5173
//   npm run reset                               -> wipe the test database and start fresh
//
// Test data is kept OUTSIDE the project folder (which is on OneDrive): OneDrive locks and
// syncs files while the database is writing them, which can damage it.
//   Windows: %LOCALAPPDATA%\JIREX-local      Mac/Linux: ~/.jirex-local
//   (override with the JIREX_DATA_DIR environment variable)

import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA =
  process.env.JIREX_DATA_DIR ||
  (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'JIREX-local')
    : path.join(os.homedir(), '.jirex-local'));
const AGENT_DIR = path.join(DATA, 'agent');
// JIREX_PORT_OFFSET lets a second copy run alongside (e.g. 100 → 5533, 9543, 4100, 5273).
const OFFSET = Number(process.env.JIREX_PORT_OFFSET) || 0;
const DB_PORT = 5433 + OFFSET;
const AGENT_PORT = 9443 + OFFSET;
const API_PORT = 4000 + OFFSET;
const WEB_PORT = 5173 + OFFSET;
const ADMIN_EMAIL = 'desireasiimwe24@gmail.com';

const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const step = (msg) => console.log(c(36, `▸ ${msg}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- clean up after a previous run that crashed or was closed abruptly ----------
const PIDS_FILE = path.join(DATA, 'pids.json');
const PORTS = { [DB_PORT]: 'database', [AGENT_PORT]: 'VPN server', [API_PORT]: 'API', [WEB_PORT]: 'website' };

function killTree(pid) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    else process.kill(pid);
  } catch {}
}

// The command line of a running process, or '' if it isn't running.
function commandLine(pid) {
  try {
    if (process.platform === 'win32') {
      return execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}').CommandLine"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
    }
    return execSync(`ps -o args= -p ${Number(pid)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Every service is started with an absolute path inside this project, so this tells our
// leftovers apart from unrelated programs that happen to have been given the same PID later.
const isOurs = (pid) => commandLine(pid).toLowerCase().includes(ROOT.toLowerCase());

if (fs.existsSync(PIDS_FILE)) {
  let pids = [];
  try {
    pids = JSON.parse(fs.readFileSync(PIDS_FILE, 'utf8'));
  } catch {}
  for (const pid of pids) if (isOurs(pid)) killTree(pid);
  fs.rmSync(PIDS_FILE, { force: true });
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer().once('error', () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}
const portFree = async (port) => (await canListen(port, '127.0.0.1')) && (await canListen(port));

for (const [port, what] of Object.entries(PORTS)) {
  let free = false;
  for (let i = 0; i < 6 && !(free = await portFree(Number(port))); i++) await sleep(500);
  if (!free) {
    console.error(
      c(31, `✖ Port ${port} (needed for the ${what}) is already in use.`) +
        `\n  JIREX may already be running in another terminal. Close it with Ctrl+C there first.` +
        `\n  Otherwise find what's using it with:  netstat -ano | findstr :${port}`,
    );
    process.exit(1);
  }
}

if (process.argv.includes('--reset')) {
  // Retries because a just-stopped database can hold files open for a moment.
  fs.rmSync(DATA, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  step('Test data wiped');
}
fs.mkdirSync(AGENT_DIR, { recursive: true });

// 1. Dependencies for the API and website
for (const dir of ['server', 'web']) {
  const marker = path.join(ROOT, dir, 'node_modules', '.package-lock.json');
  const lock = path.join(ROOT, dir, 'package-lock.json');
  const stale = !fs.existsSync(marker) || (fs.existsSync(lock) && fs.statSync(lock).mtimeMs > fs.statSync(marker).mtimeMs);
  if (stale) {
    step(`Installing ${dir} packages…`);
    execSync('npm install --no-audit --no-fund', { cwd: path.join(ROOT, dir), stdio: 'inherit' });
  }
}

// 2. Secrets for the API (kept between runs so logins and configs keep working)
const secretsFile = path.join(DATA, 'secrets.json');
if (!fs.existsSync(secretsFile)) {
  fs.writeFileSync(
    secretsFile,
    JSON.stringify({
      JWT_SECRET: crypto.randomBytes(32).toString('hex'),
      ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    }),
  );
}
const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));

// 3. Simulated VPN server identity
const seedFile = path.join(DATA, 'test-server.json');
if (!fs.existsSync(seedFile)) {
  const pems = selfsigned.generate([{ name: 'commonName', value: 'vpn-agent' }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }],
  });
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(AGENT_DIR, 'cert.pem'), pems.cert);
  fs.writeFileSync(path.join(AGENT_DIR, 'key.pem'), pems.private);
  fs.writeFileSync(path.join(AGENT_DIR, 'token'), token);
  const { publicKey } = crypto.generateKeyPairSync('x25519');
  fs.writeFileSync(
    seedFile,
    JSON.stringify({
      name: 'JIRE SERVER',
      country: 'Demo',
      endpoint: '127.0.0.1:51820',
      publicKey: Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64'),
      agentUrl: `https://127.0.0.1:${AGENT_PORT}`,
      agentToken: token,
      agentCert: pems.cert,
      // Sample AmneziaWG camouflage values (a real server generates its own)
      obfuscation: { Jc: 5, Jmin: 8, Jmax: 80, S1: 42, S2: 117, H1: 1630278341, H2: 902114567, H3: 1188823410, H4: 2004311529 },
    }),
  );
}

// ---------- process helpers ----------
const children = [];
const NOISE = /cannot find the path specified/i;
const ANSI = /\x1b\[[0-9;]*m/g;

// Every service is a Node script started directly (no cmd.exe/npm wrapper), so the PID we
// record is the real process and can always be stopped, even after a crash.
function start(name, color, script, args, options = {}) {
  const child = spawn(process.execPath, [...(options.nodeArgs || []), script, ...args], {
    cwd: options.cwd,
    env: options.env || process.env,
  });
  const prefix = c(color, `[${name}]`) + ' ';
  const pipe = (stream) =>
    stream.on('data', (d) =>
      d
        .toString()
        .split(/\r?\n/)
        .filter((line) => line.trim() && !NOISE.test(line))
        .forEach((line) => {
          const plain = line.replace(ANSI, '').trim(); // ignore colour codes when matching
          options.onLine?.(plain);
          if (!options.quiet?.(plain)) console.log(prefix + line);
        }),
    );
  pipe(child.stdout);
  pipe(child.stderr);
  child.exited = new Promise((resolve) => child.on('exit', resolve));
  child.on('exit', (code) => {
    options.onExit?.(code);
    if (!stopping) console.log(prefix + c(31, `stopped unexpectedly (exit ${code}). Press Ctrl+C and run npm start again.`));
  });
  children.push(child);
  fs.writeFileSync(PIDS_FILE, JSON.stringify(children.map((ch) => ch.pid)));
  return child;
}

let stopping = false;
let db;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping…');
  // Stop the website, API and VPN first, then let the database close cleanly so every
  // change is saved. Only force it if it hasn't finished after 10 seconds.
  for (const child of children) if (child !== db) killTree(child.pid);
  if (db && db.exitCode === null) {
    try {
      db.stdin.write('stop\n');
    } catch {}
    const closed = await Promise.race([db.exited.then(() => true), sleep(10_000).then(() => false)]);
    if (!closed) killTree(db.pid);
  }
  fs.rmSync(PIDS_FILE, { force: true });
  console.log('Stopped. Your test data is saved.');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 4. Database first, then everything else once it's ready
step('Starting database…');
const dbStatus = await new Promise((resolve) => {
  db = start('db  ', 34, path.join(HERE, 'db.mjs'), [], {
    env: {
      ...process.env,
      DB_DIR: path.join(DATA, 'db'),
      DB_PORT: String(DB_PORT),
      SCHEMA_FILE: path.join(ROOT, 'server/src/schema.sql'),
      SEED_FILE: seedFile,
    },
    onLine: (line) => {
      if (line === 'DATABASE_READY') resolve('ready');
      if (line === 'DATABASE_DAMAGED') resolve('damaged');
    },
    onExit: () => resolve('exited'),
    quiet: (line) => /^DATABASE_(READY|DAMAGED|CLOSED)$/.test(line) || /^(RuntimeError|\s*at )/.test(line),
  });
});

if (dbStatus !== 'ready') {
  stopping = true;
  killTree(db.pid);
  fs.rmSync(PIDS_FILE, { force: true });
  console.error(
    '\n' +
      c(31, '✖ The test database could not be opened.') +
      '\n  It was probably damaged when the program was closed while saving.' +
      `\n  Run ${c(36, 'npm run reset')} to start with a fresh, empty test database.` +
      '\n  (This only deletes TEST accounts and payments on this PC.)\n',
  );
  process.exit(1);
}

step('Starting simulated VPN server, API and website…');
start('vpn ', 35, path.join(ROOT, 'agent/agent.mjs'), [], {
  env: { ...process.env, AGENT_SIMULATE: '1', AGENT_CONFIG_DIR: AGENT_DIR, AGENT_PORT: String(AGENT_PORT) },
});

// The API restarts by itself when its code changes, so the website and API never get out of step.
const API_WATCH =
  process.platform === 'linux' ? ['--watch'] : [`--watch-path=${path.join(ROOT, 'server', 'src')}`];
start('api ', 33, path.join(ROOT, 'server/src/index.js'), [], {
  nodeArgs: API_WATCH,
  cwd: path.join(ROOT, 'server'),
  env: {
    ...process.env,
    PORT: String(API_PORT),
    APP_URL: `http://localhost:${WEB_PORT}`,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres?sslmode=disable`,
    PG_POOL_MAX: '1',
    UPLOAD_DIR: path.join(DATA, 'uploads'),
    ADMIN_EMAIL,
    ...secrets,
  },
});

start('web ', 32, path.join(ROOT, 'web/node_modules/vite/bin/vite.js'), ['--port', String(WEB_PORT), '--strictPort'], {
  cwd: path.join(ROOT, 'web'),
  env: { ...process.env, JIREX_API_PORT: String(API_PORT) },
  quiet: (line) => /ready in|Local:|Network:/.test(line), // replaced by the banner below
  onLine: (line) => {
    if (!line.includes('ready in')) return;
    console.log(`
${c(1, '══════════════════════════════════════════════════════════════════')}
  ${c(1, 'JIREX is running →')} ${c(32, `http://localhost:${WEB_PORT}`)}

  1. Click "Get started" and sign up as ${c(36, ADMIN_EMAIL)}
     (any password, 8+ characters). That account is the admin.
  2. In a private/incognito window, sign up as a customer.
  3. As the customer, pick a plan → upload any PDF/photo as the
     receipt. Then approve it in Admin → Payments.
  4. As the customer, add a device and open its setup.

  The VPN server is ${c(33, 'simulated')}: configs are real AmneziaWG files
  but won't connect to anything. Press Ctrl+C to stop.
  Test data is saved in: ${DATA}
${c(1, '══════════════════════════════════════════════════════════════════')}
`);
  },
});
