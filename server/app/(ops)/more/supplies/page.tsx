import Link from 'next/link';
import { ChevronLeft, Package } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listInventory, inventoryValue, supplyRunways, RUNWAY_WARN_DAYS, type InventoryRow } from '@/lib/data/inventory';
import { runwayLabel } from '@/lib/domain/supplies';
import { can } from '@/lib/domain/permissions';
import { ButtonLink, Card, EmptyState, ListRow, PageHeader, StatusPill } from '@/components/ui';
import { AddSupplyCard } from './add-supply-card';
import s from './supplies.module.css';

export default async function SuppliesPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const manages = can(user, 'supplies.manage');
  const seesMoney = can(user, 'finance.view');
  const [items, runways] = await Promise.all([listInventory(), supplyRunways()]);
  const soon = (i: InventoryRow) => (runways.get(i.id) ?? Infinity) <= RUNWAY_WARN_DAYS;
  const isLow = (i: InventoryRow) => i.qty <= i.reorderAt || soon(i);
  const left = (i: InventoryRow) => runwayLabel(runways.get(i.id) ?? null);
  const low = items.filter(isLow);
  const totalValue = seesMoney ? inventoryValue(items) : 0;

  const row = (i: InventoryRow) => (
    <ListRow
      key={i.id}
      href={`/more/supplies/${i.id}`}
      lead={<Package />}
      title={i.name}
      meta={`${i.category} · reorder at ${i.reorderAt} ${i.unit}${left(i) ? ` · ${left(i)}` : ''}${seesMoney && i.unitCost != null ? ` · $${i.unitCost.toFixed(2)}/${i.unit}` : ''}`}
      trail={
        <span className={s.qty}>
          {isLow(i) && <StatusPill tone="overdue">{i.qty <= i.reorderAt ? 'Low' : 'Running out'}</StatusPill>}
          <strong>{i.qty}</strong> {i.unit}
        </span>
      }
    />
  );

  return (
    <main className={s.wrap}>
      <PageHeader
        back={<Link href="/farm" aria-label="Back to farm" className={s.back}><ChevronLeft /></Link>}
        title="Supplies"
        subtitle={`${items.length} item${items.length === 1 ? '' : 's'}${totalValue > 0 ? ` · $${totalValue.toFixed(0)} on hand` : ''}`}
      />
      <p className={s.tip}>Tip: the (+) button logs supplies used from any screen, in two taps.</p>
      {low.length > 0 && (
        <Card title={`Reorder (${low.length})`} action={<ButtonLink href="/more/supplies/shopping" size="sm" variant="ghost">Shopping list</ButtonLink>} flush>
          {low.map(row)}
        </Card>
      )}
      <Card title="All supplies" flush>
        {items.length ? items.map(row) : <EmptyState icon={<Package />} title="No supplies yet">{manages ? 'Add feed, fuel, seed and parts below.' : undefined}</EmptyState>}
      </Card>
      {manages && <AddSupplyCard />}
    </main>
  );
}
