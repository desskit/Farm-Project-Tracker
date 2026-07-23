import { NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptInvite } from '@/lib/auth/invites';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

const schema = z.object({ password: z.string().min(8, 'Password must be at least 8 characters.') });

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid password.' }, { status: 400 });
  }

  const hash = await hashPassword(parsed.data.password);
  const result = await acceptInvite(params.token, hash);
  if (!result) {
    return NextResponse.json({ error: 'This invite link is invalid or has expired.' }, { status: 410 });
  }

  await createSession(result.userId);
  return NextResponse.json({ ok: true });
}
