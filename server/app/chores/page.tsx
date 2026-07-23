import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listChores } from '@/lib/data/chores';
import { listUsers } from '@/lib/data/users';
import { describeSchedule } from '@/lib/domain/recurrence';
import { bucketForDate, type Bucket } from '@/lib/domain/dashboard';
import { AddChoreSection } from './add-chore-section';

export default async function ChoresPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const [chores, people] = await Promise.all([listChores(), listUsers()]);
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const isManager = user.role === 'manager' || user.role === 'admin';

  return (
    <main style={mainStyle}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Chores</h1>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8, marginTop: 16 }}>
        {chores.map((c) => {
          const bucket = bucketForDate(c.nextDue);
          return (
            <li key={c.id} style={rowStyle}>
              <span style={{ ...railStyle, background: railColor(bucket) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/chores/${c.id}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                  {c.name}
                </Link>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>
                  {describeSchedule(c.schedule)} ·{' '}
                  {c.assignedTo ? (nameById.get(c.assignedTo) ?? 'Unassigned') : c.open ? 'Open — up for grabs' : 'Unassigned'}
                  {c.requirePhoto ? ' · 📷' : ''}
                </p>
              </div>
            </li>
          );
        })}
        {!chores.length && <p style={{ color: 'var(--muted)' }}>No chores yet.</p>}
      </ul>

      {isManager && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16 }}>Add a chore</h2>
          <AddChoreSection people={people} />
        </section>
      )}
    </main>
  );
}

function railColor(b: Bucket): string {
  if (b === 'overdue') return '#c0392b';
  if (b === 'today') return '#b8860b';
  if (b === 'upcoming') return '#2f6f4f';
  return 'var(--border)';
}

const mainStyle: CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '24px 20px 48px' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--surface)',
};
const railStyle: CSSProperties = { width: 4, alignSelf: 'stretch', borderRadius: 4 };
