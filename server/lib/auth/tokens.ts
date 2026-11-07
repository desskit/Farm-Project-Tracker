/**
 * Login and invite tokens are stored hashed. The raw token only ever lives in
 * the browser cookie or the emailed link; the database (and so every backup
 * and export of it) holds a SHA-256 digest that can't be replayed as a login.
 * A plain hash is enough here: these are 32 random bytes, not passwords, so
 * there is nothing to brute-force.
 */
import { createHash } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
