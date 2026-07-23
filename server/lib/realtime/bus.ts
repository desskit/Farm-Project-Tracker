/**
 * In-process event bus for realtime sync. One Node process serves the whole
 * farm, so a plain EventEmitter is all we need — no external broker. Mutations
 * in the data layer call publishChange(); the SSE route (app/api/events)
 * forwards each change to connected devices, which then refetch.
 *
 * The emitter is stashed on globalThis so Next.js dev/HMR module reloads reuse
 * the same instance instead of orphaning listeners.
 */
import 'server-only';
import { EventEmitter } from 'node:events';

export type ChangeEvent = { type: 'change'; resource: string; ts: number };

const g = globalThis as unknown as { __fptBus?: EventEmitter };
const bus = g.__fptBus ?? (g.__fptBus = new EventEmitter());
// Every connected device adds a listener; don't warn on a busy farm.
bus.setMaxListeners(0);

/** Announce that something changed so open devices can refetch. */
export function publishChange(resource = 'all'): void {
  try {
    bus.emit('change', { type: 'change', resource, ts: Date.now() } satisfies ChangeEvent);
  } catch {
    /* a broken listener must never break the mutation that triggered it */
  }
}

/** Subscribe to change events; returns an unsubscribe function. */
export function subscribe(fn: (e: ChangeEvent) => void): () => void {
  bus.on('change', fn);
  return () => bus.off('change', fn);
}
