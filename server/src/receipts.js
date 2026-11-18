import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { one, query } from './db.js';
import { HttpError } from './errors.js';

// 4 MB: plenty for a screenshot or PDF, and under Vercel's 4.5 MB request limit.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

// Where receipts are kept: "disk" (UPLOAD_DIR) or "database". Hosts without a lasting disk,
// like Vercel, must use the database. Either way the file is encrypted first.
const IN_DATABASE = (process.env.RECEIPT_STORAGE || (process.env.VERCEL ? 'database' : 'disk')) === 'database';
const DB_PREFIX = 'db:';

// Keep the file in memory just long enough to check what it really is.
export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 10 },
}).single('receipt');

// Identify the file from its first bytes, never from its name or the browser's claim.
function sniff(buf) {
  const hex = buf.subarray(0, 12).toString('hex');
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg' };
  if (hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

// Receipts can show bank details, so they're encrypted on disk (AES-256-GCM) with a key
// derived from ENCRYPTION_KEY. A copied disk or backup doesn't reveal them without that key.
const FILE_KEY = Buffer.from(crypto.hkdfSync('sha256', config.encryptionKey, Buffer.alloc(0), 'jirex-receipts-v1', 32));

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FILE_KEY, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function decrypt(buf) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', FILE_KEY, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}

export async function saveReceipt(file) {
  const type = file && sniff(file.buffer);
  if (!type) throw new HttpError(400, 'receipt_type');
  const name = `${crypto.randomUUID()}.enc`;
  if (IN_DATABASE) {
    await query('INSERT INTO receipt_files (name, data) VALUES ($1, $2)', [name, encrypt(file.buffer)]);
    return { file: DB_PREFIX + name, mime: type.mime };
  }
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, name), encrypt(file.buffer), { flag: 'wx' });
  return { file: name, mime: type.mime };
}

// Stored names are UUIDs we generated; anything else is refused to rule out path tricks.
// (".pdf/.jpg/..." are receipts saved before encryption was added.)
function receiptPath(name) {
  if (!/^[0-9a-f-]{36}\.(enc|pdf|jpg|png|webp)$/.test(name || '')) return null;
  return path.join(config.uploadDir, name);
}

const dbName = (name) => (String(name || '').startsWith(DB_PREFIX) ? name.slice(DB_PREFIX.length) : null);

export async function readReceipt(name) {
  if (dbName(name)) {
    const row = await one('SELECT data FROM receipt_files WHERE name = $1', [dbName(name)]);
    return row ? decrypt(row.data) : null;
  }
  const p = receiptPath(name);
  if (!p) return null;
  try {
    const buf = await fs.readFile(p);
    return name.endsWith('.enc') ? decrypt(buf) : buf;
  } catch {
    return null;
  }
}

export async function deleteReceipt(name) {
  if (dbName(name)) return void (await query('DELETE FROM receipt_files WHERE name = $1', [dbName(name)]));
  const p = receiptPath(name);
  if (p) await fs.rm(p, { force: true });
}
