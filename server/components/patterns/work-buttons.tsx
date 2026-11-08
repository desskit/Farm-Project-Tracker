'use client';
import { Check, Hand } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMutation } from '@/lib/client/mutate';
import s from './patterns.module.css';

/** One-tap "Done" for a chore; queues offline. */
export function DoneButton({ choreId, label }: { choreId: string; label: string }) {
  const m = useMutation();
  if (m.queued) return <span className={s.queued}>Saved ✓ · syncs when online</span>;
  return (
    <span className={s.btnWrap}>
      <Button
        size="sm"
        icon={<Check />}
        loading={m.busy}
        onClick={() => m.run({ url: `/api/chores/${choreId}/complete`, label: `Completed ${label}` })}
      >
        Done
      </Button>
      {m.error && <span className={s.err}>{m.error}</span>}
    </span>
  );
}

/** "I'll take it" for open work. */
export function ClaimButton({ kind, id, label }: { kind: 'chore' | 'task'; id: string; label: string }) {
  const m = useMutation();
  if (m.queued) return <span className={s.queued}>Saved ✓</span>;
  return (
    <span className={s.btnWrap}>
      <Button
        size="sm"
        variant="secondary"
        icon={<Hand />}
        loading={m.busy}
        onClick={() => m.run({ url: `/api/${kind === 'chore' ? 'chores' : 'tasks'}/${id}/claim`, label: `Took ${label}` })}
      >
        Take it
      </Button>
      {m.error && <span className={s.err}>{m.error}</span>}
    </span>
  );
}
