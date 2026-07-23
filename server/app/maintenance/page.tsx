import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listAssetsWithStatus } from '@/lib/data/maintenance';
import { AddAssetCard } from './add-asset-card';

export default async function MaintenancePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = user.role === 'manager' || user.role === 'admin';
  const assets = await listAssetsWithStatus();

  return (
    <main className="view">
      <div className="view-head">
        <h1>Upkeep</h1>
      </div>
      <p className="subtle" style={{ marginTop: -6, marginBottom: 12 }}>
        Assets and the maintenance coming due on each.
      </p>

      {!assets.length ? (
        <div className="empty">No assets yet.</div>
      ) : (
        assets.map((a) => {
          const rail = a.overdue ? 'overdue' : a.soon ? 'today' : 'upcoming';
          return (
            <Link href={`/maintenance/${a.id}`} className="card tap" key={a.id}>
              <div className="item">
                <span className={`left-rail ${rail}`} />
                <div className="item-main">
                  <p className="item-title">{a.name}</p>
                  <p className="item-sub">
                    {a.category}
                    {a.meterUnit ? ` · ${a.meterUnit}` : ''} · {a.itemCount} item{a.itemCount === 1 ? '' : 's'}
                  </p>
                  {(a.overdue > 0 || a.soon > 0) && (
                    <div className="item-badges">
                      {a.overdue > 0 && <span className="badge overdue">{a.overdue} overdue</span>}
                      {a.soon > 0 && <span className="badge today">{a.soon} coming up</span>}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })
      )}

      {isManager && (
        <>
          <div className="section-title">Add an asset</div>
          <AddAssetCard />
        </>
      )}
    </main>
  );
}
