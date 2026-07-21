import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

// Liveness + DB connectivity check for Docker/Caddy healthchecks.
export async function GET() {
  try {
    await db.run(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: 'up', time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: 'down', error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
