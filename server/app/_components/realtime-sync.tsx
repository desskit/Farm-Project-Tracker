'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Keeps this device in sync with the rest of the farm. Opens an SSE stream to
 * /api/events and, whenever the server reports a change, refreshes the current
 * route so Server Components refetch. Refreshes are debounced so a burst of
 * changes triggers a single refetch. EventSource reconnects on its own.
 */
export function RealtimeSync() {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource('/api/events');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    es.addEventListener('change', onChange);
    return () => {
      if (timer) clearTimeout(timer);
      es.removeEventListener('change', onChange);
      es.close();
    };
  }, [router]);
  return null;
}
