'use client';
import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, ButtonLink, EmptyState } from '@/components/ui';
import s from '@/components/patterns/patterns.module.css';

/** Branded fallback for an unhandled error on any page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[ui] unhandled error', error);
  }, [error]);
  return (
    <main className={s.screen}>
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        action={<span className={s.rowsMeta}><Button onClick={reset}>Try again</Button><ButtonLink href="/" variant="ghost">Back to Today</ButtonLink></span>}
      >
        That page hit an error. Try again — if it keeps happening, tell an admin.{error.digest ? ` (ref ${error.digest})` : ''}
      </EmptyState>
    </main>
  );
}
