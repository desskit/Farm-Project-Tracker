import { Tractor, Wrench } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listAssetsWithStatus } from '@/lib/data/maintenance';
import { can } from '@/lib/domain/permissions';
import { workSections } from '@/lib/domain/nav';
import { WorkTabs } from '@/components/shell/work-tabs';
import { Card, EmptyState, ListRow, PageHeader, StatusPill } from '@/components/ui';
import { AddAssetCard } from './add-asset-card';
import s from './upkeep.module.css';

export default async function UpkeepPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = can(user, 'work.manage');
  const assets = await listAssetsWithStatus();
  const due = assets.filter((a) => a.overdue > 0 || a.soon > 0).sort((a, b) => b.overdue - a.overdue || b.soon - a.soon);
  const fine = assets.filter((a) => !a.overdue && !a.soon);

  const row = (a: (typeof assets)[number]) => (
    <ListRow
      key={a.id}
      href={`/maintenance/${a.id}`}
      lead={a.overdue || a.soon ? <Wrench /> : <Tractor />}
      title={a.name}
      meta={`${a.category}${a.meterUnit ? ` · ${a.meterUnit}` : ''} · ${a.itemCount} item${a.itemCount === 1 ? '' : 's'}`}
      trail={
        a.overdue ? (
          <StatusPill tone="overdue">{a.overdue} overdue</StatusPill>
        ) : a.soon ? (
          <StatusPill tone="today">{a.soon} due soon</StatusPill>
        ) : (
          <StatusPill tone="done">OK</StatusPill>
        )
      }
    />
  );

  return (
    <main className={s.wrap}>
      <WorkTabs sections={workSections(user)} />
      <PageHeader title="Upkeep" subtitle="Equipment and the service coming due on each" />

      {due.length > 0 && (
        <Card title="Needs service" flush>
          {due.map(row)}
        </Card>
      )}
      <Card title={due.length ? 'Everything else' : 'Equipment'} flush>
        {fine.length ? fine.map(row) : !due.length ? <EmptyState icon={<Tractor />} title="No equipment yet">Add tractors, vehicles, pumps — anything that needs regular service.</EmptyState> : <EmptyState title="Everything needs attention" />}
      </Card>

      {isManager && (
        <section className={s.add}>
          <h2 className={s.h2}>Add equipment</h2>
          <AddAssetCard />
        </section>
      )}
    </main>
  );
}
