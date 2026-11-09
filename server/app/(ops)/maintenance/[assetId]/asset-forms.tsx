'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge, Plus } from 'lucide-react';
import type { AssetRow, MaintWithStatus } from '@/lib/data/maintenance';
import { submitQueued } from '@/lib/client/outbox';
import { Banner, Button, Field, Input, Select, Stack, Switch, Textarea } from '@/components/ui';
import s from './asset.module.css';

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok ? null : (await res.json().catch(() => ({}))).error || 'Something went wrong.';
}

/** Log a meter reading; queues offline (readings are taken at the machine). */
export function AddReadingForm({ assetId, unit, latest, onError }: { assetId: string; unit: string; latest: number | null; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [reading, setReading] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setQueued(false);
    onError(null);
    const r = await submitQueued({ url: `/api/assets/${assetId}/readings`, body: { reading: Number(reading) }, label: `Reading ${reading} ${unit}` });
    setBusy(false);
    if (!r.ok && !r.queued) return onError(r.error);
    setReading('');
    if (r.ok) router.refresh();
    else setQueued(true);
  }
  return (
    <form onSubmit={submit} className={s.readingForm}>
      <Field label={`New reading${latest != null ? ` · last ${latest} ${unit}` : ''}`} htmlFor="reading">
        <Input id="reading" type="number" step="any" min={0} inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} required placeholder={unit} />
      </Field>
      <Button type="submit" icon={<Gauge />} loading={busy}>Log</Button>
      {queued && <span className={s.muted}>Saved · syncs when online</span>}
    </form>
  );
}

type Interval = { name: string; intervalType: 'calendar' | 'usage'; intervalValue: string; intervalUnit: 'months' | 'days'; requirePhoto: boolean };

function IntervalFields({ d, set, meterUnit, typeLocked }: { d: Interval; set: (p: Partial<Interval>) => void; meterUnit: string | null; typeLocked: boolean }) {
  return (
    <>
      <Field label="What needs doing" htmlFor="mi-name">
        <Input id="mi-name" value={d.name} onChange={(e) => set({ name: e.target.value })} required placeholder="e.g. Engine oil & filter" />
      </Field>
      {!typeLocked && (
        <Field label="Due by" htmlFor="mi-type">
          <Select id="mi-type" value={d.intervalType} onChange={(e) => set({ intervalType: e.target.value as Interval['intervalType'] })}>
            <option value="calendar">Time (every few days or months)</option>
            <option value="usage" disabled={!meterUnit}>Use (every so many {meterUnit || 'meter units'}){meterUnit ? '' : ' — no meter'}</option>
          </Select>
        </Field>
      )}
      <div className={s.every}>
        <Field label="Every" htmlFor="mi-every">
          <Input id="mi-every" type="number" min={1} step="any" inputMode="decimal" value={d.intervalValue} onChange={(e) => set({ intervalValue: e.target.value })} />
        </Field>
        {d.intervalType === 'calendar' ? (
          <Field label="Unit" htmlFor="mi-unit">
            <Select id="mi-unit" value={d.intervalUnit} onChange={(e) => set({ intervalUnit: e.target.value as Interval['intervalUnit'] })}>
              <option value="months">months</option>
              <option value="days">days</option>
            </Select>
          </Field>
        ) : (
          <span className={s.unit}>{meterUnit || 'units'}</span>
        )}
      </div>
      <Switch label="Needs a photo" hint="Ask for a photo of the finished work." checked={d.requirePhoto} onChange={(requirePhoto) => set({ requirePhoto })} />
    </>
  );
}

export function AddMaintenanceForm({ assetId, meterUnit, onError }: { assetId: string; meterUnit: string | null; onError: (m: string | null) => void }) {
  const router = useRouter();
  const empty: Interval = { name: '', intervalType: 'calendar', intervalValue: '6', intervalUnit: 'months', requirePhoto: false };
  const [d, setD] = useState(empty);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const err = await send(`/api/assets/${assetId}/maintenance`, 'POST', { ...d, intervalValue: Number(d.intervalValue) });
    setBusy(false);
    if (err) return onError(err);
    setD(empty);
    router.refresh();
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <IntervalFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} meterUnit={meterUnit} typeLocked={false} />
        <Button type="submit" block icon={<Plus />} loading={busy}>Add item</Button>
      </Stack>
    </form>
  );
}

export function EditMaintenanceForm({ item, meterUnit, onDone, onError }: { item: MaintWithStatus; meterUnit: string | null; onDone: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [d, setD] = useState<Interval>({
    name: item.name, intervalType: item.intervalType, intervalValue: String(item.intervalValue),
    intervalUnit: item.intervalUnit ?? 'months', requirePhoto: item.requirePhoto,
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = Number(d.intervalValue);
    if (!v || v <= 0) return onError('Enter an interval greater than zero.');
    setBusy(true);
    onError(null);
    const err = await send(`/api/maintenance/${item.id}`, 'PATCH', { name: d.name, intervalValue: v, intervalUnit: d.intervalUnit, requirePhoto: d.requirePhoto });
    setBusy(false);
    if (err) return onError(err);
    onDone();
    router.refresh();
  }
  return (
    <form onSubmit={submit} className={s.inlineForm}>
      <Stack>
        <IntervalFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} meterUnit={meterUnit} typeLocked />
        <p className={s.muted}>Changing the interval recalculates when this is next due.</p>
        <div className={s.row}>
          <Button type="submit" loading={busy}>Save item</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </Stack>
    </form>
  );
}

/** Rename an asset or update its details without losing service history. */
export function EditAssetForm({ asset, onDone, onError }: { asset: AssetRow; onDone: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: asset.name, category: asset.category, notes: asset.notes, makeModel: asset.makeModel, serial: asset.serial,
    purchaseDate: asset.purchaseDate ?? '', purchaseCost: asset.purchaseCost == null ? '' : String(asset.purchaseCost),
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const err = await send(`/api/assets/${asset.id}`, 'PATCH', {
      ...f, purchaseDate: f.purchaseDate || null, purchaseCost: f.purchaseCost === '' ? null : Number(f.purchaseCost),
    });
    setBusy(false);
    if (err) return onError(err);
    onDone();
    router.refresh();
  }
  return (
    <form onSubmit={submit} className={s.inlineForm}>
      <Stack>
        <Field label="Name" htmlFor="as-name"><Input id="as-name" value={f.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
        <Field label="Category" htmlFor="as-cat"><Input id="as-cat" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Equipment" /></Field>
        <Field label="Make & model" htmlFor="as-mm"><Input id="as-mm" value={f.makeModel} onChange={(e) => set({ makeModel: e.target.value })} placeholder="e.g. John Deere 3025E" /></Field>
        <Field label="Serial / VIN" htmlFor="as-sn"><Input id="as-sn" value={f.serial} onChange={(e) => set({ serial: e.target.value })} /></Field>
        <div className={s.every}>
          <Field label="Bought" htmlFor="as-date"><Input id="as-date" type="date" value={f.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} /></Field>
          <Field label="Cost ($)" htmlFor="as-cost"><Input id="as-cost" type="number" step="0.01" min={0} inputMode="decimal" value={f.purchaseCost} onChange={(e) => set({ purchaseCost: e.target.value })} /></Field>
        </div>
        <Field label="Notes" htmlFor="as-notes"><Textarea id="as-notes" value={f.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} /></Field>
        <Banner tone="info">The meter unit can’t be changed once readings exist — it would invalidate the history.</Banner>
        <div className={s.row}>
          <Button type="submit" loading={busy}>Save asset</Button>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </Stack>
    </form>
  );
}
