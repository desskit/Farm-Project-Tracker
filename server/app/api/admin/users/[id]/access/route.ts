import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { setAccessExpiry, setUserCap } from '@/lib/data/users';
import { errorResponse } from '@/lib/api/errors';
import { CAPS, type Cap } from '@/lib/domain/permissions';

const schema = z.object({
  /** One switch: true/false, or null for "role default". */
  cap: z.enum(CAPS as unknown as [Cap, ...Cap[]]).optional(),
  allow: z.boolean().nullable().optional(),
  /** Epoch ms, or null to remove the end date. */
  accessExpiresAt: z.number().int().positive().nullable().optional(),
});

/** Per-person access: one permission switch and/or the access end date. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireCap('people.manage', 'Only admins can change access.');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const { cap, allow, accessExpiresAt } = parsed.data;
    if (cap) await setUserCap(admin.id, params.id, cap, allow ?? null);
    if (accessExpiresAt !== undefined) await setAccessExpiry(admin.id, params.id, accessExpiresAt);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
