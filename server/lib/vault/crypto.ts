/**
 * Vault encryption: AES-256-GCM with a random 96-bit IV per value, so the
 * same password stored twice never looks the same, and any tampering with the
 * stored bytes makes decryption fail instead of returning garbage.
 *
 * The key comes from VAULT_KEY (base64, 32 bytes) if set; otherwise it's a
 * file created on first use at <data dir>/secrets/vault.key (mode 600). That
 * folder is deliberately outside what the nightly backup copies, so a stolen
 * backup can't be opened. Losing the key means the vault can't be opened —
 * admins can view it once on the vault page to keep a copy somewhere safe.
 */
import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PREFIX = 'v1:';
let cached: Buffer | null = null;

function dataDir(): string {
  const url = process.env.DATABASE_URL || 'file:./data/app.db';
  return path.dirname(url.replace(/^file:/, ''));
}

export function keyFilePath(): string {
  return process.env.VAULT_KEY_FILE || path.join(dataDir(), 'secrets', 'vault.key');
}

function loadKey(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.VAULT_KEY?.trim();
  if (fromEnv) {
    const k = Buffer.from(fromEnv, 'base64');
    if (k.length !== 32) throw new Error('VAULT_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).');
    return (cached = k);
  }
  const file = keyFilePath();
  if (existsSync(file)) {
    const k = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
    if (k.length !== 32) throw new Error(`The vault key at ${file} is not valid.`);
    return (cached = k);
  }
  const k = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, k.toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
  return (cached = k);
}

export function encrypt(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', loadKey(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export function decrypt(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) throw new Error('Unrecognised vault value.');
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const d = createDecipheriv('aes-256-gcm', loadKey(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

/** The key itself, for an admin to store safely. */
export function exportKey(): string {
  return loadKey().toString('base64');
}

/** Short fingerprint so an admin can confirm a saved copy matches. */
export function keyFingerprint(): string {
  return createHash('sha256').update(loadKey()).digest('hex').slice(0, 12);
}

/** For tests: forget the cached key. */
export function _resetKeyCache(): void {
  cached = null;
}
