'use client';
import type { PersonRow } from '@/lib/data/users';

/**
 * Picks the people on a chore or task. A multi-select `<select>` is close to
 * unusable on a phone, so this is a row of tappable chips instead — the same
 * shape the weekday picker already uses.
 *
 * Deactivated people are hidden unless they're still on the item, so an
 * existing assignment stays visible (and removable) after someone leaves.
 */
export function AssigneePicker({
  people,
  value,
  onChange,
  label = 'Assign to',
}: {
  people: PersonRow[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const shown = people.filter((p) => p.active || value.includes(p.id));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div className="field">
      <label>
        {label}
        {value.length > 1 && <span className="count-pill">{value.length}</span>}
      </label>
      {shown.length === 0 ? (
        <p className="subtle" style={{ margin: 0 }}>
          No people to assign yet.
        </p>
      ) : (
        <div className="weekday-row">
          {shown.map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
              {p.active ? '' : ' (deactivated)'}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How a set of assignees reads in a list row: one name, two joined by "&", and
 * beyond that a lead name plus a count so the line stays short on a phone.
 */
export function assigneeLabel(ids: string[], nameById: Map<string, string>): string {
  const names = ids.map((id) => nameById.get(id)).filter((n): n is string => !!n);
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}
