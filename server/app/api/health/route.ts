import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

// Liveness + DB connectivity check for Docker/Caddy healthchecks. This endpoint
// is unauthenticated, so the response stays generic — the underlying error is
// logged server-side rather than returned to the caller.
export async function GET() {
  try {
    await db.run(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[health] database check failed', e);
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
