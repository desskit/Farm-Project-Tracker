import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addPerennial } from '@/lib/data/land';
import { perennialSchema } from '@/lib/api/land-schemas';


export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('land.manage');
    const parsed = perennialSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await addPerennial(user, params.id, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
