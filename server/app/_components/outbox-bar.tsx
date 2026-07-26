'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flushOutbox, onOutboxChange, pendingEntries, type OutboxEntry } from '@/lib/client/outbox';

/**
 * Shows what's waiting to sync, and drives the flush.
 *
 * Work saved out of signal is invisible otherwise, which is worse than not
 * queueing at all — someone needs to know their chore hasn't actually landed
 * yet. Stays hidden when there's nothing pending and the device is online.
 */
export function OutboxBar() {
  const router = useRouter();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await pendingEntries());
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await flushOutbox();
      setProblems(r.errors);
      if (r.sent > 0) router.refresh();
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [router, refresh]);

  useEffect(() => {
    refresh();
    const off = onOutboxChange(refresh);
    // Coming back online is the moment that matters most.
    const onOnline = () => {
      refresh();
      sync();
    };
    window.addEventListener('online', onOnline);
    // Catch anything left over from a previous session, and re-try
    // periodically in case connectivity returns without an 'online' event
    // (captive portals and flaky mobile data don't always fire one).
    sync();
    const timer = setInterval(() => {
      if (navigator.onLine) sync();
    }, 60_000);
    return () => {
      off();
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = entries.length;
  if (!n && !offline && !problems.length) return null;

  return (
    <div className={`outbox-bar ${offline ? 'is-offline' : ''}`}>
      <div className="outbox-main">
        <span className="outbox-dot" aria-hidden />
        <button className="outbox-summary" onClick={() => setOpen((v) => !v)} disabled={!n && !problems.length}>
          {offline && !n && 'Offline — changes will be saved here'}
          {offline && n > 0 && `Offline · ${n} change${n === 1 ? '' : 's'} saved`}
          {!offline && n > 0 && (syncing ? `Syncing ${n}…` : `${n} change${n === 1 ? '' : 's'} waiting to sync`)}
          {!offline && !n && problems.length > 0 && `${problems.length} change${problems.length === 1 ? '' : 's'} could not be saved`}
        </button>
        {!offline && n > 0 && (
          <button className="btn small" disabled={syncing} onClick={sync}>
            {syncing ? '…' : 'Sync now'}
          </button>
        )}
      </div>

      {open && (
        <div className="outbox-detail">
          {entries.map((e) => (
            <div className="outbox-row" key={e.id}>
              <span>{e.label}</span>
              <span className="subtle">{e.photo ? '📷 ' : ''}{new Date(e.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
          {problems.map((p, i) => (
            <div className="outbox-row problem" key={`p${i}`}>
              <span>{p}</span>
            </div>
          ))}
          {problems.length > 0 && (
            <button className="btn small ghost block" onClick={() => setProblems([])}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
