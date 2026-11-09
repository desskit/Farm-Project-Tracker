import { notFound } from 'next/navigation';
import { Baby, PawPrint } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listGroups, livestockAlerts } from '@/lib/data/livestock';
import { can } from '@/lib/domain/permissions';
import { SPECIES, isSpecies, type ProductKind } from '@/lib/domain/livestock';
import { fmtDate } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { NewGroupButton, ProductionQuickLog } from './animals-client';
import s from './animals.module.css';

export const metadata = { title: 'Animals · Farm Project Tracker' };

export default async function AnimalsPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'animals.view')) notFound();
  const [groups, alerts] = await Promise.all([listGroups(), livestockAlerts()]);
  const head = groups.reduce((n, g) => n + g.headCount, 0);
  const withholding = groups.filter((g) => g.withholdUntil.meat || g.withholdUntil.milk).length;

  const tiles: Tile[] = [{ label: 'Head', value: head }];
  if (alerts.eggs) {
    tiles.push({ label: 'Eggs today', value: alerts.eggs.today });
    tiles.push({
      label: alerts.eggs.pct == null ? 'Eggs this week' : `Eggs this week (${alerts.eggs.pct >= 0 ? '+' : ''}${alerts.eggs.pct}%)`,
      value: alerts.eggs.thisWeek,
      tone: alerts.eggs.pct != null && alerts.eggs.pct <= -20 ? 'warn' : undefined,
    });
  }
  if (withholding) tiles.push({ label: 'Withholding', value: withholding, tone: 'warn' });

  // One quick-log line per group and product it gives (eggs from the layers, milk from the does…).
  const producers = groups.flatMap((g) =>
    (isSpecies(g.species) ? (SPECIES[g.species].products as readonly ProductKind[]) : []).map((kind) => ({
      groupId: g.id, name: g.name, kind, today: g.production.find((p) => p.kind === kind)?.today ?? 0,
    })),
  );

  return (
    <Screen title="Animals" subtitle="Herds, flocks and what they give" back="/farm" actions={can(user, 'animals.manage') ? <NewGroupButton /> : undefined}>
      {groups.length > 0 && <StatTiles tiles={tiles} />}
      {can(user, 'animals.log') && producers.length > 0 && <ProductionQuickLog lines={producers} />}

      {alerts.births.length > 0 && (
        <Card title="Births coming up" flush>
          {alerts.births.map((b) => (
            <ListRow key={b.id} href={`/farm/animals/${b.groupId}`} lead={<Baby />} title={b.dam ? `${b.dam} (${b.groupName})` : b.groupName} meta={`Due around ${fmtDate(b.dueOn)}`} />
          ))}
        </Card>
      )}

      <Card flush>
        {groups.length === 0 ? (
          <EmptyState icon={<PawPrint />} title="No animals yet">
            {can(user, 'animals.manage') ? 'Add a flock, herd or pen — even a single horse is a group of one.' : 'A manager can add the farm’s animals.'}
          </EmptyState>
        ) : (
          groups.map((g) => (
            <ListRow
              key={g.id}
              href={`/farm/animals/${g.id}`}
              lead={<PawPrint />}
              title={g.name}
              meta={[g.speciesLabel, `${g.headCount} head`, g.location].filter(Boolean).join(' · ')}
              trail={
                <span className={s.pills}>
                  {(g.withholdUntil.milk || g.withholdUntil.meat) && <StatusPill tone="today">Withholding</StatusPill>}
                  {g.nextDue && <StatusPill tone="upcoming">Due {fmtDate(g.nextDue)}</StatusPill>}
                </span>
              }
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
