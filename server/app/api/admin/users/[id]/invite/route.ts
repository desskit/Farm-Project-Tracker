import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { requireAdmin } from '@/lib/auth/session';
import { createInvite } from '@/lib/auth/invites';
import { emailConfigured, sendMail } from '@/lib/notify/email';
import { inviteEmail } from '@/lib/notify/templates';
import { errorResponse } from '@/lib/api/errors';

/**
 * Re-sends an invite to someone who hasn't set a password yet — used when the
 * original 7-day link expired or never arrived. Mints a fresh token each time.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, params.id))
      .limit(1);
    const person = rows[0];
    if (!person) return NextResponse.json({ error: 'No such person.' }, { status: 404 });
    if (person.passwordHash) {
      return NextResponse.json(
        { error: 'That account is already active. They can use "Forgot password" to get back in.' },
        { status: 400 },
      );
    }

    const invite = await createInvite(person.id);
    const base = process.env.PUBLIC_URL || new URL(req.url).origin;
    const inviteUrl = `${base}/invite/${invite.token}`;

    let emailed = false;
    if (emailConfigured()) {
      emailed = await sendMail(
        person.email,
        `${admin.name} invited you to Farm Project Tracker`,
        inviteEmail(person.name, admin.name, inviteUrl),
      );
    }
    return NextResponse.json({ ok: true, inviteUrl, emailed });
  } catch (e) {
    return errorResponse(e);
  }
}
