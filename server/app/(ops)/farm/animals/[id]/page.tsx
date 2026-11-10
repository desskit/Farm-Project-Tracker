import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { groupDetail, listGroups } from '@/lib/data/livestock';
import { listInventory } from '@/lib/data/inventory';
import { grazeableUnits, grazingAdvice } from '@/lib/data/land';
import { MoveGroupCard } from '../../land/[id]/unit-client';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';
import { SPECIES, type ProductKind } from '@/lib/domain/livestock';
import { addDays, fmtDate, todayISO } from '@/lib/domain/dates';
import { Banner } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { AnimalsCard, BreedingCard, CareCard, GroupSettings, HistoryCard, LogCard, ProductionCard } from './group-client';

export default async function GroupPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'animals.view')) notFound();
  const d = await groupDetail(params.id).catch((e) => {
    if (e instanceof DataError && e.status === 404) notFound();
    throw e;
  });
  const manage = can(user, 'animals.manage');
  const log = can(user, 'animals.log');
  const moves = can(user, 'land.log');
  const [supplies, groups, paddocks, advice] = await Promise.all([
    log ? listInventory() : Promise.resolve([]),
    manage ? listGroups() : Promise.resolve([]),
    moves ? grazeableUnits() : Promise.resolve([]),
    moves ? grazingAdvice() : Promise.resolve([]),
  ]);
  const { group, species } = d;
  const info = SPECIES[species];
  const today = todayISO();

  // The latest open withdrawal per product, so the warning shows one date for each.
  const latest = (k: 'meatUntil' | 'milkUntil') => d.events.map((e) => e[k]).filter((x): x is string => !!x && x > today).sort().pop();
  const meat = latest('meatUntil');
  const milk = latest('milkUntil');
  const products = info.products as readonly ProductKind[];
  const live = d.animals.filter((a) => a.status === 'active').map((a) => ({ id: a.id, label: a.name || `#${a.tag}`, sex: a.sex }));
  const openBreedings = d.breedings.filter((b) => b.status === 'bred' || b.status === 'confirmed').map((b) => ({ id: b.id, label: `${b.damName ?? 'Bred'} ${fmtDate(b.bredOn)}` }));

  return (
    <Screen
      title={group.name}
      subtitle={[info.label, `${group.headCount} head`, group.location, group.active ? '' : 'archived'].filter(Boolean).join(' · ')}
      back="/farm/animals"
      actions={manage ? <GroupSettings group={{ id: group.id, name: group.name, location: group.location, notes: group.notes, headCount: group.headCount, active: group.active }} /> : undefined}
    >
      {(meat || milk) && (
        <Banner tone="warn" title="Withdrawal in effect">
          {milk && <>Don’t use {products.includes('eggs') ? 'eggs' : 'milk'} until <strong>{fmtDate(milk)}</strong>. </>}
          {meat && <>No slaughter for meat until <strong>{fmtDate(meat)}</strong>.</>}
        </Banner>
      )}
      {group.notes && <p>{group.notes}</p>}

      {products.length > 0 && (
        <ProductionCard groupId={group.id} products={[...products]} daily={d.production} from={addDays(today, -29)} today={today} canLog={log} />
      )}

      {log && (
        <LogCard
          groupId={group.id}
          animals={live}
          supplies={supplies.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, meatDays: i.meatWithdrawalDays, milkDays: i.milkWithdrawalDays }))}
          breedings={openBreedings}
          canManage={manage}
          today={today}
        />
      )}

      {moves && paddocks.length > 0 && (
        <MoveGroupCard groupId={group.id} current={group.landUnitId} movedOn={group.movedOn} units={paddocks} today={today} advice={advice.find((a) => a.groupId === group.id) ?? null} />
      )}

      <CareCard groupId={group.id} groupName={group.name} species={species} chores={d.care} canAdd={can(user, 'work.manage')} />

      <AnimalsCard
        groupId={group.id}
        animals={d.animals}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        canManage={manage}
      />

      {info.gestationDays != null && (manage || d.breedings.length > 0) && (
        <BreedingCard groupId={group.id} breedings={d.breedings} dams={live.filter((a) => a.sex !== 'male')} canManage={manage} gestationDays={info.gestationDays} today={today} />
      )}

      <HistoryCard events={d.events} canManage={manage} />
    </Screen>
  );
}
