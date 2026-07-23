import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { checkThrottle, recordFailure, clearThrottle, clientIp } from '@/lib/auth/throttle';

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

// A fixed-shape hash so a nonexistent email still runs verifyPassword's full
// scrypt work — avoids leaking "does this account exist" via response timing.
const DUMMY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

function lockedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: 'Too many attempts. Try again in a few minutes.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const keys = [`email:${email}`, `lip:${clientIp(req)}`];

  // Reject early if the account or source is currently locked out.
  const gate = await checkThrottle(keys);
  if (!gate.allowed) return lockedResponse(gate.retryAfterSec);

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0] ?? null;
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    const state = await recordFailure(keys);
    if (!state.allowed) return lockedResponse(state.retryAfterSec);
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  await clearThrottle(keys);
  await createSession(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
