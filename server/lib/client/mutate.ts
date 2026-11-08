'use client';
/**
 * useMutation: the one way screens send a change. Wraps the offline outbox
 * (lib/client/outbox.ts), so every write queues when there's no signal, and
 * gives the button what it needs: busy, queued ("saved, will sync"), error,
 * and a page refresh when the server accepted it.
 *
 *   const done = useMutation();
 *   <Button loading={done.busy} onClick={() => done.run({ url, label: 'Fed hens' })}>Done</Button>
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitQueued } from './outbox';

export type MutationInput = {
  url: string;
  label: string;
  body?: Record<string, unknown>;
  method?: string;
  /** Refresh the page's server data after success (default true). */
  refresh?: boolean;
};

export function useMutation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (m: MutationInput): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setQueued(false);
      try {
        const r = await submitQueued({ url: m.url, body: m.body ?? {}, label: m.label, method: m.method });
        if (r.ok) {
          if (m.refresh !== false) router.refresh();
          return true;
        }
        if (r.queued) {
          setQueued(true);
          return true;
        }
        setError(r.error);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { run, busy, queued, error };
}
