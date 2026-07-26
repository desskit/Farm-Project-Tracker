import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { listBackups, runBackup } from '@/lib/backup';
import { errorResponse } from '@/lib/api/errors';

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ backups: await listBackups() });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Runs a backup immediately, outside the nightly schedule. */
export async function POST() {
  try {
    await requireAdmin();
    const summary = await runBackup();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return errorResponse(e);
  }
}
