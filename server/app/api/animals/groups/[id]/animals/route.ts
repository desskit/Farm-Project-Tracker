import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { addAnimal } from '@/lib/data/livestock';
import { newAnimalSchema } from '@/lib/api/livestock-schemas';


/** Give one animal in a group its own record. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireCap('animals.manage');
    const parsed = newAnimalSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await addAnimal(user, params.id, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
