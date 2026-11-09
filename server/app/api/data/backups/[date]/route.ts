import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { requireAdmin } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { backupFolder } from '@/lib/backup';
import { tarGzStream } from '@/lib/data/tar';
import { logActivity } from '@/lib/data/activity';

export const runtime = 'nodejs';

/**
 * Download one day's backup — the database snapshot and every uploaded file —
 * as a single .tar.gz, to keep somewhere off this server. Admin only.
 */
export async function GET(_req: Request, { params }: { params: { date: string } }) {
  try {
    const admin = await requireAdmin();
    const dir = await backupFolder(params.date);
    if (!dir) return NextResponse.json({ error: 'No backup for that day.' }, { status: 404 });
    await logActivity(admin.id, `downloaded the ${params.date} backup`, { audience: 'system.admin' });
    const body = Readable.toWeb(tarGzStream(dir, `farm-backup-${params.date}`)) as ReadableStream;
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="farm-backup-${params.date}.tar.gz"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
