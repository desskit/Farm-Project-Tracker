'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Pencil, QrCode, Trash2 } from 'lucide-react';
import type { AssetRow, ReadingRow } from '@/lib/data/maintenance';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import type { TimerState } from '@/lib/data/timers';
import { fmtDate } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { Banner, ButtonLink, Card, EmptyState, IconButton, PageHeader, Stack } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import { AddMaintenanceForm, AddReadingForm, EditAssetForm } from './asset-forms';
import { MaintItem, type ItemWithLogs } from './maint-item';
import s from './asset.module.css';

export function AssetDetail({
  asset, items, readings, latestReading, assetCost, people, currentUser, timers,
}: {
  asset: AssetRow;
  items: ItemWithLogs[];
  readings: ReadingRow[];
  latestReading: number | null;
  assetCost: number;
  people: PersonRow[];
  currentUser: SessionUser;
  timers: Record<string, TimerState>;
}) {
  const { confirm: askConfirm, prompt: askPrompt } = useDialogs();
  const router = useRouter();
  const manages = can(currentUser, 'work.manage');
  const seesMoney = can(currentUser, 'finance.view');
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.ok) return true;
    setError((await res.json().catch(() => ({}))).error || 'Something went wrong.');
    return false;
  }

  const details = [
    asset.makeModel,
    asset.serial && `SN ${asset.serial}`,
    asset.purchaseDate && `bought ${fmtDate(asset.purchaseDate)}`,
    seesMoney && asset.purchaseCost != null && `$${asset.purchaseCost.toFixed(2)}`,
  ].filter(Boolean);

  return (
    <Stack gap={16}>
      <PageHeader
        back={<Link href="/maintenance" aria-label="Back to upkeep" className={s.back}><ChevronLeft /></Link>}
        title={asset.name}
        subtitle={`${asset.category}${asset.meterUnit ? ` · ${asset.meterUnit}` : ''}${seesMoney ? ` · $${assetCost.toFixed(2)} spent` : ''}`}
        actions={
          <>
            <ButtonLink href={`/maintenance/${asset.id}/qr`} size="sm" variant="ghost" icon={<QrCode />}>QR</ButtonLink>
            {manages && <IconButton label="Edit asset" onClick={() => setEditing((v) => !v)}><Pencil /></IconButton>}
            {manages && (
              <IconButton
                label="Delete asset"
                onClick={async () => {
                  if (await askConfirm('Delete this asset, its maintenance items, and history?')) {
                    if (await call(`/api/assets/${asset.id}`, 'DELETE')) router.push('/maintenance');
                  }
                }}
              >
                <Trash2 />
              </IconButton>
            )}
          </>
        }
      />

      {(details.length > 0 || asset.notes || editing) && (
        <Card>
          {details.length > 0 && <p className={s.muted}>{details.join(' · ')}</p>}
          {asset.notes && <p className={s.notes}>{asset.notes}</p>}
          {manages && editing && <EditAssetForm asset={asset} onDone={() => setEditing(false)} onError={setError} />}
        </Card>
      )}

      {error && <Banner tone="danger">{error}</Banner>}

      {asset.meterUnit && (
        <Card title={`Meter (${asset.meterUnit})`}>
          <AddReadingForm assetId={asset.id} unit={asset.meterUnit} latest={latestReading} onError={setError} />
          {readings.length > 0 && (
            <div className={s.readings}>
              {readings.slice(0, 5).map((r) => (
                <div className={s.log} key={r.id}>
                  <span className={s.logMain}><strong>{r.reading} {asset.meterUnit}</strong> · {nameById.get(r.userId ?? '') ?? 'Unknown'}</span>
                  <span className={s.muted}>{fmtDate(r.date)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title={`Maintenance (${items.length})`} flush>
        {!items.length ? (
          <EmptyState title="Nothing scheduled yet">{manages ? 'Add oil changes, inspections, greasing — anything that repeats.' : undefined}</EmptyState>
        ) : (
          items.map((item) => (
            <MaintItem
              key={item.id}
              item={item}
              meterUnit={asset.meterUnit}
              timer={timers[item.id]}
              nameById={nameById}
              manages={manages}
              seesMoney={seesMoney}
              onError={setError}
              onDelete={async () => {
                if (await askConfirm('Delete this maintenance item and its history?')) {
                  if (await call(`/api/maintenance/${item.id}`, 'DELETE')) router.refresh();
                }
              }}
              onSendBack={async (logId) => {
                const reason = await askPrompt('Send this service back / undo it. Reason (optional):', '');
                if (reason !== null && (await call(`/api/maintenance-logs/${logId}/send-back`, 'POST', { reason }))) router.refresh();
              }}
            />
          ))
        )}
      </Card>

      {manages && (
        <Card title="Add a maintenance item">
          <AddMaintenanceForm assetId={asset.id} meterUnit={asset.meterUnit} onError={setError} />
        </Card>
      )}
    </Stack>
  );
}
