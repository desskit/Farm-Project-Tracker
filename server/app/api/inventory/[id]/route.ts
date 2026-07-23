import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { updateInventoryItem, deleteInventoryItem } from '@/lib/data/inventory';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  unit: z.string().optional(),
  reorderAt: z.number().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid update.' }, { status: 400 });
    const item = await updateInventoryItem(user, params.id, parsed.data);
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await deleteInventoryItem(user, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
