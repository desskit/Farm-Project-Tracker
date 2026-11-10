import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { saveContact } from '@/lib/data/contacts';
import { contactSchema } from '@/lib/api/people-schemas';

export async function POST(req: Request) {
  try {
    const user = await requireCap('farm.view');
    const parsed = contactSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
    const result = await saveContact(user, null, parsed.data);
    return NextResponse.json({ id: result });
  } catch (e) {
    return errorResponse(e);
  }
}
