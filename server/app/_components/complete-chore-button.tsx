'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Quick-complete used on the dashboard and chores list. When the chore
 * requires a photo or has checklist steps, this becomes a link to the chore
 * detail page instead — mirroring the prototype's complete-chore handler
 * (js/app.js), which opens the full form rather than completing directly.
 */
export function CompleteChoreButton({ choreId, gated }: { choreId: string; gated: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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
    const res = await fetch(`/api/chores/${choreId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button onClick={onClick} disabled={loading} className="btn small primary">
        {loading ? '…' : 'Done'}
      </button>
      {error && <span className="error-text" style={{ fontSize: 11 }}>{error}</span>}
    </div>
  );
}
