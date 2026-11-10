import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCap } from '@/lib/auth/session';
import { addAssetDoc } from '@/lib/data/asset-docs';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  name: z.string().trim().min(1),
  docType: z.enum(['receipt', 'manual', 'warranty', 'other']),
  attachmentId: z.string().min(1),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('farm.view');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid document.' }, { status: 400 });
    await addAssetDoc(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
