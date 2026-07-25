'use client';
import { useEffect } from 'react';
import Link from 'next/link';

/** Branded fallback for an unhandled render/data error on any page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[ui] unhandled error', error);
  }, [error]);

  return (
    <main className="view">
      <div className="empty" style={{ marginTop: 40 }}>
        <p style={{ fontSize: 32, margin: 0 }}>🚜</p>
        <p className="item-title" style={{ marginTop: 8 }}>Something went wrong</p>
        <p className="subtle">
          That page hit an error. Try again — if it keeps happening, tell an admin.
          {error.digest ? ` (ref: ${error.digest})` : ''}
        </p>
        <div className="row-actions" style={{ justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn ghost">
            Back to Today
          </Link>
        </div>
      </div>
    </main>
  );
}
