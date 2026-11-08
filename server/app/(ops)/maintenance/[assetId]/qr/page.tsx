import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { assetById } from '@/lib/data/maintenance';
import { qrSvg } from '@/lib/qr';
import { PrintButton } from './print-button';

export default async function AssetQrPage({ params }: { params: { assetId: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const asset = await assetById(params.assetId);
  if (!asset) notFound();

  const h = headers();
  const proto = h.get('x-forwarded-proto') || 'https';
  const host = h.get('host') || 'localhost';
  const base = process.env.PUBLIC_URL || `${proto}://${host}`;
  const url = `${base}/maintenance/${asset.id}`;
  const svg = await qrSvg(url);

  return (
    <main className="view">
      <div className="sub-head no-print">
        <Link href={`/maintenance/${asset.id}`} className="btn small ghost back-btn">
          ‹ Back
        </Link>
        <h1>Asset QR</h1>
      </div>

      <div className="card qr-card">
        <p className="qr-name">{asset.name}</p>
        <p className="subtle" style={{ marginTop: 0 }}>
          {asset.category}
        </p>
        {/* SVG comes from our own server-side generator, not user input. */}
        <div className="qr-img" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="qr-url">{url}</p>
        <p className="subtle no-print" style={{ marginBottom: 0 }}>
          Print this and stick it on the equipment — scanning it opens this asset&apos;s upkeep page.
        </p>
      </div>

      <div className="no-print" style={{ marginTop: 12 }}>
        <PrintButton />
      </div>
    </main>
  );
}
