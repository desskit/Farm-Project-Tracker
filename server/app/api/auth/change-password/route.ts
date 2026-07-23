import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { requireUser, SESSION_COOKIE } from '@/lib/auth/session';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { logActivity } from '@/lib/data/activity';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Your new password must be at least 8 characters.'),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request.' }, { status: 400 });
    }

    const row = (await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1))[0];
    const ok = await verifyPassword(parsed.data.currentPassword, row?.passwordHash ?? null);
    if (!ok) return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 });

    const hash = await hashPassword(parsed.data.newPassword);
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));

    // Sign this account out everywhere else; keep the current device signed in.
    const token = cookies().get(SESSION_COOKIE)?.value;
    if (token) await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, token)));

    await logActivity(user.id, 'changed their password');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
