import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listInventory } from '@/lib/data/inventory';
import type { InventoryRow } from '@/lib/data/inventory';
import { AddSupplyCard } from './add-supply-card';

export default async function SuppliesPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = user.role === 'manager' || user.role === 'admin';
  const items = await listInventory();
  const low = items.filter((i) => i.qty <= i.reorderAt);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Supplies</h1>
      </div>

      {isManager && <AddSupplyCard />}

      {low.length > 0 && (
        <>
          <div className="section-title">
            ⚠️ Reorder list<span className="count-pill">{low.length}</span>
          </div>
          {low.map((i) => (
            <SupplyCard key={i.id} item={i} />
          ))}
        </>
      )}

      <div className="section-title">
        All supplies<span className="count-pill">{items.length}</span>
      </div>
      {!items.length ? <div className="empty">No inventory yet.</div> : items.map((i) => <SupplyCard key={i.id} item={i} />)}
    </main>
  );
}

function SupplyCard({ item }: { item: InventoryRow }) {
  const low = item.qty <= item.reorderAt;
  return (
    <Link href={`/more/supplies/${item.id}`} className="card tap">
      <div className="item">
        <span className={`left-rail ${low ? 'overdue' : 'upcoming'}`} />
        <div className="item-main">
          <p className="item-title">{item.name}</p>
          <p className="item-sub">
            {item.category} · reorder at {item.reorderAt} {item.unit}
          </p>
          {low && (
            <div className="item-badges">
              <span className="badge overdue">Low — reorder</span>
            </div>
          )}
        </div>
        <div className="inv-qty">
          {item.qty}
          <span>{item.unit}</span>
        </div>
      </div>
    </Link>
  );
}
