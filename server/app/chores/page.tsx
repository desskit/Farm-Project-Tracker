import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listChores } from '@/lib/data/chores';
import { listUsers } from '@/lib/data/users';
import { describeSchedule } from '@/lib/domain/recurrence';
import { bucketForDate } from '@/lib/domain/dashboard';
import { AddChoreCard } from './add-chore-card';

export default async function ChoresPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const [chores, people] = await Promise.all([listChores(), listUsers()]);
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const isManager = user.role === 'manager' || user.role === 'admin';

  return (
    <main className="view">
      <div className="view-head">
        <h1>Chores</h1>
      </div>

      {!chores.length ? (
        <div className="empty">No chores yet.</div>
      ) : (
        chores.map((c) => {
          const rail = bucketForDate(c.nextDue);
          const railClass = rail === 'overdue' ? 'overdue' : rail === 'today' ? 'today' : rail === 'upcoming' ? 'upcoming' : '';
          return (
            <Link href={`/chores/${c.id}`} className="card tap" key={c.id}>
              <div className="item">
                <span className={`left-rail ${railClass}`} />
                <div className="item-main">
                  <p className="item-title">{c.name}</p>
                  <p className="item-sub">
                    {describeSchedule(c.schedule)} ·{' '}
                    {c.assignedTo
                      ? (nameById.get(c.assignedTo) ?? 'Unassigned')
                      : c.open
                        ? 'Open — up for grabs'
                        : 'Unassigned'}
                  </p>
                  {(c.requirePhoto || c.open || c.steps.length > 0 || c.sentBack) && (
                    <div className="item-badges">
                      {c.sentBack && <span className="badge overdue">↩ redo</span>}
                      {c.open && !c.assignedTo && <span className="chip">🙌 open</span>}
                      {c.requirePhoto && <span className="chip">📷 proof</span>}
                      {c.steps.length > 0 && <span className="chip">☑ {c.steps.length} steps</span>}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })
      )}

      {isManager && (
        <>
          <div className="section-title">Add a chore</div>
          <AddChoreCard people={people} />
        </>
      )}
    </main>
  );
}
