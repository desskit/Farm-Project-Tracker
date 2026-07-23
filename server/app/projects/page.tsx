import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listProjectsWithProgress, STATUS_LABELS } from '@/lib/data/projects';
import { fmtDate } from '@/lib/domain/dates';
import { AddProjectCard } from './add-project-card';

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const canCreate = user.role === 'manager' || user.role === 'admin';
  const projects = await listProjectsWithProgress();

  return (
    <main className="view">
      <div className="view-head">
        <h1>Projects</h1>
      </div>

      {!canCreate && (
        <div className="notice">
          You&apos;re signed in as a <strong>worker</strong>. Only managers and admins can create projects — you can
          still work project tasks.
        </div>
      )}

      {!projects.length ? (
        <div className="empty">No projects yet.</div>
      ) : (
        projects.map((p) => {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <Link href={`/projects/${p.id}`} className="card tap" key={p.id}>
              <p className="item-title">{p.name}</p>
              <p className="item-sub">
                {STATUS_LABELS[p.status]}
                {p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ''}
              </p>
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="subtle" style={{ margin: 0 }}>
                {p.done} / {p.total} tasks done
              </p>
            </Link>
          );
        })
      )}

      {canCreate && (
        <>
          <div className="section-title">New project</div>
          <AddProjectCard />
        </>
      )}
    </main>
  );
}
