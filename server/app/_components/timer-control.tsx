'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDur } from '@/lib/domain/dates';
import type { TimerKind } from '@/lib/data/timers';

/**
 * Start/stop work-timer control for a single item (chore, project task, or
 * maintenance item). Shows a live-ticking clock while running and the logged
 * total so far. Server owns the truth; this just drives the two endpoints.
 */
export function TimerControl({
  kind,
  refId,
  running,
  startedAt,
  totalSec,
}: {
  kind: TimerKind;
  refId: string;
  running: boolean;
  startedAt: number | null;
  totalSec: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(running ? '/api/timers/stop' : '/api/timers/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, refId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const elapsed = running && startedAt ? (now - startedAt) / 1000 : 0;

  return (
    <div className="timer-line">
      <button className={`btn small ${running ? 'ghost danger' : 'ghost'}`} disabled={busy} onClick={toggle}>
        {busy ? '…' : running ? '⏹ Stop timer' : '⏱ Start timer'}
      </button>
      {running && <span className="timer-live">{fmtDur(elapsed)}</span>}
      {totalSec > 0 && (
        <span className="subtle" style={{ fontSize: 13 }}>
          {fmtDur(totalSec)} logged
        </span>
      )}
    </div>
  );
}
