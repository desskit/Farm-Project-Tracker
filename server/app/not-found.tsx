import Link from 'next/link';

/** Branded 404 — also what notFound() renders for a missing chore/asset/project. */
export default function NotFound() {
  return (
    <main className="view">
      <div className="empty" style={{ marginTop: 40 }}>
        <p style={{ fontSize: 32, margin: 0 }}>🌾</p>
        <p className="item-title" style={{ marginTop: 8 }}>Not found</p>
        <p className="subtle">That page doesn&apos;t exist, or the item was deleted.</p>
        <div className="row-actions" style={{ justifyContent: 'center', marginTop: 14 }}>
          <Link href="/" className="btn primary">
            Back to Today
          </Link>
        </div>
      </div>
    </main>
  );
}
