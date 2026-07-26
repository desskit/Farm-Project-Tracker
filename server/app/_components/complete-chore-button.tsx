'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { submitQueued } from '@/lib/client/outbox';

/**
 * Quick-complete used on the dashboard and chores list. When the chore
 * requires a photo or has checklist steps, this becomes a link to the chore
 * detail page instead — mirroring the prototype's complete-chore handler
 * (js/app.js), which opens the full form rather than completing directly.
 */
export function CompleteChoreButton({
  choreId,
  choreName,
  gated,
}: {
  choreId: string;
  choreName: string;
  gated: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gated) {
    return (
      <Link href={`/chores/${choreId}`} className="btn small">
        Open
      </Link>
    );
  }

  async function onClick() {
    setLoading(true);
    setError(null);
    setQueued(false);
    const r = await submitQueued({
      url: `/api/chores/${choreId}/complete`,
      body: {},
      label: `Completed ${choreName}`,
    });
    setLoading(false);
    if (r.ok) {
      router.refresh();
      return;
    }
    if (r.queued) {
      // Saved on the device; the outbox bar tracks it from here.
      setQueued(true);
      return;
    }
    setError(r.error);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button onClick={onClick} disabled={loading || queued} className={`btn small ${queued ? 'done' : 'primary'}`}>
        {loading ? '…' : queued ? 'Saved ✓' : 'Done'}
      </button>
      {queued && <span className="subtle" style={{ fontSize: 11 }}>syncs when back online</span>}
      {error && <span className="error-text" style={{ fontSize: 11 }}>{error}</span>}
    </div>
  );
}
