'use client';
import { useState, type FormEvent } from 'react';
import type { PersonRow } from '@/lib/data/users';
import type { ChoreRow } from '@/lib/data/chores';
import { AssigneePicker } from '@/app/_components/assignee-picker';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Seasons are stored as "MM-DD" so they repeat every year, independent of date. */
function monthDayValue(md: string): { month: number; day: number } {
  const [m, d] = md.split('-');
  return { month: Number(m) || 1, day: Number(d) || 1 };
}
function monthDayString(month: number, day: number): string {
  const maxDay = new Date(2024, month, 0).getDate(); // 2024 is a leap year, so Feb 29 stays valid
  return `${String(month).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`;
}

/** A month + day pair for one end of a season window. */
function MonthDayPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { month, day } = monthDayValue(value);
  const daysInMonth = new Date(2024, month, 0).getDate();
  return (
    <div className="md-picker">
      <select value={month} onChange={(e) => onChange(monthDayString(Number(e.target.value), day))}>
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select value={Math.min(day, daysInMonth)} onChange={(e) => onChange(monthDayString(month, Number(e.target.value)))}>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
type ScheduleType = 'once' | 'daily' | 'everyNDays' | 'weekly' | 'monthly';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type ChorePayload = {
  name: string;
  schedule: { type: ScheduleType; n?: number; weekdays?: number[]; day?: number; season?: { start: string; end: string } };
  catchUp: 'mustCatchUp' | 'skipToNext';
  assigneeIds: string[];
  nextDue?: string;
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
  const [dueDate, setDueDate] = useState(initial?.nextDue ?? todayLocal());
  const [catchUp, setCatchUp] = useState<'mustCatchUp' | 'skipToNext'>(initial?.catchUp ?? 'skipToNext');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? []);
  const [open, setOpen] = useState(initial?.open ?? false);
  const [requirePhoto, setRequirePhoto] = useState(initial?.requirePhoto ?? false);
  const [steps, setSteps] = useState((initial?.steps ?? []).join('\n'));
  const [seasonal, setSeasonal] = useState(!!initSchedule?.season);
  const [seasonStart, setSeasonStart] = useState(initSchedule?.season?.start ?? '04-01');
  const [seasonEnd, setSeasonEnd] = useState(initSchedule?.season?.end ?? '10-31');
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
    // A one-time chore has a single fixed date, so a repeating season is meaningless.
    if (seasonal && scheduleType !== 'once') schedule.season = { start: seasonStart, end: seasonEnd };

    const err = await onSubmit({
      name,
      schedule,
      catchUp,
      assigneeIds,
      nextDue: scheduleType === 'once' ? dueDate : undefined,
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
      setAssigneeIds([]);
    }
  }

  return (
    <form onSubmit={onFormSubmit}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Collect eggs" />
      </div>

      <div className="field">
        <label>Schedule</label>
        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as ScheduleType)}>
          <option value="once">One-time (no repeat)</option>
          <option value="daily">Every day</option>
          <option value="everyNDays">Every N days</option>
          <option value="weekly">Specific weekdays</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {scheduleType === 'once' && (
        <div className="field">
          <label>Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
      )}

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

      {scheduleType !== 'once' && (
        <>
          <label className="inline-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} />
            Only during part of the year
          </label>
          {seasonal && (
            <div className="field">
              <label>Active season</label>
              <div className="season-row">
                <MonthDayPicker value={seasonStart} onChange={setSeasonStart} />
                <span className="season-sep">to</span>
                <MonthDayPicker value={seasonEnd} onChange={setSeasonEnd} />
              </div>
              <p className="subtle" style={{ margin: '6px 0 0' }}>
                {seasonStart <= seasonEnd
                  ? 'Outside this window the chore skips ahead to next season.'
                  : 'This window wraps the new year — that works fine.'}
              </p>
            </div>
          )}
        </>
      )}

      {scheduleType !== 'once' && (
        <div className="field">
          <label>If missed</label>
          <select value={catchUp} onChange={(e) => setCatchUp(e.target.value as typeof catchUp)}>
            <option value="skipToNext">Skip to next occurrence</option>
            <option value="mustCatchUp">Must catch up (stays overdue)</option>
          </select>
        </div>
      )}

      <AssigneePicker people={people} value={assigneeIds} onChange={setAssigneeIds} />

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
