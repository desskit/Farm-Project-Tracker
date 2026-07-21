import { randomBytes } from 'node:crypto';

/**
 * Prefixed unique id, mirroring the prototype's `uid()` (js/store.js:49).
 * e.g. uid('c') -> "c_ln0f2a_9x3k1".
 */
export function uid(prefix = 'id'): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(4).toString('hex').slice(0, 5);
  return `${prefix}_${time}_${rand}`;
}
