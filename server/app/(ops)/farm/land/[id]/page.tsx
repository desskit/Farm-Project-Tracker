import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { unitDetail } from '@/lib/data/land';
import { listGroups } from '@/lib/data/livestock';
import { listInventory } from '@/lib/data/inventory';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';
import { LAND_KINDS } from '@/lib/domain/garden';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Banner, Card, ListRow } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { NewUnitButton } from '../land-client';
import { KIND_ICON, unitMeta, unitPills } from '../land-ui';
import { EditUnit, FieldWorkCard, GrazingCard, HarvestCard, PerennialsCard, PlantingsCard } from './unit-client';

export default async function UnitPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'land.view')) notFound();
  const d = await unitDetail(params.id).catch((e) => {
    if (e instanceof DataError && e.status === 404) notFound();
    throw e;
  });
  const { unit } = d;
  const k = unit.kind;
  const log = can(user, 'land.log');
  const manage = can(user, 'land.manage');
  const today = todayISO();
  const grows = k === 'garden' || k === 'bed' || k === 'field' || k === 'other';
  const trees = k === 'orchard' || k === 'garden' || k === 'bed' || k === 'other';
  const grazes = k === 'pasture' || k === 'paddock' || k === 'field' || k === 'other';
  const [supplies, groups] = await Promise.all([
    log ? listInventory() : Promise.resolve([]),
    grazes && log && can(user, 'animals.view') ? listGroups() : Promise.resolve([]),
  ]);
  const sup = supplies.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty }));
  const childKind = LAND_KINDS[k].child;

  return (
    <Screen
      title={unit.name}
      subtitle={[LAND_KINDS[k].label, unit.area ? `${unit.area} ${unit.areaUnit === 'acre' ? 'ac' : 'sq ft'}` : '', d.parent ? `in ${d.parent.name}` : '', unit.active ? '' : 'archived'].filter(Boolean).join(' · ')}
      back={d.parent ? `/farm/land/${d.parent.id}` : '/farm/land'}
      actions={manage ? <EditUnit unit={{ id: unit.id, name: unit.name, area: unit.area, restDays: unit.restDays, notes: unit.notes, active: unit.active, grazes }} /> : undefined}
    >
      {unit.phiUntil && (
        <Banner tone="warn" title="Pre-harvest interval">Sprayed — nothing harvested here before <strong>{fmtDate(unit.phiUntil)}</strong>.</Banner>
      )}
      {unit.notes && <p>{unit.notes}</p>}

      {childKind && (
        <Card
          title={`${childKind === 'bed' ? 'Beds' : 'Paddocks'} (${d.children.length})`}
          action={manage ? <NewUnitButton parent={{ id: unit.id, name: unit.name, kind: k }} label="Add" /> : undefined}
          flush
        >
          {d.children.length === 0 ? (
            <ListRow title={`No ${childKind}s yet`} meta={manage ? `Add them and track each ${childKind} on its own.` : undefined} />
          ) : (
            d.children.map((c) => <ListRow key={c.id} href={`/farm/land/${c.id}`} lead={KIND_ICON[c.kind]} title={c.name} meta={unitMeta(c, [])} trail={unitPills(c)} />)
          )}
        </Card>
      )}

      {grazes && (k !== 'pasture' || d.children.length === 0) && (
        <GrazingCard
          unitId={unit.id}
          grazing={unit.grazing}
          restDays={unit.restDays}
          here={unit.groupsHere}
          groups={groups.filter((g) => g.landUnitId !== unit.id).map((g) => ({ id: g.id, name: g.name }))}
          moves={d.moves}
          canLog={log && can(user, 'animals.view')}
          today={today}
        />
      )}

      {grows && <PlantingsCard unitId={unit.id} plantings={d.plantings} supplies={sup} canLog={log} canManage={manage} today={today} />}
      {trees && (manage || d.perennials.length > 0) && <PerennialsCard unitId={unit.id} perennials={d.perennials} canManage={manage} />}
      {(grows || trees) && (
        <HarvestCard
          unitId={unit.id}
          harvests={d.harvests}
          season={d.season}
          plantings={d.plantings.filter((p) => p.status === 'growing').map((p) => ({ id: p.id, label: `${p.crop}${p.variety ? ` (${p.variety})` : ''} · ${fmtDate(p.sownOn)}` }))}
          perennials={d.perennials.filter((p) => p.active).map((p) => ({ id: p.id, label: `${p.crop}${p.variety ? ` (${p.variety})` : ''}` }))}
          canLog={log}
          canManage={manage}
          blockedUntil={unit.phiUntil}
          today={today}
        />
      )}
      <FieldWorkCard unitId={unit.id} events={d.events} supplies={sup} canLog={log} canManage={manage} today={today} />
    </Screen>
  );
}
