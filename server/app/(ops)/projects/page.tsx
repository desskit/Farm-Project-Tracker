import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listProjectsWithProgress, STATUS_LABELS, type ProjectWithProgress } from '@/lib/data/projects';
import { fmtDate } from '@/lib/domain/dates';
import { spentByProject } from '@/lib/data/project-expenses';
import { can } from '@/lib/domain/permissions';
import { workSections } from '@/lib/domain/nav';
import { WorkTabs } from '@/components/shell/work-tabs';
import { Card, EmptyState, PageHeader, StatusPill, type Tone } from '@/components/ui';
import { AddProjectCard } from './add-project-card';
import s from './projects.module.css';

const TONE: Record<string, Tone> = { idea: 'neutral', planned: 'info', in_progress: 'today', on_hold: 'neutral', done: 'done' };
const money = (n: number) => `$${n.toFixed(0)}`;

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const canCreate = can(user, 'work.manage');
  const projects = await listProjectsWithProgress(user);
  const seesMoney = can(user, 'finance.view');
  const spent: Record<string, number> = seesMoney ? await spentByProject(projects.map((p) => p.id)) : {};
  const active = projects.filter((p) => p.status !== 'done');
  const done = projects.filter((p) => p.status === 'done');

  const card = (p: ProjectWithProgress) => {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    const over = seesMoney && p.budget != null && p.budget > 0 && (spent[p.id] ?? 0) > p.budget;
    return (
      <Link href={`/projects/${p.id}`} className={s.project} key={p.id}>
        <span className={s.head}>
          <strong className={s.name}>{p.name}</strong>
          <StatusPill tone={TONE[p.status] ?? 'neutral'}>{STATUS_LABELS[p.status]}</StatusPill>
        </span>
        <span className={s.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of tasks done`}>
          <span className={s.fill} style={{ width: `${pct}%` }} />
        </span>
        <span className={s.meta}>
          {p.done} of {p.total} tasks
          {p.targetDate ? ` · target ${fmtDate(p.targetDate)}` : ''}
          {seesMoney && p.budget != null && p.budget > 0 && (
            <span className={over ? s.over : undefined}> · {money(spent[p.id] ?? 0)} of {money(p.budget)}</span>
          )}
          {seesMoney && (p.budget == null || p.budget <= 0) && (spent[p.id] ?? 0) > 0 && ` · ${money(spent[p.id])} spent`}
        </span>
      </Link>
    );
  };

  return (
    <main className={s.wrap}>
      <WorkTabs sections={workSections(user)} />
      <PageHeader
        title="Projects"
        subtitle={canCreate ? 'Bigger jobs, broken into tasks' : 'Projects you have tasks on'}
      />
      {active.length === 0 && done.length === 0 ? (
        <Card>
          <EmptyState title="No projects yet">{canCreate ? 'Start one below.' : 'Projects with tasks for you will show up here.'}</EmptyState>
        </Card>
      ) : (
        <div className={s.grid}>{active.map(card)}</div>
      )}
      {done.length > 0 && (
        <details className={s.done}>
          <summary>Finished ({done.length})</summary>
          <div className={s.grid}>{done.map(card)}</div>
        </details>
      )}
      {canCreate && (
        <section id="new" className={s.add}>
          <h2 className={s.h2}>New project</h2>
          <AddProjectCard />
        </section>
      )}
    </main>
  );
}
