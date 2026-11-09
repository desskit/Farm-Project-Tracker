import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { AuthError, getRealSessionUser } from '@/lib/auth/session';
import { PREVIEW_COOKIE, PREVIEW_MS } from '@/lib/auth/constants';
import { can } from '@/lib/domain/permissions';
import { logActivity } from '@/lib/data/activity';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({ userId: z.string().min(1) });

/**
 * Admin: see the app as someone else for up to an hour, read-only. Checked
 * against the real signed-in person, not whoever is currently being previewed.
 */
export async function POST(req: Request) {
  try {
    const real = await getRealSessionUser();
    if (!real) throw new AuthError('Not signed in.', 401);
    if (!can(real, 'system.admin')) throw new AuthError('Admins only.', 403);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pick a person.' }, { status: 400 });
    const target = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, parsed.data.userId)).limit(1))[0];
    if (!target) return NextResponse.json({ error: 'No such person.' }, { status: 404 });
    if (target.id === real.id) return NextResponse.json({ error: 'That’s you.' }, { status: 400 });

    const until = Date.now() + PREVIEW_MS;
    cookies().set(PREVIEW_COOKIE, `${target.id}.${until}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(PREVIEW_MS / 1000),
    });
    await logActivity(real.id, `started previewing the app as ${target.name}`, { audience: 'system.admin' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
