import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { addAssetDoc } from '@/lib/data/asset-docs';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  name: z.string().trim().min(1),
  docType: z.enum(['receipt', 'manual', 'warranty', 'other']),
  attachmentId: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid document.' }, { status: 400 });
    await addAssetDoc(user, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
