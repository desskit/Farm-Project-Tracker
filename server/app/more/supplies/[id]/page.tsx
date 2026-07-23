import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { inventoryById, inventoryLogFor } from '@/lib/data/inventory';
import { listUsers } from '@/lib/data/users';
import { SupplyDetail } from './supply-detail';

export default async function SupplyDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const item = await inventoryById(params.id);
  if (!item) notFound();

  const [log, people] = await Promise.all([inventoryLogFor(params.id), listUsers()]);

  return (
    <main className="view">
      <SupplyDetail item={item} log={log} people={people} currentUser={user} />
    </main>
  );
}
