import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { listUsers, createUserWithInvite } from '@/lib/data/users';
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
    await requireAdmin();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Name, email, and role are required.' }, { status: 400 });
    }
    const { inviteToken } = await createUserWithInvite(parsed.data);
    const base = process.env.PUBLIC_URL || new URL(req.url).origin;
    return NextResponse.json({ ok: true, inviteUrl: `${base}/invite/${inviteToken}` });
  } catch (e) {
    return errorResponse(e);
  }
}
