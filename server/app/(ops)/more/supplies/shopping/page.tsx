import { notFound } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { shoppingList } from '@/lib/data/inventory';
import { can } from '@/lib/domain/permissions';
import { Card, EmptyState } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { ShoppingList } from './shopping-list';

export const metadata = { title: 'Shopping list · Farm Project Tracker' };

/** Everything low or about to run out, with how much to buy and where it came from last time. */
export default async function ShoppingPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'supplies.use')) notFound();
  const lines = await shoppingList();
  const seesMoney = can(user, 'finance.view');
  return (
    <Screen title="Shopping list" subtitle="Low or running out at the current rate" back="/more/supplies">
      {lines.length === 0 ? (
        <Card><EmptyState icon={<ShoppingCart />} title="Nothing to buy">Everything is above its reorder point with more than a week left.</EmptyState></Card>
      ) : (
        <ShoppingList lines={lines.map((l) => ({ ...l, lastUnitPrice: seesMoney ? l.lastUnitPrice : null, estCost: seesMoney ? l.estCost : null }))} />
      )}
    </Screen>
  );
}
