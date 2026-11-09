import Link from 'next/link';
import { FileText, Tractor } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listAssets } from '@/lib/data/maintenance';
import { docCountsByAsset } from '@/lib/data/asset-docs';
import { fmtDate } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { Card, EmptyState, ListRow } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import s from '@/components/patterns/patterns.module.css';

/**
 * The asset registry — what the farm owns, grouped by category. Distinct from
 * Upkeep (which is "what needs servicing") and from Supplies (consumables).
 */
export default async function AssetsPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const seesMoney = can(user, 'finance.view');
  const assets = await listAssets();
  const docCounts = await docCountsByAsset(assets.map((a) => a.id));
  const byCategory = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = a.category || 'Uncategorized';
    byCategory.set(key, [...(byCategory.get(key) ?? []), a]);
  }
  const categories = [...byCategory.keys()].sort();
  const totalValue = assets.reduce((sum, a) => sum + (a.purchaseCost || 0), 0);

  return (
    <Screen title="Assets" subtitle="Equipment and property the farm owns. Servicing lives under Upkeep." back="/farm">
      {!assets.length ? (
        <Card><EmptyState icon={<Tractor />} title="No assets yet">Add equipment from <Link href="/maintenance">Upkeep</Link>.</EmptyState></Card>
      ) : (
        <>
          <StatTiles
            tiles={[
              { label: `asset${assets.length === 1 ? '' : 's'}`, value: assets.length },
              ...(seesMoney && totalValue > 0 ? [{ label: 'purchase value', value: `$${totalValue.toFixed(0)}` }] : []),
            ]}
          />
          {categories.map((cat) => (
            <Card key={cat} title={`${cat} (${byCategory.get(cat)!.length})`} flush>
              {byCategory.get(cat)!.map((a) => (
                <ListRow
                  key={a.id}
                  href={`/maintenance/${a.id}`}
                  lead={<Tractor />}
                  title={a.name}
                  meta={
                    <span className={s.rowsMeta}>
                      {[a.makeModel, a.serial && `SN ${a.serial}`, a.meterUnit, a.purchaseDate && `bought ${fmtDate(a.purchaseDate)}`, seesMoney && a.purchaseCost != null && `$${a.purchaseCost.toFixed(2)}`].filter(Boolean).join(' · ') || '—'}
                      {docCounts[a.id] > 0 && <span className={s.rowsMeta}><FileText aria-hidden width={14} height={14} /> {docCounts[a.id]}</span>}
                    </span>
                  }
                />
              ))}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
