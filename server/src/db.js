import fs from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX) || 10, // the local test database allows only 1
  // Hosted databases (Neon, Supabase…) need SSL; their connection strings say so with sslmode=require.
  ...(/sslmode=(require|verify)/.test(config.databaseUrl) ? { ssl: { rejectUnauthorized: true } } : {}),
});

// Without this, a dropped idle connection (database restart, network blip) crashes the API.
pool.on('error', (err) => console.error('[db] idle connection error:', err.message));

export async function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function getSetting(key, fallback = '') {
  const row = await one('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

export async function transaction(operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  // Serialize schema changes across processes, including behind connection poolers.
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(727274)');
    await client.query(sql);
  });
}
