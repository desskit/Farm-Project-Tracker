import Link from 'next/link';
import { Camera, CheckSquare, Moon, Repeat, Undo2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listChores, type ChoreRow } from '@/lib/data/chores';
import { listUsers } from '@/lib/data/users';
import { describeSchedule, isActiveSeason } from '@/lib/domain/recurrence';
import { bucketForDate } from '@/lib/domain/dashboard';
import { relativeLabel, todayISO } from '@/lib/domain/dates';
import { assigneeLabel } from '@/app/_components/assignee-picker';
import { can } from '@/lib/domain/permissions';
import { workSections } from '@/lib/domain/nav';
import { WorkTabs } from '@/components/shell/work-tabs';
import { Card, EmptyState, ListRow, PageHeader, StatusPill, type Tone } from '@/components/ui';
import { ClaimButton, DoneButton } from '@/components/patterns/work-buttons';
import { AddChoreCard } from './add-chore-card';
import s from './chores.module.css';

type Filter = 'mine' | 'open' | 'all';
const TONE: Record<string, Tone> = { overdue: 'overdue', today: 'today', upcoming: 'upcoming', later: 'neutral' };

export default async function ChoresPage({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const [chores, people] = await Promise.all([listChores(user), listUsers()]);
  const today = todayISO();
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const isManager = can(user, 'work.manage');
  const canClaim = can(user, 'work.claim');

  const mine = chores.filter((c) => c.assigneeIds.includes(user.id));
  const open = chores.filter((c) => c.open && !c.assigneeIds.includes(user.id));
  const requested = (searchParams.show ?? '') as Filter;
  const filter: Filter = ['mine', 'open', 'all'].includes(requested) ? requested : mine.length ? 'mine' : 'all';
  const shown = filter === 'mine' ? mine : filter === 'open' ? open : chores;

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: 'mine', label: 'Mine', n: mine.length },
    ...(canClaim ? [{ key: 'open' as const, label: 'Up for grabs', n: open.length }] : []),
    { key: 'all', label: 'All', n: chores.length },
  ];

  return (
    <main className={s.wrap}>
      <WorkTabs sections={workSections(user)} />
      <PageHeader title="Chores" subtitle="Everything that repeats, and one-off jobs" />

      <nav className={s.filters} aria-label="Show">
        {tabs.map((t) => (
          <Link key={t.key} href={`/chores?show=${t.key}`} className={`${s.filter} ${filter === t.key ? s.on : ''}`} aria-current={filter === t.key ? 'page' : undefined}>
            {t.label} <span className={s.n}>{t.n}</span>
          </Link>
        ))}
      </nav>

      <Card flush>
        {shown.length === 0 ? (
          <EmptyState icon={<Repeat />} title={filter === 'open' ? 'Nothing up for grabs' : filter === 'mine' ? 'Nothing assigned to you' : 'No chores yet'}>
            {filter === 'mine' && canClaim ? 'Open work is under “Up for grabs”.' : undefined}
          </EmptyState>
        ) : (
          shown.map((c) => <ChoreRowItem key={c.id} c={c} me={user.id} canClaim={canClaim} today={today} who={assigneeLabel(c.assigneeIds, nameById)} />)
        )}
      </Card>

      {isManager && (
        <section id="new" className={s.add}>
          <h2 className={s.h2}>Add a chore</h2>
          <AddChoreCard people={people} />
        </section>
      )}
    </main>
  );
}

function ChoreRowItem({ c, me, canClaim, today, who }: { c: ChoreRow; me: string; canClaim: boolean; today: string; who: string }) {
  const bucket = bucketForDate(c.nextDue);
  const sleeping = c.schedule.season && !isActiveSeason(c.schedule.season, today);
  const gated = c.requirePhoto || c.steps.length > 0;
  const onIt = c.assigneeIds.includes(me);
  const action = onIt && !gated && !sleeping && bucket !== 'later' ? (
    <DoneButton choreId={c.id} label={c.name} />
  ) : c.open && !onIt && canClaim ? (
    <ClaimButton kind="chore" id={c.id} label={c.name} />
  ) : undefined;

  return (
    <ListRow
      lead={<Repeat />}
      // With an action button the row itself is not a link, so the name is.
      title={action ? <Link href={`/chores/${c.id}`} className={s.link}>{c.name}</Link> : c.name}
      meta={
        <span className={s.meta}>
          {sleeping ? <StatusPill tone="neutral">Out of season</StatusPill> : <StatusPill tone={TONE[bucket]}>{relativeLabel(c.nextDue)}</StatusPill>}
          <span>{describeSchedule(c.schedule)} · {who || (c.open ? 'Up for grabs' : 'Unassigned')}</span>
          {c.sentBack && <span className={s.flag}><Undo2 aria-hidden /> redo</span>}
          {c.requirePhoto && <span className={s.flag}><Camera aria-hidden /> photo</span>}
          {c.steps.length > 0 && <span className={s.flag}><CheckSquare aria-hidden /> {c.steps.length} steps</span>}
          {sleeping && <span className={s.flag}><Moon aria-hidden /></span>}
        </span>
      }
      trail={action}
      href={action ? undefined : `/chores/${c.id}`}
    />
  );
}
