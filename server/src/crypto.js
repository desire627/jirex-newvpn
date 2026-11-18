import crypto from 'node:crypto';
import { config } from './config.js';

const toBase64 = (b64url) => Buffer.from(b64url, 'base64url').toString('base64');

// WireGuard keys are raw Curve25519 (X25519) keys, base64-encoded.
export function generateWireguardKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return {
    publicKey: toBase64(publicKey.export({ format: 'jwk' }).x),
    privateKey: toBase64(privateKey.export({ format: 'jwk' }).d),
  };
}

// AES-256-GCM so client private keys are not stored in plain text.
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.encryptionKey, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decrypt(encoded) {
  const buf = Buffer.from(encoded, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.encryptionKey, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
