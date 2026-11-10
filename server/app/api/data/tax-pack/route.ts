import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { taxPack } from '@/lib/data/tax-pack';
import { tarGzEntries } from '@/lib/data/tar';
import { logActivity } from '@/lib/data/activity';

export const runtime = 'nodejs';

/** Income, paid expenses and receipts for one year, as a single .tar.gz. */
export async function GET(req: Request) {
  try {
    const user = await requireCap('finance.manage');
    const year = Number(new URL(req.url).searchParams.get('year')) || new Date().getFullYear();
    if (year < 2000 || year > 2100) return NextResponse.json({ error: 'Pick a year.' }, { status: 400 });
    const pack = await taxPack(year);
    await logActivity(user.id, `downloaded the ${year} tax pack`, { audience: 'finance.view' });
    return new NextResponse(Readable.toWeb(tarGzEntries(pack.entries, `farm-records-${year}`)) as ReadableStream, {
      headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="farm-records-${year}.tar.gz"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
