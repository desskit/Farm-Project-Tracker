/**
 * Offline outbox — field work saved on the phone and replayed when signal
 * returns.
 *
 * Barns and back pastures have no coverage, so a tap that only works online
 * loses real work. Writes listed in the outbox-backed call sites go through
 * `submitQueued()`: it tries the network first and, only if the request never
 * reached the server, stores it in IndexedDB and reports it as queued.
 *
 * Safety rests on two rules:
 *
 *  - **Only true network failures queue.** A `fetch` rejection means the
 *    request didn't land. An HTTP response — even a 500 — means the server
 *    saw it, so we surface that instead of silently retrying something that
 *    may have already applied.
 *  - **Every queued write carries an idempotency key** (its own entry id).
 *    The server records the first outcome per key and replays it verbatim, so
 *    a double flush can't log a chore twice or double-count a stock draw.
 *    The key is sent on online attempts too, which covers the nastier case of
 *    a response lost in transit and the user tapping again.
 *
 * Photos are resized and stashed as blobs alongside the entry, then uploaded
 * during the flush and their new attachment id patched into the body — so a
 * proof photo taken out of range survives.
 */
'use client';
import { uploadPrepared, type PreparedPhoto } from './photo';

const DB_NAME = 'farm-outbox';
const STORE = 'pending';
const MAX_TRIES = 5;

export type OutboxEntry = {
  id: string;
  url: string;
  method: string;
  /** Parsed JSON body; the photo id (if any) is patched in at flush time. */
  body: Record<string, unknown>;
  /** Human-readable, shown in the pending list ("Fed the chickens"). */
  label: string;
  photo?: PreparedPhoto;
  /** Where in `body` the uploaded attachment id belongs. */
  photoField?: string;
  createdAt: number;
  tries: number;
  lastError?: string;
};

/** Broadcast so any mounted indicator can refresh its count. */
const CHANGED = 'farm-outbox-changed';
function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED));
}
export function onOutboxChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

/** Whether this browser can queue at all (private mode can block IndexedDB). */
export function outboxSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export async function pendingEntries(): Promise<OutboxEntry[]> {
  if (!outboxSupported()) return [];
  const all = await tx<OutboxEntry[]>('readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>).catch(() => []);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(): Promise<number> {
  return (await pendingEntries()).length;
}

async function put(entry: OutboxEntry): Promise<void> {
  await tx('readwrite', (s) => s.put(entry));
  announce();
}

async function remove(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  announce();
}

export type SubmitResult =
  | { ok: true; data: unknown }
  | { ok: false; queued: true }
  | { ok: false; queued: false; error: string; status: number };

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sends a write, queueing it if the device is offline.
 *
 * Returns `{ ok: true }` when the server accepted it, `{ queued: true }` when
 * it's stored for later, or an error when the server actively rejected it.
 */
export async function submitQueued(opts: {
  url: string;
  body: Record<string, unknown>;
  label: string;
  photo?: PreparedPhoto;
  photoField?: string;
  method?: string;
}): Promise<SubmitResult> {
  const entry: OutboxEntry = {
    id: newId(),
    url: opts.url,
    method: opts.method || 'POST',
    body: opts.body,
    label: opts.label,
    photo: opts.photo,
    photoField: opts.photoField,
    createdAt: Date.now(),
    tries: 0,
  };

  // Known-offline: don't even try, so the user gets instant feedback.
  if (typeof navigator !== 'undefined' && navigator.onLine === false && outboxSupported()) {
    await put(entry);
    return { ok: false, queued: true };
  }

  try {
    const r = await send(entry);
    return r.ok ? r : { ok: false, queued: false, error: r.error, status: r.status };
  } catch (e) {
    // fetch() rejected — the request never reached the server, so queueing it
    // can't duplicate anything.
    if (!outboxSupported()) {
      return { ok: false, queued: false, error: 'You appear to be offline.', status: 0 };
    }
    entry.lastError = e instanceof Error ? e.message : String(e);
    await put(entry);
    return { ok: false, queued: true };
  }
}

/**
 * Performs one attempt. Throws only on network failure; an HTTP response of
 * any status comes back as a resolved result.
 */
type SendResult = { ok: true; data: unknown } | { ok: false; error: string; status: number };

async function send(entry: OutboxEntry): Promise<SendResult> {
  const body = { ...entry.body };
  if (entry.photo && entry.photoField) {
    // Upload first; a failure here throws and leaves the entry queued intact.
    body[entry.photoField] = await uploadPrepared(entry.photo);
  }
  const res = await fetch(entry.url, {
    method: entry.method,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': entry.id },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, data };
  return { ok: false, error: (data as { error?: string }).error || 'Something went wrong.', status: res.status };
}

/**
 * Whether a rejected attempt is worth replaying later.
 *
 * A 4xx is the server's settled answer — the chore was deleted, the stock
 * would go negative — so retrying just re-fails. A 5xx or a 409 ("already
 * being processed") is transient and deserves another go.
 */
function worthRetrying(status: number): boolean {
  return status >= 500 || status === 409 || status === 408 || status === 429;
}

export type FlushSummary = { sent: number; failed: number; stillQueued: number; errors: string[] };

let flushing = false;

/**
 * Replays everything queued, oldest first. Stops at the first network failure
 * (still offline — no point hammering the rest) but keeps going past entries
 * the server rejected, which are dropped with their reason reported.
 */
export async function flushOutbox(): Promise<FlushSummary> {
  const summary: FlushSummary = { sent: 0, failed: 0, stillQueued: 0, errors: [] };
  if (!outboxSupported() || flushing) return summary;
  flushing = true;
  try {
    for (const entry of await pendingEntries()) {
      // Bumped before each decision so a permanently-failing entry can't sit
      // in the queue forever.
      const tries = entry.tries + 1;
      try {
        const r = await send(entry);
        if (r.ok) {
          await remove(entry.id);
          summary.sent++;
          continue;
        }
        if (worthRetrying(r.status) && tries < MAX_TRIES) {
          await put({ ...entry, tries, lastError: r.error });
          continue;
        }
        // The server's settled answer (or we're out of attempts) — drop it
        // rather than leave something permanently stuck, and say why.
        await remove(entry.id);
        summary.failed++;
        summary.errors.push(`${entry.label}: ${r.error}`);
      } catch (e) {
        const lastError = e instanceof Error ? e.message : String(e);
        if (tries >= MAX_TRIES) {
          await remove(entry.id);
          summary.failed++;
          summary.errors.push(`${entry.label}: gave up after ${MAX_TRIES} attempts (${lastError})`);
          continue;
        }
        await put({ ...entry, tries, lastError });
        break; // still offline; leave the rest for the next attempt
      }
    }
    summary.stillQueued = await pendingCount();
    return summary;
  } finally {
    flushing = false;
    announce();
  }
}
