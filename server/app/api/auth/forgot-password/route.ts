import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createInvite } from '@/lib/auth/invites';
import { checkThrottle, recordFailure, clientIp } from '@/lib/auth/throttle';
import { emailConfigured, sendMail } from '@/lib/notify/email';

const schema = z.object({ email: z.string().trim().email() });

function resetEmail(name: string, url: string): string {
  return `
    <p>Hi ${name || 'there'},</p>
    <p>Someone asked to reset the password for your Farm Project Tracker account.
    Follow this link to choose a new one — it expires in 7 days:</p>
    <p><a href="${url}">${url}</a></p>
    <p>If you didn't request this, you can ignore this email; your password won't change.</p>`;
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // Light per-IP throttle so this can't be used to spam inboxes.
  const ipKey = [`forgot:${clientIp(req)}`];
  const gate = await checkThrottle(ipKey);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
  }
  await recordFailure(ipKey, { maxFailures: 8 });

  const email = parsed.data.email.toLowerCase();
  const user = (await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, email)).limit(1))[0];

  // Only act if the account exists — but always return the same response so the
  // endpoint can't be used to discover which emails are registered.
  if (user) {
    try {
      const invite = await createInvite(user.id);
      const base = process.env.PUBLIC_URL || new URL(req.url).origin;
      const url = `${base}/invite/${invite.token}`;
      if (emailConfigured()) {
        await sendMail(user.email, 'Reset your Farm Tracker password', resetEmail(user.name, url));
      } else {
        // eslint-disable-next-line no-console
        console.warn('[auth] password reset requested but SMTP is not configured; no email sent');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[auth] failed to send password reset', e);
    }
  }

  return NextResponse.json({ ok: true });
}
