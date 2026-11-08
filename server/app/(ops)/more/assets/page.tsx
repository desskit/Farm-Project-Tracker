import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listAssets } from '@/lib/data/maintenance';
import { docCountsByAsset } from '@/lib/data/asset-docs';
import { fmtDate } from '@/lib/domain/dates';

/**
 * The asset registry — what the farm owns, grouped by category. Distinct from
 * Upkeep (which is "what needs servicing") and from Supplies (consumables).
 */
export default async function AssetsPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const assets = await listAssets();
  const docCounts = await docCountsByAsset(assets.map((a) => a.id));

  const byCategory = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = a.category || 'Uncategorized';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(a);
  }
  const categories = [...byCategory.keys()].sort();
  const totalValue = assets.reduce((sum, a) => sum + (a.purchaseCost || 0), 0);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Assets</h1>
      </div>
      <p className="subtle" style={{ marginTop: -8, marginBottom: 12 }}>
        Equipment and property the farm owns. Servicing lives under Upkeep.
      </p>

      {!assets.length ? (
        <div className="empty">
          No assets yet. Add equipment from <Link href="/maintenance" className="chip-link">Upkeep</Link>.
        </div>
      ) : (
        <>
          <div className="tiles">
            <div className="stat-tile">
              <span className="stat-val">{assets.length}</span>
              <span className="stat-lbl">asset{assets.length === 1 ? '' : 's'}</span>
            </div>
            {totalValue > 0 && (
              <div className="stat-tile">
                <span className="stat-val">${totalValue.toFixed(0)}</span>
                <span className="stat-lbl">purchase value</span>
              </div>
            )}
          </div>

          {categories.map((cat) => (
            <div key={cat}>
              <div className="section-title">
                {cat}
                <span className="count-pill">{byCategory.get(cat)!.length}</span>
              </div>
              {byCategory.get(cat)!.map((a) => (
                <Link href={`/maintenance/${a.id}`} className="card tap" key={a.id}>
                  <div className="item">
                    <div className="item-main">
                      <p className="item-title">{a.name}</p>
                      <p className="item-sub">
                        {a.makeModel || '—'}
                        {a.serial ? ` · SN ${a.serial}` : ''}
                        {a.meterUnit ? ` · ${a.meterUnit}` : ''}
                      </p>
                      <div className="chips">
                        {a.purchaseDate && <span className="chip">bought {fmtDate(a.purchaseDate)}</span>}
                        {a.purchaseCost != null && <span className="chip">${a.purchaseCost.toFixed(2)}</span>}
                        {docCounts[a.id] > 0 && (
                          <span className="chip">
                            📄 {docCounts[a.id]} doc{docCounts[a.id] === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="search-chev">›</span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
