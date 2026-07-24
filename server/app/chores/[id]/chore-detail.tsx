'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ChoreRow, ChoreCompletionRow } from '@/lib/data/chores';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import type { Bucket } from '@/lib/domain/dashboard';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import { TimerControl } from '@/app/_components/timer-control';
import { ChoreForm, type ChorePayload } from '../chore-form';

export function ChoreDetail({
  chore,
  completions,
  streak,
  people,
  currentUser,
  scheduleLabel,
  bucket,
  dueLabel,
  timerRunning,
  timerStartedAt,
  timerTotalSec,
}: {
  chore: ChoreRow;
  completions: ChoreCompletionRow[];
  streak: number;
  people: PersonRow[];
  currentUser: SessionUser;
  scheduleLabel: string;
  bucket: Bucket;
  dueLabel: string;
  timerRunning: boolean;
  timerStartedAt: number | null;
  timerTotalSec: number;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const stepsRemaining = chore.steps.length > 0 && checked.size < chore.steps.length;

  async function request(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return false;
    }
    return true;
  }

  async function onComplete(e: FormEvent) {
    e.preventDefault();
    if (stepsRemaining) {
      setError('Tick every checklist step first.');
      return;
    }
    if (chore.requirePhoto && !photo) {
      setError('A photo is required to complete this chore.');
      return;
    }
    setBusy('complete');
    setError(null);
    let photoId: string | null = null;
    try {
      if (photo) photoId = await uploadPhoto(photo);
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
      return;
    }
    const ok = await request(`/api/chores/${chore.id}/complete`, 'POST', { notes, photoId });
    setBusy(null);
    if (ok) {
      setNotes('');
      setPhoto(null);
      setChecked(new Set());
      router.refresh();
    }
  }

  async function act(key: string, url: string, method: string, body?: unknown, then?: () => void) {
    setBusy(key);
    const ok = await request(url, method, body);
    setBusy(null);
    if (ok) (then ?? (() => router.refresh()))();
  }

  async function onDelete() {
    if (!confirm('Delete this chore and its history?')) return;
    await act('delete', `/api/chores/${chore.id}`, 'DELETE', undefined, () => router.push('/chores'));
  }

  async function onSendBack(completionId: string) {
    const reason = window.prompt('Send this work back to be redone. Reason (optional):', '');
    if (reason === null) return;
    await act('sendback-' + completionId, `/api/chore-completions/${completionId}/send-back`, 'POST', { reason });
  }

  if (editing) {
    return (
      <>
        <div className="sub-head">
          <button className="btn small ghost back-btn" onClick={() => setEditing(false)}>
            ‹ Cancel
          </button>
          <h1>Edit chore</h1>
        </div>
        <div className="card">
          <ChoreForm
            people={people}
            initial={chore}
            submitLabel="Save"
            onSubmit={async (payload: ChorePayload) => {
              const res = await fetch(`/api/chores/${chore.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return data.error || 'Something went wrong.';
              }
              setEditing(false);
              router.refresh();
              return null;
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="sub-head">
        <Link href="/chores" className="btn small ghost back-btn">
          ‹ Chores
        </Link>
        <h1>{chore.name}</h1>
      </div>

      {chore.sentBack && (
        <div className="sb-banner">
          ↩ Sent back{chore.sentBack.reason ? `: "${chore.sentBack.reason}"` : ''} — please redo.
        </div>
      )}

      <div className="card">
        <p className="subtle" style={{ margin: 0 }}>
          {scheduleLabel}
        </p>
        <div className="item-badges">
          {chore.done ? (
            <span className="badge">✓ Completed</span>
          ) : (
            <>
              <span className={`badge ${badgeClass(bucket)}`}>{bucketLabel(bucket)}</span>
              <span className="chip">Due {dueLabel}</span>
            </>
          )}
          <span className="chip">
            {chore.assignedTo ? (nameById.get(chore.assignedTo) ?? 'Unassigned') : chore.open ? '🙌 open' : 'Unassigned'}
          </span>
          {chore.requirePhoto && <span className="chip">📷 photo required</span>}
        </div>
        {streak >= 2 && (
          <p style={{ color: 'var(--brand)', fontWeight: 700, margin: '10px 0 0' }}>🔥 {streak}-day streak</p>
        )}

        <div className="row-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {chore.open && !chore.assignedTo && (
            <button className="btn small primary" disabled={busy === 'claim'} onClick={() => act('claim', `/api/chores/${chore.id}/claim`, 'POST')}>
              Claim
            </button>
          )}
          {chore.open && chore.assignedTo === currentUser.id && (
            <button className="btn small ghost" disabled={busy === 'release'} onClick={() => act('release', `/api/chores/${chore.id}/release`, 'POST')}>
              Release
            </button>
          )}
          {isManager && (
            <>
              <button className="btn small ghost" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="btn small ghost danger" disabled={busy === 'delete'} onClick={onDelete}>
                Delete
              </button>
            </>
          )}
        </div>
        {!chore.done && (
          <TimerControl
            kind="chore"
            refId={chore.id}
            running={timerRunning}
            startedAt={timerStartedAt}
            totalSec={timerTotalSec}
          />
        )}
      </div>

      {!chore.done && (
        <>
          <div className="section-title">Complete</div>
          <div className="card">
        <form onSubmit={onComplete}>
          {chore.steps.length > 0 && (
            <div className="field">
              <label>Checklist — tick each step</label>
              {chore.steps.map((step, i) => (
                <label className="inline-check" key={i} style={{ marginBottom: 6 }}>
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
                  {step}
                </label>
              ))}
            </div>
          )}
          {chore.requirePhoto && (
            <div className="field">
              <label>📷 Photo proof (required)</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </div>
          )}
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" disabled={busy === 'complete'} className="btn primary block">
            {busy === 'complete' ? 'Saving…' : 'Mark done'}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
          </div>
        </>
      )}

      <div className="section-title">
        History
        <span className="count-pill">{completions.length}</span>
      </div>
      <div className="card">
        {!completions.length ? (
          <p className="subtle" style={{ margin: 0 }}>
            Never completed yet.
          </p>
        ) : (
          completions.map((c) => (
            <div className="hist-row" key={c.id}>
              <span>
                <strong>{fmtDate(c.date)}</strong> · {nameById.get(c.completedBy ?? '') ?? 'Unknown'}
                {c.notes ? ` · ${c.notes}` : ''}
                {c.photoId && (
                  <>
                    {' '}
                    <a href={`/api/attachments/${c.photoId}`} target="_blank" rel="noopener" className="chip-link">
                      📷 proof
                    </a>
                  </>
                )}
              </span>
              {isManager && (
                <button className="icon-btn" style={{ color: 'var(--overdue)' }} title="Send back" disabled={busy === 'sendback-' + c.id} onClick={() => onSendBack(c.id)}>
                  ↩
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

function bucketLabel(b: Bucket): string {
  if (b === 'overdue') return 'Overdue';
  if (b === 'today') return 'Due today';
  if (b === 'upcoming') return 'Coming up';
  return 'Not due soon';
}
function badgeClass(b: Bucket): string {
  if (b === 'overdue') return 'overdue';
  if (b === 'today') return 'today';
  if (b === 'upcoming') return 'upcoming';
  return 'neutral';
}
