import { notFound } from 'next/navigation';
import { Sprout, Wheat } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { landAlerts, listUnits } from '@/lib/data/land';
import { can } from '@/lib/domain/permissions';
import { LAND_KINDS } from '@/lib/domain/garden';
import { relativeLabel } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { NewUnitButton } from './land-client';
import { KIND_ICON, unitMeta, unitPills } from './land-ui';

export const metadata = { title: 'Land · Farm Project Tracker' };

export default async function LandPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'land.view')) notFound();
  const [units, alerts] = await Promise.all([listUnits(), landAlerts()]);
  const top = units.filter((u) => !u.parentId).sort((a, b) => a.name.localeCompare(b.name));
  const kids = (id: string) => units.filter((u) => u.parentId === id);
  const ready = units.filter((u) => u.grazing?.state === 'ready').length;

  const tiles: Tile[] = [
    { label: 'Ready to harvest', value: alerts.ready.length, tone: alerts.ready.length ? 'good' : undefined },
    { label: 'To sow this week', value: alerts.toSow.length },
  ];
  if (alerts.sprays.length) tiles.push({ label: 'Spray waits', value: alerts.sprays.length, tone: 'warn' });
  if (units.some((u) => u.grazing)) tiles.push({ label: 'Paddocks ready', value: ready, tone: ready ? 'good' : undefined });

  return (
    <Screen title="Land" subtitle="Garden, orchard, pasture and fields" back="/farm" actions={can(user, 'land.manage') ? <NewUnitButton parents={top.filter((u) => LAND_KINDS[u.kind].child).map((u) => ({ id: u.id, name: u.name, kind: u.kind }))} /> : undefined}>
      {units.length > 0 && <StatTiles tiles={tiles} />}

      {(alerts.ready.length > 0 || alerts.toSow.length > 0) && (
        <Card title="This week" flush>
          {alerts.ready.map((p) => (
            <ListRow key={p.id} href={`/farm/land/${p.unitId}`} lead={<Wheat />} title={`${p.crop}${p.variety ? ` (${p.variety})` : ''} — ${p.unitName}`} meta={`Ready ${relativeLabel(p.ready)}`} />
          ))}
          {alerts.toSow.map((p) => (
            <ListRow key={p.id} href={`/farm/land/${p.unitId}`} lead={<Sprout />} title={`Sow ${p.crop} — ${p.unitName}`} meta={relativeLabel(p.sownOn)} />
          ))}
        </Card>
      )}

      <Card flush>
        {top.length === 0 ? (
          <EmptyState icon={<Sprout />} title="No land laid out yet">
            {can(user, 'land.manage') ? 'Add the garden (then its beds), the pasture (then its paddocks), the orchard or a field.' : 'A manager can lay out the garden and pastures.'}
          </EmptyState>
        ) : (
          top.map((u) => (
            <ListRow key={u.id} href={`/farm/land/${u.id}`} lead={KIND_ICON[u.kind]} title={u.name} meta={unitMeta(u, kids(u.id))} trail={unitPills(u)} />
          ))
        )}
      </Card>
    </Screen>
  );
}
