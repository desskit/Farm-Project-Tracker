'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Image as ImageIcon, Pencil, Trash2, Undo2, Wrench } from 'lucide-react';
import type { MaintLogRow, MaintWithStatus } from '@/lib/data/maintenance';
import type { TimerState } from '@/lib/data/timers';
import { fmtDate } from '@/lib/domain/dates';
import { preparePhoto } from '@/lib/client/photo';
import { submitQueued } from '@/lib/client/outbox';
import { TimerControl } from '@/app/_components/timer-control';
import { Banner, Button, Field, IconButton, Input, Stack, StatusPill, Textarea, type Tone } from '@/components/ui';
import { EditMaintenanceForm } from './asset-forms';
import s from './asset.module.css';

export type ItemWithLogs = MaintWithStatus & { logs: MaintLogRow[]; costTotal: number };
const TONE: Record<string, Tone> = { overdue: 'overdue', today: 'today', upcoming: 'today', later: 'done' };

/** One maintenance item: its status, logging a service, and recent history. */
export function MaintItem({
  item, meterUnit, timer, nameById, manages, seesMoney, onDelete, onSendBack, onError,
}: {
  item: ItemWithLogs;
  meterUnit: string | null;
  timer?: TimerState;
  nameById: Map<string, string>;
  manages: boolean;
  seesMoney: boolean;
  onDelete: () => void;
  onSendBack: (logId: string) => void;
  onError: (m: string | null) => void;
}) {
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const every = `every ${item.intervalValue} ${item.intervalType === 'usage' ? meterUnit : item.intervalUnit}`;
  return (
    <section className={s.item}>
      {item.sentBack && <Banner tone="warn" title="Sent back — please redo">{item.sentBack.reason || 'No reason given.'}</Banner>}
      <div className={s.itemHead}>
        <div className={s.itemMain}>
          <div className={s.itemName}>{item.name}</div>
          <div className={s.chips}>
            <StatusPill tone={TONE[item.status.bucket] ?? 'neutral'}>{item.status.detail}</StatusPill>
            <span className={s.muted}>{every}</span>
            {item.requirePhoto && <span className={s.flag}><Camera aria-hidden /> photo</span>}
            {seesMoney && item.costTotal > 0 && <span className={s.muted}>${item.costTotal.toFixed(2)} spent</span>}
          </div>
        </div>
        {manages && (
          <div className={s.itemTools}>
            <IconButton label="Edit item" onClick={() => setEditing((v) => !v)}><Pencil /></IconButton>
            <IconButton label="Delete item" onClick={onDelete}><Trash2 /></IconButton>
          </div>
        )}
      </div>
      {timer && <TimerControl kind="maintenance" refId={item.id} running={timer.running} startedAt={timer.startedAt} totalSec={timer.totalSec} />}
      {editing && <EditMaintenanceForm item={item} meterUnit={meterUnit} onDone={() => setEditing(false)} onError={onError} />}
      {logging ? (
        <LogServiceForm item={item} meterUnit={meterUnit} onClose={() => setLogging(false)} onError={onError} />
      ) : (
        <div><Button size="sm" icon={<Wrench />} onClick={() => setLogging(true)}>Log service</Button></div>
      )}
      {item.logs.length > 0 && (
        <div className={s.logs}>
          {item.logs.slice(0, 6).map((l, i) => (
            <div className={s.log} key={l.id}>
              <span className={s.logMain}>
                <strong>{fmtDate(l.date)}</strong> · {nameById.get(l.userId ?? '') ?? 'Unknown'}
                {l.reading != null ? ` · ${l.reading} ${meterUnit ?? ''}` : ''}
                {seesMoney && l.cost ? ` · $${l.cost}` : ''}
                {l.notes && <span className={s.muted}> · {l.notes}</span>}
              </span>
              {l.photoId && (
                <a href={`/api/attachments/${l.photoId}`} target="_blank" rel="noopener" className={s.proof} aria-label="View photo">
                  <ImageIcon aria-hidden />
                </a>
              )}
              {manages && i === 0 && <IconButton label="Send back / undo this service" onClick={() => onSendBack(l.id)}><Undo2 /></IconButton>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LogServiceForm({ item, meterUnit, onClose, onError }: { item: ItemWithLogs; meterUnit: string | null; onClose: () => void; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [reading, setReading] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (item.requirePhoto && !photo) return onError('A photo of the finished work is required for this item.');
    setBusy(true);
    onError(null);
    const body: Record<string, unknown> = { notes };
    if (reading !== '') body.reading = Number(reading);
    if (cost !== '') body.cost = Number(cost);
    let prepared;
    try {
      if (photo) prepared = await preparePhoto(photo);
    } catch (err) {
      setBusy(false);
      return onError(err instanceof Error ? err.message : 'Could not read that photo.');
    }
    // Servicing happens in the shop or the field; queue it if there's no signal.
    const r = await submitQueued({ url: `/api/maintenance/${item.id}/log`, body, label: `Serviced ${item.name}`, photo: prepared, photoField: 'photoId' });
    setBusy(false);
    if (!r.ok && !r.queued) return onError(r.error);
    onClose();
    if (r.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className={s.inlineForm}>
      <Stack>
        <div className={s.every}>
          {meterUnit && (
            <Field label={`Reading (${meterUnit})`} htmlFor={`r-${item.id}`}>
              <Input id={`r-${item.id}`} type="number" step="any" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} />
            </Field>
          )}
          <Field label="Cost ($, optional)" htmlFor={`c-${item.id}`}>
            <Input id={`c-${item.id}`} type="number" step="0.01" min={0} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
        </div>
        {item.requirePhoto && (
          <label className={s.photo}>
            <Camera aria-hidden />
            {photo ? photo.name : 'Photo of the finished work (required)'}
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <Field label="Notes" htmlFor={`n-${item.id}`}>
          <Textarea id={`n-${item.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Parts used, anything you noticed…" rows={2} />
        </Field>
        <div className={s.row}>
          <Button type="submit" loading={busy}>Mark serviced</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </Stack>
    </form>
  );
}
