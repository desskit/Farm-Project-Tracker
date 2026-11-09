import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, Repeat, UserCog } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth/session';
import { listChores } from '@/lib/data/chores';
import { taskAssigneeIdsFor } from '@/lib/data/assignees';
import { listActivity } from '@/lib/data/activity';
import { timeReport } from '@/lib/data/time-report';
import { projectTasks, projects } from '@/db/schema';
import { can, ROLE_BLURB, ROLE_LABEL } from '@/lib/domain/permissions';
import { addDays, fmtDur, relativeLabel, todayISO } from '@/lib/domain/dates';
import { bucketForDate } from '@/lib/domain/dashboard';
import { AvatarStack, ButtonLink, Card, EmptyState, ListRow, StatusPill, type Tone } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import s from '@/components/patterns/patterns.module.css';

const TONE: Record<string, Tone> = { overdue: 'overdue', today: 'today', upcoming: 'upcoming', later: 'neutral' };

/** One person at a glance, for people with the team view: what they're on, hours, recent work. */
export default async function PersonPage({ params }: { params: { id: string } }) {
  const viewer = await getSessionUser();
  if (!viewer || !can(viewer, 'team.view')) notFound();
  const person = (await db.select().from(users).where(eq(users.id, params.id)).limit(1))[0];
  if (!person) notFound();

  const today = todayISO();
  const [chores, tasks, names, hours, acts] = await Promise.all([
    listChores(viewer),
    db.select().from(projectTasks).where(eq(projectTasks.done, false)),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    timeReport(addDays(today, -29), today, person.id),
    listActivity(viewer, 15, person.id),
  ]);
  const myChores = chores.filter((c) => c.assigneeIds.includes(person.id));
  const on = await taskAssigneeIdsFor(tasks.map((t) => t.id));
  const myTasks = tasks.filter((t) => (on[t.id] ?? []).includes(person.id));
  const projectName = new Map(names.map((p) => [p.id, p.name]));
  const overdue = [...myChores.map((c) => c.nextDue), ...myTasks.map((t) => t.dueDate)].filter((d) => d && bucketForDate(d) === 'overdue').length;

  return (
    <Screen
      title={person.name}
      subtitle={`${ROLE_LABEL[person.role]}${person.active ? '' : ' · deactivated'} — ${ROLE_BLURB[person.role]}`}
      back="/more/team"
      actions={can(viewer, 'people.manage') ? <ButtonLink href="/people" size="sm" variant="ghost" icon={<UserCog />}>Manage</ButtonLink> : <AvatarStack names={[person.name]} />}
    >
      <StatTiles
        tiles={[
          { label: 'overdue', value: overdue, tone: overdue ? 'bad' : 'good' },
          { label: 'chores', value: myChores.length },
          { label: 'open tasks', value: myTasks.length },
          { label: 'hours, 30 days', value: fmtDur(hours.totalSeconds) },
        ]}
      />
      <Card title="What they're on" flush>
        {!myChores.length && !myTasks.length ? (
          <EmptyState title="Nothing assigned right now" />
        ) : (
          <>
            {myChores.map((c) => (
              <ListRow key={c.id} href={`/chores/${c.id}`} lead={<Repeat />} title={c.name} trail={<StatusPill tone={TONE[bucketForDate(c.nextDue)]}>{relativeLabel(c.nextDue)}</StatusPill>} />
            ))}
            {myTasks.map((t) => (
              <ListRow
                key={t.id}
                href={`/projects/${t.projectId}`}
                lead={<ClipboardList />}
                title={t.title}
                meta={projectName.get(t.projectId)}
                trail={t.dueDate ? <StatusPill tone={TONE[bucketForDate(t.dueDate)]}>{relativeLabel(t.dueDate)}</StatusPill> : undefined}
              />
            ))}
          </>
        )}
      </Card>
      <Card title="Recent activity" flush action={<Link href={`/more/activity?person=${person.id}`} className={s.chip}>All</Link>}>
        {!acts.length ? (
          <EmptyState title="Nothing recent" />
        ) : (
          acts.map((a) => (
            <div className={s.kv} key={a.id}>
              <span className={s.kvLabel}>{a.href ? <Link href={a.href}>{a.text}</Link> : a.text}</span>
              <span className={s.tileLbl}>{new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          ))
        )}
      </Card>
    </Screen>
  );
}
