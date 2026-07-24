import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { restoreBackup } from '@/lib/data/restore';
import { errorResponse } from '@/lib/api/errors';

// Restore the farm from a JSON backup (admin only, destructive). The client
// posts the parsed backup file as the JSON request body.
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const backup = await req.json().catch(() => null);
    const counts = await restoreBackup(admin, backup);
    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    return errorResponse(e);
  }
}
