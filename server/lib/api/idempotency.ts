/**
 * Replay protection for writes that a phone may have queued offline.
 *
 * Without this, offline queueing is actively dangerous: a replayed "complete
 * chore" logs a second completion and rolls the due date twice, and a replayed
 * "use 5 bags of feed" takes ten off the shelf. A client-supplied
 * `Idempotency-Key` makes the retry return the first attempt's answer instead
 * of doing the work again.
 *
 * Requests without a key behave exactly as before, so nothing that doesn't opt
 * in is affected.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { idempotencyKeys } from '@/db/schema';

/** What a wrapped handler returns — the response is built by the wrapper. */
export type HandlerResult = { status: number; body: unknown };

/** Reads the key off a request, rejecting anything implausible as a key. */
export function idempotencyKey(req: Request): string | null {
  const raw = req.headers.get('Idempotency-Key');
  if (!raw) return null;
  const key = raw.trim();
  if (!key || key.length > 200) return null;
  return key;
}

/**
 * Runs `handler` at most once per (user, key).
 *
 * A repeat while the first attempt is still in flight gets 409 rather than
 * running concurrently — the client's queue treats that as "leave it queued
 * and try later", which is the safe reading.
 *
 * Failures are deliberately *not* recorded: the claim is released so a genuine
 * retry can still get through. Only a completed response is replayable.
 */
export async function withIdempotency(
  userId: string,
  key: string | null,
  handler: () => Promise<HandlerResult>,
): Promise<NextResponse> {
  if (!key) {
    const r = await handler();
    return NextResponse.json(r.body, { status: r.status });
  }

  // Claiming the key and finding it already taken is the same operation, so
  // two racing requests can't both decide they're first.
  const claimed = await db
    .insert(idempotencyKeys)
    .values({ key, userId, status: 0, response: '' })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });

  if (!claimed.length) {
    const rows = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, userId)))
      .limit(1);
    const prior = rows[0];
    if (!prior) {
      // The key belongs to somebody else. Don't leak that it exists, and don't
      // run the work under a key we couldn't claim.
      return NextResponse.json({ error: 'That request key is not usable.' }, { status: 409 });
    }
    if (prior.status === 0) {
      return NextResponse.json({ error: 'That request is already being processed.' }, { status: 409 });
    }
    return NextResponse.json(safeParse(prior.response), { status: prior.status, headers: { 'Idempotent-Replay': '1' } });
  }

  try {
    const r = await handler();
    await db
      .update(idempotencyKeys)
      .set({ status: r.status, response: JSON.stringify(r.body ?? null) })
      .where(eq(idempotencyKeys.key, key));
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    throw e;
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return { ok: true };
  }
}
