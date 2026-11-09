import { notFound } from 'next/navigation';
import { Package, PawPrint, Sprout, Tractor, Wrench } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { lowStockItems } from '@/lib/data/inventory';
import { listGroups } from '@/lib/data/livestock';
import { landAlerts } from '@/lib/data/land';
import { can } from '@/lib/domain/permissions';
import { Card, ListRow, PageHeader, StatusPill } from '@/components/ui';
import s from './farm.module.css';

export const metadata = { title: 'Farm · Farm Project Tracker' };

/** The farm's things (as opposed to its work): supplies, equipment, and later animals and land. */
export default async function FarmPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const low = can(user, 'supplies.use') ? (await lowStockItems()).length : 0;
  const herds = can(user, 'animals.view') ? await listGroups() : null;
  const head = herds?.reduce((n, g) => n + g.headCount, 0) ?? 0;
  const land = can(user, 'land.view') ? await landAlerts() : null;

  return (
    <main className={s.wrap}>
      <PageHeader title="Farm" subtitle="Animals, land, supplies and equipment" />
      <Card flush>
        {herds && (
          <ListRow
            href="/farm/animals"
            lead={<PawPrint />}
            title="Animals"
            meta={herds.length ? `${head} head in ${herds.length} ${herds.length === 1 ? 'group' : 'groups'}` : 'Herds, flocks, eggs and health'}
          />
        )}
        {land && (
          <ListRow
            href="/farm/land"
            lead={<Sprout />}
            title="Land"
            meta="Garden, orchard, pasture and fields"
            trail={land.ready.length > 0 ? <StatusPill tone="done">{land.ready.length} ready</StatusPill> : undefined}
          />
        )}
        {can(user, 'supplies.use') && (
          <ListRow
            href="/more/supplies"
            lead={<Package />}
            title="Supplies"
            meta="Feed, fuel, seed and parts"
            trail={low > 0 ? <StatusPill tone="today">{low} low</StatusPill> : undefined}
          />
        )}
        <ListRow href="/more/assets" lead={<Tractor />} title="Assets" meta="Equipment, vehicles and their papers" />
        <ListRow href="/maintenance" lead={<Wrench />} title="Upkeep" meta="Service coming due on each asset" />
      </Card>
    </main>
  );
}
