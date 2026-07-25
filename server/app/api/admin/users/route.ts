import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { listUsers, createUserWithInvite } from '@/lib/data/users';
import { emailConfigured, sendMail } from '@/lib/notify/email';
import { inviteEmail } from '@/lib/notify/templates';
import { errorResponse } from '@/lib/api/errors';

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: z.enum(['admin', 'manager', 'worker']),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await listUsers() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Name, email, and role are required.' }, { status: 400 });
    }
    const { inviteToken } = await createUserWithInvite(parsed.data);
    const base = process.env.PUBLIC_URL || new URL(req.url).origin;
    const inviteUrl = `${base}/invite/${inviteToken}`;

    // Email the invite when SMTP is set up; the link is still returned so the
    // admin can pass it along by hand if delivery isn't configured or fails.
    let emailed = false;
    if (emailConfigured()) {
      emailed = await sendMail(
        parsed.data.email,
        `${admin.name} invited you to Farm Project Tracker`,
        inviteEmail(parsed.data.name, admin.name, inviteUrl),
      );
    }
    return NextResponse.json({ ok: true, inviteUrl, emailed });
  } catch (e) {
    return errorResponse(e);
  }
}
