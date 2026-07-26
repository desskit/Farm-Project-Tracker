'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AssetRow, ReadingRow, MaintLogRow, MaintWithStatus } from '@/lib/data/maintenance';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import { fmtDate } from '@/lib/domain/dates';
import { preparePhoto } from '@/lib/client/photo';
import { submitQueued } from '@/lib/client/outbox';
import { TimerControl } from '@/app/_components/timer-control';
import type { TimerState } from '@/lib/data/timers';

type ItemWithLogs = MaintWithStatus & { logs: MaintLogRow[]; costTotal: number };

export function AssetDetail({
  asset,
  items,
  readings,
  latestReading,
  assetCost,
  people,
  currentUser,
  timers,
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
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  async function request(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return false;
    }
    return true;
  }

  async function onDeleteAsset() {
    if (!confirm('Delete this asset, its maintenance items, and history?')) return;
    setBusy('del-asset');
    const ok = await request(`/api/assets/${asset.id}`, 'DELETE');
    setBusy(null);
    if (ok) router.push('/maintenance');
  }

  async function onSendBack(logId: string) {
    const reason = window.prompt('Send this service back / undo it. Reason (optional):', '');
    if (reason === null) return;
    setBusy('sb-' + logId);
    const ok = await request(`/api/maintenance-logs/${logId}/send-back`, 'POST', { reason });
    setBusy(null);
    if (ok) router.refresh();
  }

  async function onDeleteItem(id: string) {
    if (!confirm('Delete this maintenance item and its history?')) return;
    setBusy('del-' + id);
    const ok = await request(`/api/maintenance/${id}`, 'DELETE');
    setBusy(null);
    if (ok) router.refresh();
  }

  return (
    <>
      <div className="sub-head">
        <Link href="/maintenance" className="btn small ghost back-btn">
          ‹ Upkeep
        </Link>
        <h1>{asset.name}</h1>
      </div>

      <div className="card">
        <p className="subtle" style={{ margin: 0 }}>
          {asset.category}
          {asset.meterUnit ? ` · ${asset.meterUnit}` : ''} · total spend ${assetCost.toFixed(2)}
        </p>
        {(asset.makeModel || asset.serial || asset.purchaseDate || asset.purchaseCost != null) && (
          <div className="chips" style={{ marginTop: 8 }}>
            {asset.makeModel && <span className="chip">{asset.makeModel}</span>}
            {asset.serial && <span className="chip">SN {asset.serial}</span>}
            {asset.purchaseDate && <span className="chip">bought {fmtDate(asset.purchaseDate)}</span>}
            {asset.purchaseCost != null && <span className="chip">${asset.purchaseCost.toFixed(2)}</span>}
          </div>
        )}
        {asset.notes && <p style={{ margin: '8px 0 0' }}>{asset.notes}</p>}
        <div className="row-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Link href={`/maintenance/${asset.id}/qr`} className="btn small ghost">
            📱 QR code
          </Link>
          {isManager && (
            <button className="btn small ghost" disabled={busy !== null} onClick={() => setEditingAsset((v) => !v)}>
              {editingAsset ? 'Cancel edit' : 'Edit asset'}
            </button>
          )}
          {isManager && (
            <button className="btn small ghost danger" disabled={busy === 'del-asset'} onClick={onDeleteAsset}>
              Delete asset
            </button>
          )}
        </div>
        {isManager && editingAsset && (
          <div style={{ marginTop: 12 }}>
            <EditAssetForm asset={asset} onDone={() => setEditingAsset(false)} onError={setError} />
          </div>
        )}
      </div>

      {/* Meter readings */}
      {asset.meterUnit && (
        <>
          <div className="section-title">Meter readings ({asset.meterUnit})</div>
          <AddReadingForm assetId={asset.id} unit={asset.meterUnit} latest={latestReading} onError={setError} />
          <div className="card">
            {!readings.length ? (
              <p className="subtle" style={{ margin: 0 }}>
                No readings yet.
              </p>
            ) : (
              readings.slice(0, 10).map((r) => (
                <div className="hist-row" key={r.id}>
                  <span>
                    <strong>
                      {r.reading} {asset.meterUnit}
                    </strong>{' '}
                    · {nameById.get(r.userId ?? '') ?? 'Unknown'}
                  </span>
                  <span className="subtle">{fmtDate(r.date)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Maintenance items */}
      <div className="section-title">
        Maintenance
        <span className="count-pill">{items.length}</span>
      </div>
      {!items.length && <div className="empty">No maintenance items yet.</div>}
      {items.map((item) => (
        <div className="card" key={item.id}>
          {item.sentBack && (
            <div className="sb-banner">
              ↩ Sent back{item.sentBack.reason ? `: "${item.sentBack.reason}"` : ''} — please redo.
            </div>
          )}
          <p className="item-title">{item.name}</p>
          <div className="item-badges">
            <span className={`badge ${bucketBadge(item.status.bucket)}`}>{item.status.detail}</span>
            <span className="chip">
              every {item.intervalValue} {item.intervalType === 'usage' ? asset.meterUnit : item.intervalUnit}
            </span>
            {item.requirePhoto && <span className="chip">📷 proof</span>}
            {item.costTotal > 0 && <span className="chip">${item.costTotal.toFixed(2)}</span>}
          </div>

          {timers[item.id] && (
            <TimerControl
              kind="maintenance"
              refId={item.id}
              running={timers[item.id].running}
              startedAt={timers[item.id].startedAt}
              totalSec={timers[item.id].totalSec}
            />
          )}

          <LogServiceForm item={item} meterUnit={asset.meterUnit} onError={setError} />

          {isManager && (
            <div className="row-actions" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              <button
                className="btn small ghost"
                disabled={busy !== null}
                onClick={() => setEditingItem((v) => (v === item.id ? null : item.id))}
              >
                {editingItem === item.id ? 'Cancel edit' : 'Edit'}
              </button>
              <button className="btn small ghost danger" disabled={busy === 'del-' + item.id} onClick={() => onDeleteItem(item.id)}>
                Delete item
              </button>
            </div>
          )}
          {isManager && editingItem === item.id && (
            <div style={{ marginTop: 10 }}>
              <EditMaintenanceForm
                item={item}
                meterUnit={asset.meterUnit}
                onDone={() => setEditingItem(null)}
                onError={setError}
              />
            </div>
          )}

          {item.logs.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {item.logs.slice(0, 6).map((l, idx) => (
                <div className="hist-row" key={l.id}>
                  <span>
                    <strong>{fmtDate(l.date)}</strong> · {nameById.get(l.userId ?? '') ?? 'Unknown'}
                    {l.reading != null ? ` · ${l.reading}` : ''}
                    {l.cost ? ` · $${l.cost}` : ''}
                    {l.notes ? ` · ${l.notes}` : ''}
                    {l.photoId && (
                      <>
                        {' '}
                        <a href={`/api/attachments/${l.photoId}`} target="_blank" rel="noopener" className="chip-link">
                          📷 proof
                        </a>
                      </>
                    )}
                  </span>
                  {isManager && idx === 0 && (
                    <button className="icon-btn" style={{ color: 'var(--overdue)' }} title="Send back" disabled={busy === 'sb-' + l.id} onClick={() => onSendBack(l.id)}>
                      ↩
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {isManager && <AddMaintenanceForm assetId={asset.id} hasMeter={!!asset.meterUnit} onError={setError} />}

      {error && <p className="error-text">{error}</p>}
    </>
  );
}

function bucketBadge(b: string): string {
  if (b === 'overdue') return 'overdue';
  if (b === 'today' || b === 'upcoming') return 'today';
  return 'upcoming';
}

/* ---------------- sub-forms ---------------- */

function AddReadingForm({ assetId, unit, latest, onError }: { assetId: string; unit: string; latest: number | null; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [reading, setReading] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    // Meter readings are taken at the machine, often out of signal.
    const r = await submitQueued({
      url: `/api/assets/${assetId}/readings`,
      body: { reading: Number(reading) },
      label: `Reading ${reading} ${unit}`,
    });
    setLoading(false);
    if (!r.ok && !r.queued) {
      onError(r.error);
      return;
    }
    setReading('');
    if (r.ok) router.refresh();
  }

  return (
    <div className="card">
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>New reading{latest != null ? ` (latest: ${latest})` : ''}</label>
          <input type="number" step="any" min={0} value={reading} onChange={(e) => setReading(e.target.value)} required placeholder={unit} />
        </div>
        <button type="submit" disabled={loading} className="btn primary">
          Log
        </button>
      </form>
    </div>
  );
}

function LogServiceForm({ item, meterUnit, onError }: { item: ItemWithLogs; meterUnit: string | null; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button className="btn small primary" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        Log service
      </button>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (item.requirePhoto && !photo) {
      onError('A photo of the completed work is required for this item.');
      return;
    }
    setLoading(true);
    onError(null);
    const body: Record<string, unknown> = { notes };
    if (reading !== '') body.reading = Number(reading);
    if (cost !== '') body.cost = Number(cost);
    let prepared;
    try {
      if (photo) prepared = await preparePhoto(photo);
    } catch (err) {
      setLoading(false);
      onError(err instanceof Error ? err.message : 'Could not read that photo.');
      return;
    }
    // Servicing happens in the shop or the field; queue it if there's no signal.
    const r = await submitQueued({
      url: `/api/maintenance/${item.id}/log`,
      body,
      label: `Serviced ${item.name}`,
      photo: prepared,
      photoField: 'photoId',
    });
    setLoading(false);
    if (!r.ok && !r.queued) {
      onError(r.error);
      return;
    }
    setOpen(false);
    setReading('');
    setCost('');
    setNotes('');
    setPhoto(null);
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 10 }}>
      {meterUnit && (
        <div className="field">
          <label>Meter reading ({meterUnit})</label>
          <input type="number" step="any" value={reading} onChange={(e) => setReading(e.target.value)} placeholder={`current ${meterUnit}`} />
        </div>
      )}
      <div className="field">
        <label>Cost ($, optional)</label>
        <input type="number" step="0.01" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      {item.requirePhoto && (
        <div className="field">
          <label>📷 Photo of completed work (required)</label>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </div>
      )}
      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Parts used, observations…" />
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn primary">
          {loading ? 'Saving…' : 'Mark serviced'}
        </button>
      </div>
    </form>
  );
}

function AddMaintenanceForm({ assetId, hasMeter, onError }: { assetId: string; hasMeter: boolean; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [intervalType, setIntervalType] = useState<'calendar' | 'usage'>('calendar');
  const [intervalValue, setIntervalValue] = useState('6');
  const [intervalUnit, setIntervalUnit] = useState<'months' | 'days'>('months');
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    const res = await fetch(`/api/assets/${assetId}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        intervalType,
        intervalValue: Number(intervalValue),
        intervalUnit,
        requirePhoto,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Something went wrong.');
      return;
    }
    setName('');
    router.refresh();
  }

  return (
    <>
      <div className="section-title">Add maintenance item</div>
      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>What needs doing</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Engine oil & filter" />
          </div>
          <div className="field">
            <label>Due by</label>
            <select value={intervalType} onChange={(e) => setIntervalType(e.target.value as 'calendar' | 'usage')}>
              <option value="calendar">Calendar interval</option>
              <option value="usage" disabled={!hasMeter}>
                Usage interval{hasMeter ? '' : ' (asset has no meter)'}
              </option>
            </select>
          </div>
          <div className="field">
            <label>Every</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min={1} value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} style={{ flex: 1 }} />
              {intervalType === 'calendar' ? (
                <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as 'months' | 'days')} style={{ flex: 1 }}>
                  <option value="months">months</option>
                  <option value="days">days</option>
                </select>
              ) : (
                <span className="btn" style={{ flex: 1, pointerEvents: 'none' }}>
                  units
                </span>
              )}
            </div>
          </div>
          <label className="inline-check" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
            Require a photo of completed work
          </label>
          <button type="submit" disabled={loading} className="btn primary block">
            {loading ? 'Saving…' : 'Add item'}
          </button>
        </form>
      </div>
    </>
  );
}

/** Rename an asset or update its category/notes without losing service history. */
function EditAssetForm({
  asset,
  onDone,
  onError,
}: {
  asset: AssetRow;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category);
  const [notes, setNotes] = useState(asset.notes);
  const [makeModel, setMakeModel] = useState(asset.makeModel);
  const [serial, setSerial] = useState(asset.serial);
  const [purchaseDate, setPurchaseDate] = useState(asset.purchaseDate ?? '');
  const [purchaseCost, setPurchaseCost] = useState(asset.purchaseCost == null ? '' : String(asset.purchaseCost));
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        notes,
        makeModel,
        serial,
        purchaseDate: purchaseDate || null,
        purchaseCost: purchaseCost === '' ? null : Number(purchaseCost),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Could not save the asset.');
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label>Category</label>
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Equipment" />
      </div>
      <div className="field">
        <label>Make &amp; model</label>
        <input type="text" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="e.g. John Deere 3025E" />
      </div>
      <div className="field">
        <label>Serial / VIN</label>
        <input type="text" value={serial} onChange={(e) => setSerial(e.target.value)} />
      </div>
      <div className="field">
        <label>Purchase date</label>
        <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Purchase cost ($)</label>
        <input type="number" step="0.01" min={0} value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} />
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>
      <p className="subtle" style={{ fontSize: 12, marginTop: -4 }}>
        The meter unit can&apos;t be changed once readings exist — it would invalidate the history.
      </p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn primary">
          {saving ? 'Saving…' : 'Save asset'}
        </button>
      </div>
    </form>
  );
}

/** Adjust a maintenance item's name, interval, or photo requirement. */
function EditMaintenanceForm({
  item,
  meterUnit,
  onDone,
  onError,
}: {
  item: ItemWithLogs;
  meterUnit: string | null;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [intervalValue, setIntervalValue] = useState(String(item.intervalValue));
  const [intervalUnit, setIntervalUnit] = useState<'months' | 'days'>(item.intervalUnit ?? 'months');
  const [requirePhoto, setRequirePhoto] = useState(item.requirePhoto);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = Number(intervalValue);
    if (!v || v <= 0) {
      onError('Enter an interval greater than zero.');
      return;
    }
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/maintenance/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, intervalValue: v, intervalUnit, requirePhoto }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Could not save this item.');
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>What needs doing</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label>Every</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min={1}
            step="any"
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            style={{ flex: 1 }}
          />
          {item.intervalType === 'calendar' ? (
            <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as 'months' | 'days')} style={{ flex: 1 }}>
              <option value="months">months</option>
              <option value="days">days</option>
            </select>
          ) : (
            <span className="btn" style={{ flex: 1, pointerEvents: 'none' }}>
              {meterUnit || 'units'}
            </span>
          )}
        </div>
      </div>
      <label className="inline-check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
        Require a photo of completed work
      </label>
      <p className="subtle" style={{ fontSize: 12, marginTop: -4 }}>
        Changing the interval recalculates when this is next due.
      </p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn primary">
          {saving ? 'Saving…' : 'Save item'}
        </button>
      </div>
    </form>
  );
}
