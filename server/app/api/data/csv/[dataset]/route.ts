import { NextResponse } from 'next/server';
import { requireCap } from '@/lib/auth/session';
import { errorResponse } from '@/lib/api/errors';
import { DATASETS, datasetCsv, isDataset } from '@/lib/data/csv';
import { can } from '@/lib/domain/permissions';
import { addDays, todayISO } from '@/lib/domain/dates';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A spreadsheet of one kind of record over a date range (default: the last year). */
export async function GET(req: Request, { params }: { params: { dataset: string } }) {
  try {
    const user = await requireCap('farm.view');
    if (!isDataset(params.dataset)) return NextResponse.json({ error: 'No such export.' }, { status: 404 });
    const ds = DATASETS[params.dataset];
    if (!can(user, ds.cap)) return NextResponse.json({ error: 'You can’t export that.' }, { status: 403 });
    const q = new URL(req.url).searchParams;
    const to = ISO.test(q.get('to') ?? '') ? q.get('to')! : todayISO();
    const from = ISO.test(q.get('from') ?? '') ? q.get('from')! : addDays(to, -365);
    const csv = await datasetCsv(params.dataset, from, to);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${params.dataset}_${from}_to_${to}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
