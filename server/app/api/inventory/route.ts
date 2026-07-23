import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { listInventory, addInventoryItem } from '@/lib/data/inventory';
import { errorResponse } from '@/lib/api/errors';

const schema = z.object({
  name: z.string().trim().min(1),
  category: z.string().optional(),
  unit: z.string().optional(),
  qty: z.number().optional(),
  reorderAt: z.number().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ inventory: await listInventory() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
    const item = await addInventoryItem(user, parsed.data);
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
