'use client';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ChoreRow, ChoreCompletionRow } from '@/lib/data/chores';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import type { Bucket } from '@/lib/domain/dashboard';
import { fmtDate } from '@/lib/domain/dates';
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
}: {
  chore: ChoreRow;
  completions: ChoreCompletionRow[];
  streak: number;
  people: PersonRow[];
  currentUser: SessionUser;
  scheduleLabel: string;
  bucket: Bucket;
  dueLabel: string;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // which action is in flight

  const canComplete = !chore.requirePhoto;
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
    setBusy('complete');
    const ok = await request(`/api/chores/${chore.id}/complete`, 'POST', { notes });
    setBusy(null);
    if (ok) {
      setNotes('');
      setChecked(new Set());
      router.refresh();
    }
  }

  async function onClaim() {
    setBusy('claim');
    const ok = await request(`/api/chores/${chore.id}/claim`, 'POST');
    setBusy(null);
    if (ok) router.refresh();
  }

  async function onRelease() {
    setBusy('release');
    const ok = await request(`/api/chores/${chore.id}/release`, 'POST');
    setBusy(null);
    if (ok) router.refresh();
  }

  async function onDelete() {
    if (!confirm('Delete this chore and its history?')) return;
    setBusy('delete');
    const ok = await request(`/api/chores/${chore.id}`, 'DELETE');
    setBusy(null);
    if (ok) router.push('/chores');
  }

  async function onSendBack(completionId: string) {
    const reason = window.prompt('Send this work back to be redone. Reason (optional):', '');
    if (reason === null) return; // cancelled
    setBusy('sendback-' + completionId);
    const ok = await request(`/api/chore-completions/${completionId}/send-back`, 'POST', { reason });
    setBusy(null);
    if (ok) router.refresh();
  }

  if (editing) {
    return (
      <div>
        <button onClick={() => setEditing(false)} style={ghostButtonStyle}>
          ‹ Cancel
        </button>
        <h1 style={{ fontSize: 20, margin: '8px 0 16px' }}>Edit chore</h1>
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
    );
  }

  return (
    <div>
      {chore.sentBack && (
        <div style={sentBackStyle}>
          ↩ Sent back{chore.sentBack.reason ? `: "${chore.sentBack.reason}"` : ''} — please redo.
        </div>
      )}

      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>{chore.name}</h1>
      <p style={{ color: 'var(--muted)', margin: 0 }}>{scheduleLabel}</p>
      <p style={{ margin: '6px 0 0' }}>
        <span style={badgeStyle(bucket)}>{bucketLabel(bucket)}</span>{' '}
        Due {dueLabel} ·{' '}
        {chore.assignedTo ? (nameById.get(chore.assignedTo) ?? 'Unassigned') : chore.open ? 'Open — up for grabs' : 'Unassigned'}
        {chore.requirePhoto ? ' · 📷 photo required' : ''}
      </p>

      {streak >= 2 && <p style={{ color: 'var(--brand)', fontWeight: 700, marginTop: 8 }}>🔥 {streak}-day streak</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {chore.open && !chore.assignedTo && (
          <button onClick={onClaim} disabled={busy === 'claim'} style={buttonStyle}>
            Claim
          </button>
        )}
        {chore.open && chore.assignedTo === currentUser.id && (
          <button onClick={onRelease} disabled={busy === 'release'} style={ghostButtonStyle}>
            Release
          </button>
        )}
        {isManager && (
          <>
            <button onClick={() => setEditing(true)} style={ghostButtonStyle}>
              Edit
            </button>
            <button onClick={onDelete} disabled={busy === 'delete'} style={dangerButtonStyle}>
              Delete
            </button>
          </>
        )}
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={sectionTitleStyle}>Complete</h2>
        {!canComplete ? (
          <p style={{ color: 'var(--muted)' }}>Photo upload isn&apos;t available yet — ask an admin to complete this one for now.</p>
        ) : (
          <form onSubmit={onComplete} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
            {chore.steps.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {chore.steps.map((step, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
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
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" style={inputStyle} />
            <button type="submit" disabled={busy === 'complete'} style={buttonStyle}>
              {busy === 'complete' ? 'Saving…' : 'Mark done'}
            </button>
          </form>
        )}
      </section>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <section style={{ marginTop: 24 }}>
        <h2 style={sectionTitleStyle}>
          History <span style={countStyle}>{completions.length}</span>
        </h2>
        {!completions.length ? (
          <p style={{ color: 'var(--muted)' }}>Never completed yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {completions.map((c) => (
              <li key={c.id} style={histRowStyle}>
                <div>
                  <strong>{fmtDate(c.date)}</strong> · {nameById.get(c.completedBy ?? '') ?? 'Unknown'}
                  {c.notes ? ` · ${c.notes}` : ''}
                </div>
                {isManager && (
                  <button onClick={() => onSendBack(c.id)} disabled={busy === 'sendback-' + c.id} style={ghostDangerStyle} title="Send back">
                    ↩
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function bucketLabel(b: Bucket): string {
  if (b === 'overdue') return 'Overdue';
  if (b === 'today') return 'Due today';
  if (b === 'upcoming') return 'Coming up';
  return 'Not due soon';
}
function badgeStyle(b: Bucket): CSSProperties {
  const bg = b === 'overdue' ? '#fbeae7' : b === 'today' ? '#fbf3df' : b === 'upcoming' ? '#e7f1ea' : 'var(--surface-2)';
  const color = b === 'overdue' ? '#c0392b' : b === 'today' ? '#b8860b' : b === 'upcoming' ? '#2f6f4f' : 'var(--muted)';
  return { background: bg, color, borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 700 };
}

const sentBackStyle: CSSProperties = {
  background: '#fbeae7',
  color: '#c0392b',
  border: '1px solid #c0392b',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 12,
};
const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--muted)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const countStyle: CSSProperties = { background: 'var(--surface-2)', color: 'var(--muted)', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 700 };
const histRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 13.5,
};
const inputStyle: CSSProperties = {
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
};
const buttonStyle: CSSProperties = {
  padding: '9px 14px',
  borderRadius: 8,
  border: '1px solid var(--brand)',
  background: 'var(--brand)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 14,
};
const ghostButtonStyle: CSSProperties = {
  padding: '9px 14px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};
const dangerButtonStyle: CSSProperties = { ...ghostButtonStyle, color: '#c0392b', borderColor: '#c0392b' };
const ghostDangerStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#c0392b',
  cursor: 'pointer',
  fontSize: 15,
  padding: 4,
};
