import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/session';
import { DataError } from '@/lib/data/errors';

/** Shared error → HTTP response mapping, used by every API route handler. */
export function errorResponse(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof DataError) return NextResponse.json({ error: e.message }, { status: e.status });
  // eslint-disable-next-line no-console
  console.error(e);
  return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
}
