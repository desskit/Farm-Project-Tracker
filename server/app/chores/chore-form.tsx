'use client';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { PersonRow } from '@/lib/data/users';
import type { ChoreRow } from '@/lib/data/chores';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type ScheduleType = 'daily' | 'everyNDays' | 'weekly' | 'monthly';

export type ChorePayload = {
  name: string;
  schedule: { type: ScheduleType; n?: number; weekdays?: number[]; day?: number };
  catchUp: 'mustCatchUp' | 'skipToNext';
  assignedTo: string | null;
  open: boolean;
  requirePhoto: boolean;
  steps: string[];
};

/** Shared add/edit form for chores. `onSubmit` returns an error message, or null on success. */
export function ChoreForm({
  people,
  initial,
  submitLabel,
  onSubmit,
}: {
  people: PersonRow[];
  initial?: ChoreRow;
  submitLabel: string;
  onSubmit: (payload: ChorePayload) => Promise<string | null>;
}) {
  const initSchedule = initial?.schedule;
  const [name, setName] = useState(initial?.name ?? '');
  const [scheduleType, setScheduleType] = useState<ScheduleType>((initSchedule?.type as ScheduleType) ?? 'daily');
  const [n, setN] = useState(initSchedule?.n ?? 2);
  const [weekdays, setWeekdays] = useState<number[]>(initSchedule?.weekdays ?? []);
  const [day, setDay] = useState(initSchedule?.day ?? 1);
  const [catchUp, setCatchUp] = useState<'mustCatchUp' | 'skipToNext'>(initial?.catchUp ?? 'skipToNext');
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? '');
  const [open, setOpen] = useState(initial?.open ?? false);
  const [requirePhoto, setRequirePhoto] = useState(initial?.requirePhoto ?? false);
  const [steps, setSteps] = useState((initial?.steps ?? []).join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleWeekday(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  async function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const schedule: ChorePayload['schedule'] = { type: scheduleType };
    if (scheduleType === 'everyNDays') schedule.n = n;
    if (scheduleType === 'weekly') schedule.weekdays = weekdays;
    if (scheduleType === 'monthly') schedule.day = day;

    const err = await onSubmit({
      name,
      schedule,
      catchUp,
      assignedTo: assignedTo || null,
      open,
      requirePhoto,
      steps: steps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setLoading(false);
    setError(err);
    if (!err && !initial) {
      setName('');
      setSteps('');
    }
  }

  return (
    <form onSubmit={onFormSubmit} style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <label style={fieldStyle}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
      </label>

      <label style={fieldStyle}>
        Repeats
        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as ScheduleType)} style={inputStyle}>
          <option value="daily">Every day</option>
          <option value="everyNDays">Every N days</option>
          <option value="weekly">Specific weekdays</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>

      {scheduleType === 'everyNDays' && (
        <label style={fieldStyle}>
          Every how many days?
          <input type="number" min={1} value={n} onChange={(e) => setN(Number(e.target.value))} style={inputStyle} />
        </label>
      )}

      {scheduleType === 'weekly' && (
        <div style={fieldStyle}>
          Which days?
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontWeight: 400 }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                <input type="checkbox" checked={weekdays.includes(i)} onChange={() => toggleWeekday(i)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {scheduleType === 'monthly' && (
        <label style={fieldStyle}>
          Day of month
          <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} style={inputStyle} />
        </label>
      )}

      <label style={fieldStyle}>
        If missed
        <select value={catchUp} onChange={(e) => setCatchUp(e.target.value as typeof catchUp)} style={inputStyle}>
          <option value="skipToNext">Skip to next occurrence</option>
          <option value="mustCatchUp">Must catch up (stays overdue)</option>
        </select>
      </label>

      <label style={fieldStyle}>
        Assign to
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={inputStyle}>
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        Leave open for anyone to claim
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
        Require a photo to complete
      </label>

      <label style={fieldStyle}>
        Checklist steps (one per line, optional)
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit', fontWeight: 400 }} />
      </label>

      {error && <p style={{ color: '#c0392b', margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading} style={buttonStyle}>
        {loading ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

const fieldStyle: CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 };
const inputStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 400,
};
const buttonStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--brand)',
  background: 'var(--brand)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
};
