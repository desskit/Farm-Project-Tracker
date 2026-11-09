import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { teamOverview } from '@/lib/data/team';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';
import { AvatarStack, Card, EmptyState, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import s from '@/components/patterns/patterns.module.css';

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'team.view')) notFound();
  const { tiles, people } = await teamOverview();

  return (
    <Screen title="Team" subtitle="Who's on what across the farm" back="/more">
      <StatTiles
        tiles={[
          { label: 'Overdue', value: tiles.overdue, tone: tiles.overdue ? 'bad' : 'good', href: '/?scope=all' },
          { label: 'Due today', value: tiles.today, tone: tiles.today ? 'warn' : 'good' },
          { label: 'Next 7 days', value: tiles.upcoming },
        ]}
      />
      <Card title="People" flush>
        {people.length === 0 ? (
          <EmptyState title="No one on the team yet" />
        ) : (
          people.map((w) => {
            const overdue = w.choresOverdue + w.tasksOverdue;
            return (
              <ListRow
                key={w.userId}
                href={`/people/${w.userId}`}
                lead={<AvatarStack names={[w.name]} />}
                title={w.name}
                meta={
                  <span className={s.rowsMeta}>
                    {ROLE_LABEL[w.role]}
                    {w.tasksOpen > 0 && <span>· {w.tasksOpen} open task{w.tasksOpen === 1 ? '' : 's'}</span>}
                  </span>
                }
                trail={
                  overdue ? <StatusPill tone="overdue">{overdue} overdue</StatusPill>
                  : w.choresToday ? <StatusPill tone="today">{w.choresToday} today</StatusPill>
                  : <StatusPill tone="done">All clear</StatusPill>
                }
              />
            );
          })
        )}
      </Card>
    </Screen>
  );
}
