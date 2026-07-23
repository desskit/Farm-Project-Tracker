'use client';
import { useState, type FormEvent } from 'react';
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
  onCancel,
  onSubmit,
}: {
  people: PersonRow[];
  initial?: ChoreRow;
  submitLabel: string;
  onCancel?: () => void;
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
    <form onSubmit={onFormSubmit}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Collect eggs" />
      </div>

      <div className="field">
        <label>Repeats</label>
        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as ScheduleType)}>
          <option value="daily">Every day</option>
          <option value="everyNDays">Every N days</option>
          <option value="weekly">Specific weekdays</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {scheduleType === 'everyNDays' && (
        <div className="field">
          <label>Every how many days?</label>
          <input type="number" min={1} value={n} onChange={(e) => setN(Number(e.target.value))} />
        </div>
      )}

      {scheduleType === 'weekly' && (
        <div className="field">
          <label>Which days?</label>
          <div className="weekday-row">
            {WEEKDAY_LABELS.map((label, i) => (
              <label key={i}>
                <input type="checkbox" checked={weekdays.includes(i)} onChange={() => toggleWeekday(i)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {scheduleType === 'monthly' && (
        <div className="field">
          <label>Day of month</label>
          <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value))} />
        </div>
      )}

      <div className="field">
        <label>If missed</label>
        <select value={catchUp} onChange={(e) => setCatchUp(e.target.value as typeof catchUp)}>
          <option value="skipToNext">Skip to next occurrence</option>
          <option value="mustCatchUp">Must catch up (stays overdue)</option>
        </select>
      </div>

      <div className="field">
        <label>Assign to</label>
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <label className="inline-check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        Leave open for anyone to claim
      </label>
      <label className="inline-check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
        Require a photo to complete
      </label>

      <div className="field">
        <label>Checklist steps (one per line, optional)</label>
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={3} placeholder="Lock the coop&#10;Water off&#10;Lights out" />
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading} className="btn primary">
          {loading ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
