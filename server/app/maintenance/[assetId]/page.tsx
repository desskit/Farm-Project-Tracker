import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import {
  assetById,
  readingsFor,
  latestReading,
  maintenanceForAssetWithStatus,
  maintenanceLogsFor,
  itemCostTotal,
  assetCostTotal,
} from '@/lib/data/maintenance';
import { timerStatesFor } from '@/lib/data/timers';
import { listNotes } from '@/lib/data/notes';
import { listUsers } from '@/lib/data/users';
import { AssetDetail } from './asset-detail';
import { NotesSection } from '@/app/_components/notes-section';

export default async function AssetDetailPage({ params }: { params: { assetId: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const asset = await assetById(params.assetId);
  if (!asset) notFound();

  const [items, readings, latest, cost, people] = await Promise.all([
    maintenanceForAssetWithStatus(params.assetId),
    readingsFor(params.assetId),
    latestReading(params.assetId),
    assetCostTotal(params.assetId),
    listUsers(),
  ]);

  const itemsWithLogs = await Promise.all(
    items.map(async (item) => ({
      ...item,
      logs: await maintenanceLogsFor(item.id),
      costTotal: await itemCostTotal(item.id),
    })),
  );
  const [timers, notes] = await Promise.all([
    timerStatesFor(user.id, 'maintenance', items.map((i) => i.id)),
    listNotes('asset', params.assetId),
  ]);

  return (
    <main className="view">
      <AssetDetail
        asset={asset}
        items={itemsWithLogs}
        readings={readings}
        latestReading={latest}
        assetCost={cost}
        people={people}
        currentUser={user}
        timers={timers}
      />
      <NotesSection parentType="asset" parentId={asset.id} notes={notes} currentUser={user} />
    </main>
  );
}
