'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlarmClock, Camera, ChevronLeft, Flame, Hand, Image as ImageIcon, Pencil, SkipForward, Trash2, Undo2 } from 'lucide-react';
import type { ChoreRow, ChoreCompletionRow, ChoreSupply } from '@/lib/data/chores';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import type { Bucket } from '@/lib/domain/dashboard';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { preparePhoto } from '@/lib/client/photo';
import { submitQueued } from '@/lib/client/outbox';
import { useMutation } from '@/lib/client/mutate';
import { TimerControl } from '@/app/_components/timer-control';
import { can } from '@/lib/domain/permissions';
import { AvatarStack, Banner, Button, Card, Dialog, Field, IconButton, Input, PageHeader, Stack, StatusPill, type Tone } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import { ChoreForm, type ChorePayload, type SupplyOption } from '../chore-form';
import s from './chore-detail.module.css';

const BUCKET: Record<Bucket, { tone: Tone; label: string }> = {
  overdue: { tone: 'overdue', label: 'Overdue' },
  today: { tone: 'today', label: 'Due today' },
  upcoming: { tone: 'upcoming', label: 'Coming up' },
  later: { tone: 'neutral', label: 'Not due soon' },
};

export function ChoreDetail({
  chore, completions, streak, people, currentUser, scheduleLabel, outOfSeason, bucket, dueLabel,
  timerRunning, timerStartedAt, timerTotalSec, supplies, supplyOptions,
}: {
  /** What this chore takes off the shelf each time. */
  supplies: ChoreSupply[];
  supplyOptions: SupplyOption[];
  chore: ChoreRow;
  completions: ChoreCompletionRow[];
  streak: number;
  people: PersonRow[];
  currentUser: SessionUser;
  scheduleLabel: string;
  /** Computed server-side so it can't drift with the device's clock. */
  outOfSeason: boolean;
  bucket: Bucket;
  dueLabel: string;
  timerRunning: boolean;
  timerStartedAt: number | null;
  timerTotalSec: number;
}) {
  const { confirm: askConfirm, prompt: askPrompt } = useDialogs();
  const router = useRouter();
  const action = useMutation();
  const isManager = can(currentUser, 'work.manage');
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const onIt = chore.assigneeIds.includes(currentUser.id);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const stepsRemaining = chore.steps.length > 0 && checked.size < chore.steps.length;

  async function onComplete(e: FormEvent) {
    e.preventDefault();
    if (stepsRemaining) return setError('Tick every checklist step first.');
    if (chore.requirePhoto && !photo) return setError('A photo is required to complete this chore.');
    setCompleting(true);
    setError(null);
    setQueuedMsg(null);
    // Resize (but don't upload) up front so the photo can ride along in the
    // outbox if this device is out of signal.
    let prepared;
    try {
      if (photo) prepared = await preparePhoto(photo);
    } catch (err) {
      setCompleting(false);
      return setError(err instanceof Error ? err.message : 'Could not read that photo.');
    }
    const r = await submitQueued({
      url: `/api/chores/${chore.id}/complete`,
      body: { notes },
      label: `Completed ${chore.name}`,
      photo: prepared,
      photoField: 'photoId',
    });
    setCompleting(false);
    if (!r.ok && !r.queued) return setError(r.error);
    setNotes('');
    setPhoto(null);
    setChecked(new Set());
    if (r.ok) router.refresh();
    else setQueuedMsg('Saved on this device — it will sync when you’re back online.');
  }

  async function onDelete() {
    if (!(await askConfirm('Delete this chore and its history?'))) return;
    const res = await fetch(`/api/chores/${chore.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/chores');
    else setError((await res.json().catch(() => ({}))).error || 'Could not delete.');
  }

  async function onSendBack(completionId: string) {
    const reason = await askPrompt('Send this work back to be redone. Reason (optional):', '');
    if (reason === null) return;
    await action.run({ url: `/api/chore-completions/${completionId}/send-back`, body: { reason }, label: `Sent back ${chore.name}` });
  }

  if (editing) {
    return (
      <Stack>
        <PageHeader
          back={<IconButton label="Cancel editing" onClick={() => setEditing(false)}><ChevronLeft /></IconButton>}
          title="Edit chore"
        />
        <Card>
          <ChoreForm
            people={people}
            initial={chore}
            supplyOptions={supplyOptions}
            initialSupplies={supplies}
            submitLabel="Save"
            onSubmit={async (payload: ChorePayload) => {
              const res = await fetch(`/api/chores/${chore.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (!res.ok) return (await res.json().catch(() => ({}))).error || 'Something went wrong.';
              setEditing(false);
              router.refresh();
              return null;
            }}
          />
        </Card>
      </Stack>
    );
  }

  const status = BUCKET[bucket];
  return (
    <Stack gap={16}>
      <PageHeader
        back={<Link href="/chores" aria-label="Back to chores" className={s.back}><ChevronLeft /></Link>}
        title={chore.name}
        subtitle={scheduleLabel}
        actions={
          isManager ? (
            <>
              <IconButton label="Edit chore" onClick={() => setEditing(true)}><Pencil /></IconButton>
              <IconButton label="Delete chore" onClick={onDelete}><Trash2 /></IconButton>
            </>
          ) : undefined
        }
      />

      {chore.sentBack && (
        <Banner tone="warn" title="Sent back — please redo">
          {chore.sentBack.reason || 'No reason given.'}
        </Banner>
      )}

      <Card>
        <div className={s.facts}>
          {chore.done ? (
            <StatusPill tone="done">Completed</StatusPill>
          ) : outOfSeason ? (
            <StatusPill tone="neutral">Out of season</StatusPill>
          ) : (
            <StatusPill tone={status.tone}>{status.label} · {dueLabel}</StatusPill>
          )}
          {chore.requirePhoto && <span className={s.flag}><Camera aria-hidden /> photo needed</span>}
          {streak >= 2 && <span className={s.streak}><Flame aria-hidden /> {streak}-day streak</span>}
        </div>
        {supplies.length > 0 && (
          <p className={s.muted}>
            Uses {supplies.map((x) => `${x.qty} ${x.unit} ${x.name}`).join(', ')}
            {supplies.some((x) => x.onHand < x.qty) ? ' — the shelf is short' : ''}
          </p>
        )}
        <div className={s.people}>
          {chore.assigneeIds.length ? (
            <>
              <AvatarStack names={chore.assigneeIds.map((id) => nameById.get(id) ?? 'Someone')} max={4} />
              <span>{chore.assigneeIds.map((id) => nameById.get(id) ?? 'Someone').join(', ')}</span>
            </>
          ) : (
            <span className={s.muted}>{chore.open ? 'Up for grabs' : 'Nobody assigned'}</span>
          )}
        </div>
        <div className={s.actions}>
          {chore.open && !onIt && can(currentUser, 'work.claim') && (
            <Button size="sm" icon={<Hand />} loading={action.busy} onClick={() => action.run({ url: `/api/chores/${chore.id}/claim`, label: `Took ${chore.name}` })}>
              Take it
            </Button>
          )}
          {chore.open && onIt && (
            <Button size="sm" variant="secondary" loading={action.busy} onClick={() => action.run({ url: `/api/chores/${chore.id}/release`, label: `Stepped off ${chore.name}` })}>
              Step off
            </Button>
          )}
          {!chore.done && (onIt || isManager) && <RescheduleButtons choreId={chore.id} name={chore.name} repeats={chore.schedule.type !== 'once'} />}
        </div>
        {!chore.done && (
          <TimerControl kind="chore" refId={chore.id} running={timerRunning} startedAt={timerStartedAt} totalSec={timerTotalSec} />
        )}
        {action.error && <Banner tone="danger">{action.error}</Banner>}
      </Card>

      {!chore.done && (
        <Card title="Mark it done">
          <form onSubmit={onComplete}>
            <Stack>
              {chore.steps.length > 0 && (
                <fieldset className={s.steps}>
                  <legend className={s.legend}>
                    Checklist · {checked.size} of {chore.steps.length}
                  </legend>
                  {chore.steps.map((step, i) => (
                    <label className={s.step} key={i}>
                      <input
                        type="checkbox"
                        checked={checked.has(i)}
                        onChange={() =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                      />
                      <span>{step}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {chore.requirePhoto && (
                <label className={s.photo}>
                  <Camera aria-hidden />
                  {photo ? photo.name : 'Take or choose a photo (required)'}
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </label>
              )}
              <Field label="Note (optional)" htmlFor="chore-note">
                <Input id="chore-note" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              {error && <Banner tone="danger">{error}</Banner>}
              {queuedMsg && <Banner tone="ok">{queuedMsg}</Banner>}
              <Button type="submit" block loading={completing} disabled={stepsRemaining || (chore.requirePhoto && !photo)}>
                Mark done
              </Button>
            </Stack>
          </form>
        </Card>
      )}

      <Card title={<span className={s.histTitle}>History <span className={s.count}>{completions.length}</span></span>} flush>
        {!completions.length ? (
          <p className={s.empty}>Never completed yet.</p>
        ) : (
          completions.map((c) => (
            <div className={s.hist} key={c.id}>
              <div className={s.histMain}>
                <strong>{fmtDate(c.date)}</strong> · {nameById.get(c.completedBy ?? '') ?? 'Unknown'}
                {c.notes && <div className={s.muted}>{c.notes}</div>}
              </div>
              {c.photoId && (
                <a href={`/api/attachments/${c.photoId}`} target="_blank" rel="noopener" className={s.proof} aria-label="View photo proof">
                  <ImageIcon aria-hidden />
                </a>
              )}
              {isManager && (
                <IconButton label="Send back to redo" onClick={() => onSendBack(c.id)}>
                  <Undo2 />
                </IconButton>
              )}
            </div>
          ))
        )}
      </Card>
    </Stack>
  );
}

/** Skip this one (repeating chores) or push it to a later day. */
function RescheduleButtons({ choreId, name, repeats }: { choreId: string; name: string; repeats: boolean }) {
  const { confirm: askConfirm } = useDialogs();
  const m = useMutation();
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const [until, setUntil] = useState(addDays(today, 1));
  async function snooze(d: string) {
    if (await m.run({ url: `/api/chores/${choreId}/snooze`, body: { until: d }, label: `Snoozed ${name}` })) setOpen(false);
  }
  return (
    <>
      {repeats && (
        <Button size="sm" variant="ghost" icon={<SkipForward />} loading={m.busy} onClick={async () => {
          if (await askConfirm(`Skip this time? Nothing is logged as done, and ${name} comes due again next time round.`)) m.run({ url: `/api/chores/${choreId}/skip`, label: `Skipped ${name}` });
        }}>Skip this one</Button>
      )}
      <Button size="sm" variant="ghost" icon={<AlarmClock />} onClick={() => setOpen(true)}>Snooze</Button>
      {m.error && <span className={s.muted}>{m.error}</span>}
      <Dialog sheet open={open} onClose={() => setOpen(false)} title={`Snooze ${name}`}>
        <Stack>
          <div className={s.actions}>
            {[[1, 'Tomorrow'], [3, '3 days'], [7, 'A week']].map(([n, label]) => (
              <Button key={n} variant="secondary" loading={m.busy} onClick={() => snooze(addDays(today, n as number))}>{label}</Button>
            ))}
          </div>
          <Field label="Or pick a day" htmlFor="snooze-until">
            <Input id="snooze-until" type="date" min={addDays(today, 1)} max={addDays(today, 60)} value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
          <Button block loading={m.busy} onClick={() => snooze(until)}>Snooze to {fmtDate(until)}</Button>
          {m.error && <Banner tone="danger">{m.error}</Banner>}
        </Stack>
      </Dialog>
    </>
  );
}
