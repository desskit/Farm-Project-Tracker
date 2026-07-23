'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDur } from '@/lib/domain/dates';
import type { ActiveTimer } from '@/lib/data/timers';

/**
 * Sticky strip of the current user's running timers, shown app-wide. Ticks
 * live and lets you stop a timer from anywhere. Rendered by the layout only
 * when at least one timer is running.
 */
export function TimersStrip({ timers }: { timers: ActiveTimer[] }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [stopping, setStopping] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function stop(timer: ActiveTimer) {
    setStopping(timer.id);
    try {
      await fetch('/api/timers/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: timer.kind, refId: timer.refId }),
      });
      router.refresh();
    } finally {
      setStopping(null);
    }
  }

  return (
    <div className="timers-strip">
      {timers.map((t) => (
        <div className="timer-chip" key={t.id}>
          <span>⏱ {t.label}</span>
          <span className="timer-live">{fmtDur((now - t.start) / 1000)}</span>
          <button className="btn small ghost" disabled={stopping === t.id} onClick={() => stop(t)}>
            {stopping === t.id ? '…' : 'Stop'}
          </button>
        </div>
      ))}
    </div>
  );
}
