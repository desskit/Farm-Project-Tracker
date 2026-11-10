'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Check, Pencil, Plus, Scissors, Sprout, Trash2, Trees, Wheat } from 'lucide-react';
import type { PlantingStatus } from '@/db/schema';
import { LAND_EVENT_LABEL, LAND_EVENT_TYPES, expectedHarvest, plantingProgress, type LandEventType } from '@/lib/domain/garden';
import { daysOn, type PaddockState } from '@/lib/domain/grazing';
import { fmtDate, relativeLabel } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, ListRow, Select, StatusPill, Switch, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../animals/animals.module.css';

type Opt = { id: string; label: string };
type Supply = { id: string; name: string; unit: string; qty: number };

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error || 'Something went wrong.';
}
function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    run: async (p: Promise<string | null>) => {
      setError(null);
      const err = await p;
      if (err) setError(err);
      else router.refresh();
      return !err;
    },
  };
}

/* ---------------- grazing ---------------- */

const GRAZE_TONE: Record<PaddockState, 'info' | 'upcoming' | 'done' | 'neutral'> = { occupied: 'info', resting: 'upcoming', ready: 'done', unused: 'neutral' };

export function GrazingCard({
  unitId, grazing, restDays, here, groups, moves, canLog, today,
}: {
  unitId: string;
  grazing: { state: PaddockState; rested: number | null; readyOn: string | null } | null;
  restDays: number;
  here: { id: string; name: string; headCount: number; movedOn: string | null }[];
  groups: { id: string; name: string }[];
  moves: { id: string; groupName: string; movedOn: string; direction: 'in' | 'out'; notes: string }[];
  canLog: boolean;
  today: string;
}) {
  const m = useMutation();
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(today);
  const label =
    !grazing ? '' : grazing.state === 'occupied' ? 'Being grazed'
      : grazing.state === 'resting' ? `Resting ${grazing.rested} of ${restDays} days · ready ${relativeLabel(grazing.readyOn!)}`
        : grazing.state === 'ready' ? `Rested ${grazing.rested} days — ready` : 'Not grazed yet';

  async function onMove(e: FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    if (await m.run({ url: `/api/animals/groups/${groupId}/move`, body: { toUnitId: unitId, date }, label: 'Moved animals' })) setGroupId('');
  }

  return (
    <Card title="Grazing" action={grazing ? <StatusPill tone={GRAZE_TONE[grazing.state]}>{grazing.state === 'occupied' ? 'In use' : grazing.state}</StatusPill> : undefined}>
      <div className={s.form}>
        <p className={s.muted}>{label}</p>
        {here.map((g) => (
          <ListRow key={g.id} href={`/farm/animals/${g.id}`} title={`${g.name} · ${g.headCount} head`} meta={g.movedOn ? `Here ${daysOn(g.movedOn, today)} days, since ${fmtDate(g.movedOn)}` : undefined} />
        ))}
        {canLog && groups.length > 0 && (
          <form className={s.quickRow} onSubmit={onMove}>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Group to move here">
              <option value="">Move a group here…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Moved on" />
            <Button type="submit" size="sm" icon={<ArrowRightLeft />} loading={m.busy} disabled={!groupId}>Move</Button>
          </form>
        )}
        {m.error && <Banner tone="danger">{m.error}</Banner>}
        {moves.length > 0 && (
          <div>
            {moves.slice(0, 8).map((mv) => (
              <div key={mv.id} className={s.event}>
                <span className={s.eventMain}>
                  <span>{mv.groupName} {mv.direction === 'in' ? 'moved in' : 'moved out'}</span>
                  <small>{fmtDate(mv.movedOn)}{mv.notes ? ` · ${mv.notes}` : ''}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/** On an animal group's page: where they are and a one-tap move. */
export function MoveGroupCard({ groupId, current, movedOn, units, today, advice }: { groupId: string; current: string | null; movedOn: string | null; units: { id: string; name: string }[]; today: string; advice?: { over: number; next: { id: string; name: string; rested: number | null } | null } | null }) {
  const m = useMutation();
  const [to, setTo] = useState('');
  const here = units.find((u) => u.id === current);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!to) return;
    if (await m.run({ url: `/api/animals/groups/${groupId}/move`, body: { toUnitId: to === 'off' ? null : to }, label: 'Moved animals' })) setTo('');
  }
  return (
    <Card title="Grazing">
      <div className={s.form}>
        <p className={s.muted}>{here ? <>On <Link href={`/farm/land/${here.id}`}>{here.name}</Link>{movedOn ? ` for ${daysOn(movedOn, today)} days` : ''}</> : 'Not on a tracked paddock.'}</p>
        {advice && advice.over > 0 && <Banner tone="warn">{advice.over} day{advice.over === 1 ? '' : 's'} past this paddock’s target stay — time to move.</Banner>}
        {advice?.next && (
          <div className={s.quickRow}>
            <span className={s.quickName}>
              <strong>Suggested next: {advice.next.name}</strong>
              <small>{advice.next.rested == null ? 'Not grazed yet' : `Rested ${advice.next.rested} days`}</small>
            </span>
            <Button size="sm" variant="secondary" loading={m.busy} onClick={() => m.run({ url: `/api/animals/groups/${groupId}/move`, body: { toUnitId: advice.next!.id }, label: 'Moved animals' })}>Move there</Button>
          </div>
        )}
        <form className={s.quickRow} onSubmit={onSubmit}>
          <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Move to">
            <option value="">Move to…</option>
            {units.filter((u) => u.id !== current).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            {current && <option value="off">Off the paddocks (barn, sold…)</option>}
          </Select>
          <Button type="submit" size="sm" icon={<ArrowRightLeft />} loading={m.busy} disabled={!to}>Move</Button>
        </form>
        {m.error && <Banner tone="danger">{m.error}</Banner>}
      </div>
    </Card>
  );
}

/* ---------------- plantings ---------------- */

type Planting = { id: string; crop: string; variety: string; sownOn: string; expectedHarvest: string | null; status: PlantingStatus; method: string; supplyName: string | null; seedQty: number | null; series: string | null };
const P_TONE: Record<PlantingStatus, 'upcoming' | 'info' | 'done' | 'neutral'> = { planned: 'upcoming', growing: 'info', harvested: 'done', failed: 'neutral' };
const P_LABEL: Record<PlantingStatus, string> = { planned: 'Planned', growing: 'Growing', harvested: 'Done', failed: 'Failed' };

export function PlantingsCard({ unitId, plantings, supplies, canLog, canManage, today }: { unitId: string; plantings: Planting[]; supplies: Supply[]; canLog: boolean; canManage: boolean; today: string }) {
  const [adding, setAdding] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const act = useAct();
  const { confirm: askConfirm } = useDialogs();
  const current = plantings.filter((p) => p.status === 'planned' || p.status === 'growing').sort((a, b) => a.sownOn.localeCompare(b.sownOn));
  const old = plantings.filter((p) => p.status === 'harvested' || p.status === 'failed');
  const list = showOld ? [...current, ...old] : current;

  return (
    <Card title="Plantings" action={canLog ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Plant</Button> : undefined} flush>
      {list.length === 0 ? (
        <EmptyState icon={<Sprout />} title="Nothing in the ground">{canLog ? 'Log what you sow or plant — or plan a succession.' : undefined}</EmptyState>
      ) : (
        list.map((p) => {
          const prog = p.status === 'growing' ? plantingProgress(p.sownOn, p.expectedHarvest, today) : null;
          const meta =
            p.status === 'planned' ? `Sow ${relativeLabel(p.sownOn)}`
              : p.status === 'growing' ? `${p.method === 'transplant' ? 'Planted' : 'Sown'} ${fmtDate(p.sownOn)}${p.expectedHarvest ? ` · ${prog?.ready ? 'ready now' : `ready ~${fmtDate(p.expectedHarvest)}`}` : ''}`
                : `${fmtDate(p.sownOn)}`;
          return (
            <div key={p.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{p.crop}{p.variety ? ` (${p.variety})` : ''}</strong>
                <small>{meta}{p.series ? ' · succession' : ''}{prog?.pct != null && !prog.ready ? ` · ${prog.pct}%` : ''}</small>
              </span>
              <StatusPill tone={prog?.ready ? 'done' : P_TONE[p.status]}>{prog?.ready ? 'Ready' : P_LABEL[p.status]}</StatusPill>
              {canLog && p.status === 'planned' && <Button size="sm" variant="ghost" icon={<Check />} onClick={() => act.run(send(`/api/land/plantings/${p.id}`, 'PATCH', { status: 'growing' }))}>Sown</Button>}
              {canLog && p.status === 'growing' && (
                <Button size="sm" variant="ghost" onClick={async () => { if (await askConfirm(`Mark ${p.crop} as finished? Harvests already logged stay.`)) act.run(send(`/api/land/plantings/${p.id}`, 'PATCH', { status: 'harvested' })); }}>Finished</Button>
              )}
              {canManage && <IconButton label="Delete planting" onClick={async () => { if (await askConfirm(`Delete this ${p.crop} planting?`)) act.run(send(`/api/land/plantings/${p.id}`, 'DELETE')); }}><Trash2 /></IconButton>}
            </div>
          );
        })
      )}
      {old.length > 0 && (
        <div className={s.event}><Button size="sm" variant="ghost" onClick={() => setShowOld(!showOld)}>{showOld ? 'Hide past plantings' : `Show past plantings (${old.length})`}</Button></div>
      )}
      {act.error && <Banner tone="danger">{act.error}</Banner>}
      <Dialog sheet open={adding} onClose={() => setAdding(false)} title="Plant">
        {adding && <PlantingForm unitId={unitId} supplies={supplies} today={today} onDone={() => setAdding(false)} />}
      </Dialog>
    </Card>
  );
}

function PlantingForm({ unitId, supplies, today, onDone }: { unitId: string; supplies: Supply[]; today: string; onDone: () => void }) {
  const m = useMutation();
  const [f, setF] = useState({ crop: '', variety: '', method: 'seed', sownOn: today, dtm: '', supplyId: '', seedQty: '', succession: false, every: '14', count: '4', notes: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ready = expectedHarvest(f.sownOn || today, Number(f.dtm) || null);
  const supply = supplies.find((x) => x.id === f.supplyId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      crop: f.crop.trim(), variety: f.variety, method: f.method, sownOn: f.sownOn, daysToMaturity: Number(f.dtm) || null,
      inventoryId: f.supplyId || null, seedQty: f.supplyId && f.seedQty ? Number(f.seedQty) : null,
      succession: f.succession ? { everyDays: Number(f.every) || 14, count: Math.max(2, Number(f.count) || 2) } : null, notes: f.notes,
    };
    if (await m.run({ url: `/api/land/${unitId}/plantings`, body, label: `Planted ${f.crop}` })) onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Crop" htmlFor="pl-crop"><Input id="pl-crop" value={f.crop} onChange={set('crop')} required maxLength={80} placeholder="Lettuce" /></Field>
        <Field label="Variety" htmlFor="pl-var"><Input id="pl-var" value={f.variety} onChange={set('variety')} maxLength={80} /></Field>
        <Field label="How" htmlFor="pl-method">
          <Select id="pl-method" value={f.method} onChange={set('method')}><option value="seed">Direct seeded</option><option value="transplant">Transplanted</option></Select>
        </Field>
        <Field label={f.succession ? 'First sowing' : 'Sown / planted on'} htmlFor="pl-on" hint="A future date plans it."><Input id="pl-on" type="date" value={f.sownOn} onChange={set('sownOn')} required /></Field>
        <Field label="Days to maturity" htmlFor="pl-dtm" hint={ready ? `Ready around ${fmtDate(ready)}` : 'From the seed packet'}><Input id="pl-dtm" type="number" inputMode="numeric" min="1" value={f.dtm} onChange={set('dtm')} /></Field>
      </div>
      {supplies.length > 0 && (
        <div className={s.two}>
          <Field label="Seed from Supplies" htmlFor="pl-seed" hint={supply ? `${supply.qty} ${supply.unit} on hand` : undefined}>
            <Select id="pl-seed" value={f.supplyId} onChange={set('supplyId')}>
              <option value="">Not tracked</option>
              {supplies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          {supply && <Field label={`Used per sowing (${supply.unit})`} htmlFor="pl-qty"><Input id="pl-qty" type="number" inputMode="decimal" min="0" step="any" value={f.seedQty} onChange={set('seedQty')} /></Field>}
        </div>
      )}
      <Switch label="Succession sowing" hint="Several sowings a set number of days apart, for a steady harvest." checked={f.succession} onChange={(v) => setF({ ...f, succession: v })} />
      {f.succession && (
        <div className={s.two}>
          <Field label="Every (days)" htmlFor="pl-every"><Input id="pl-every" type="number" inputMode="numeric" min="1" value={f.every} onChange={set('every')} /></Field>
          <Field label="How many sowings" htmlFor="pl-count"><Input id="pl-count" type="number" inputMode="numeric" min="2" max="26" value={f.count} onChange={set('count')} /></Field>
        </div>
      )}
      <Field label="Notes" htmlFor="pl-notes"><Textarea id="pl-notes" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy}>Save</Button>
    </form>
  );
}

/* ---------------- perennials ---------------- */

type Perennial = { id: string; crop: string; variety: string; count: number; plantedOn: string | null; notes: string; active: boolean };

export function PerennialsCard({ unitId, perennials, canManage }: { unitId: string; perennials: Perennial[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ crop: '', variety: '', count: '1', plantedOn: '' });
  const act = useAct();
  const { confirm: askConfirm } = useDialogs();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (await act.run(send(`/api/land/${unitId}/perennials`, 'POST', { crop: f.crop, variety: f.variety, count: Number(f.count) || 1, plantedOn: f.plantedOn || null }))) {
      setAdding(false);
      setF({ crop: '', variety: '', count: '1', plantedOn: '' });
    }
  }
  return (
    <Card title="Trees & perennials" action={canManage && !adding ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Add</Button> : undefined} flush={!adding}>
      {adding && (
        <form className={s.form} onSubmit={onAdd}>
          <div className={s.two}>
            <Field label="What" htmlFor="pe-crop"><Input id="pe-crop" value={f.crop} onChange={set('crop')} required maxLength={80} placeholder="Apple, blueberry, asparagus" /></Field>
            <Field label="Variety" htmlFor="pe-var"><Input id="pe-var" value={f.variety} onChange={set('variety')} maxLength={80} /></Field>
            <Field label="How many" htmlFor="pe-n"><Input id="pe-n" type="number" inputMode="numeric" min="1" value={f.count} onChange={set('count')} /></Field>
            <Field label="Planted" htmlFor="pe-on"><Input id="pe-on" type="date" value={f.plantedOn} onChange={set('plantedOn')} /></Field>
          </div>
          <div className={s.actions}>
            <Button type="submit">Add</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {!adding && perennials.length === 0 && <EmptyState icon={<Trees />} title="None yet">Fruit trees, berries, asparagus — log them once, then prune and harvest against them.</EmptyState>}
      {!adding && perennials.map((p) => (
        <div key={p.id} className={s.event}>
          <span className={s.eventMain}>
            <strong>{p.count} × {p.crop}{p.variety ? ` (${p.variety})` : ''}</strong>
            {p.plantedOn && <small>Planted {fmtDate(p.plantedOn)}</small>}
          </span>
          {!p.active && <StatusPill tone="neutral">Removed</StatusPill>}
          {canManage && p.active && (
            <IconButton label="Mark removed" onClick={async () => { if (await askConfirm(`Mark the ${p.crop} as removed? Its harvest history stays.`)) act.run(send(`/api/land/perennials/${p.id}`, 'PATCH', { active: false })); }}><Trash2 /></IconButton>
          )}
        </div>
      ))}
      {act.error && <Banner tone="danger">{act.error}</Banner>}
    </Card>
  );
}

/* ---------------- harvests ---------------- */

type Harvest = { id: string; crop: string; date: string; amount: number; unit: string; notes: string; userName: string | null };

export function HarvestCard({
  unitId, harvests, season, plantings, perennials, canLog, canManage, blockedUntil, today,
}: {
  unitId: string; harvests: Harvest[]; season: { crop: string; amount: number; unit: string }[]; plantings: Opt[]; perennials: Opt[];
  canLog: boolean; canManage: boolean; blockedUntil: string | null; today: string;
}) {
  const [open, setOpen] = useState(false);
  const act = useAct();
  const { confirm: askConfirm } = useDialogs();
  if (!canLog && harvests.length === 0) return null;
  return (
    <Card title="Harvest" action={canLog ? <Button size="sm" variant="ghost" icon={<Wheat />} onClick={() => setOpen(true)} disabled={!!blockedUntil}>Log</Button> : undefined} flush>
      {season.length > 0 && (
        <div className={s.event}>
          <span className={s.eventMain}>
            <small>This year</small>
            <span>{season.map((x) => `${x.crop} ${Math.round(x.amount * 10) / 10} ${x.unit}`).join(' · ')}</span>
          </span>
        </div>
      )}
      {harvests.length === 0 ? (
        <EmptyState icon={<Wheat />} title="No harvests yet" />
      ) : (
        harvests.slice(0, 20).map((h) => (
          <div key={h.id} className={s.event}>
            <span className={s.eventMain}>
              <strong>{h.amount} {h.unit} {h.crop}</strong>
              <small>{fmtDate(h.date)}{h.userName ? ` · ${h.userName}` : ''}{h.notes ? ` · ${h.notes}` : ''}</small>
            </span>
            {canManage && <IconButton label="Remove harvest" onClick={async () => { if (await askConfirm('Remove this harvest entry?')) act.run(send(`/api/land/harvests/${h.id}`, 'DELETE')); }}><Trash2 /></IconButton>}
          </div>
        ))
      )}
      {act.error && <Banner tone="danger">{act.error}</Banner>}
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Log a harvest">
        {open && <HarvestForm unitId={unitId} plantings={plantings} perennials={perennials} today={today} onDone={() => setOpen(false)} />}
      </Dialog>
    </Card>
  );
}

function HarvestForm({ unitId, plantings, perennials, today, onDone }: { unitId: string; plantings: Opt[]; perennials: Opt[]; today: string; onDone: () => void }) {
  const m = useMutation();
  const [from, setFrom] = useState(plantings[0] ? `p:${plantings[0].id}` : perennials[0] ? `t:${perennials[0].id}` : '');
  const [crop, setCrop] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('lb');
  const [date, setDate] = useState(today);
  const [finished, setFinished] = useState(false);
  const [notes, setNotes] = useState('');
  const isPlanting = from.startsWith('p:');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { amount: Number(amount), unit, date, notes };
    if (isPlanting) {
      body.plantingId = from.slice(2);
      body.finished = finished;
    } else if (from.startsWith('t:')) body.perennialId = from.slice(2);
    else body.crop = crop;
    if (await m.run({ url: `/api/land/${unitId}/harvests`, body, label: `Harvested ${amount} ${unit}` })) onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="From" htmlFor="hv-from">
        <Select id="hv-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {plantings.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.label}</option>)}
          {perennials.map((p) => <option key={p.id} value={`t:${p.id}`}>{p.label}</option>)}
          <option value="">Something else</option>
        </Select>
      </Field>
      {!from && <Field label="Crop" htmlFor="hv-crop"><Input id="hv-crop" value={crop} onChange={(e) => setCrop(e.target.value)} required maxLength={80} /></Field>}
      <div className={s.two}>
        <Field label="Amount" htmlFor="hv-amt"><Input id="hv-amt" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Unit" htmlFor="hv-unit">
          <Select id="hv-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {['lb', 'oz', 'kg', 'bunches', 'heads', 'each', 'bushels', 'bales', 'qt'].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Date" htmlFor="hv-date"><Input id="hv-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {isPlanting && <Switch label="That’s the last of it" hint="Marks the planting finished." checked={finished} onChange={setFinished} />}
      <Field label="Notes" htmlFor="hv-notes"><Textarea id="hv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy}>Save</Button>
    </form>
  );
}

/* ---------------- field work ---------------- */

type LandEvent = { id: string; type: LandEventType; date: string; qtyUsed: number | null; phiUntil: string | null; cost: number | null; notes: string; userName: string | null; supplyName: string | null; supplyUnit: string | null };

export function FieldWorkCard({ unitId, events, supplies, canLog, canManage, today }: { unitId: string; events: LandEvent[]; supplies: Supply[]; canLog: boolean; canManage: boolean; today: string }) {
  const [type, setType] = useState<LandEventType | null>(null);
  const act = useAct();
  const { confirm: askConfirm } = useDialogs();
  if (!canLog && events.length === 0) return null;
  return (
    <Card title="Field work" flush>
      {canLog && (
        <div className={`${s.logGrid} ${s.event}`}>
          {LAND_EVENT_TYPES.map((t) => <Button key={t} size="sm" variant="secondary" icon={t === 'prune' ? <Scissors /> : undefined} onClick={() => setType(t)}>{LAND_EVENT_LABEL[t]}</Button>)}
        </div>
      )}
      {events.map((e) => (
        <div key={e.id} className={s.event}>
          <span className={s.eventMain}>
            <strong>{LAND_EVENT_LABEL[e.type]}{e.supplyName ? ` — ${e.qtyUsed ? `${e.qtyUsed} ${e.supplyUnit ?? ''} ` : ''}${e.supplyName}` : ''}</strong>
            {e.notes && <span>{e.notes}</span>}
            <small>
              {fmtDate(e.date)}{e.userName ? ` · ${e.userName}` : ''}{e.cost ? ` · $${e.cost.toFixed(2)}` : ''}
              {e.phiUntil ? ` · harvest from ${fmtDate(e.phiUntil)}` : ''}
            </small>
          </span>
          {canManage && <IconButton label="Remove entry" onClick={async () => { if (await askConfirm(`Remove this entry?${e.qtyUsed ? ' Supplies used aren’t put back.' : ''}`)) act.run(send(`/api/land/events/${e.id}`, 'DELETE')); }}><Trash2 /></IconButton>}
        </div>
      ))}
      {act.error && <Banner tone="danger">{act.error}</Banner>}
      <Dialog sheet open={type !== null} onClose={() => setType(null)} title={type ? LAND_EVENT_LABEL[type] : ''}>
        {type && <LandEventForm key={type} type={type} unitId={unitId} supplies={supplies} today={today} onDone={() => setType(null)} />}
      </Dialog>
    </Card>
  );
}

function LandEventForm({ type, unitId, supplies, today, onDone }: { type: LandEventType; unitId: string; supplies: Supply[]; today: string; onDone: () => void }) {
  const m = useMutation();
  const [date, setDate] = useState(today);
  const [supplyId, setSupplyId] = useState('');
  const [qty, setQty] = useState('');
  const [phi, setPhi] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const supply = supplies.find((x) => x.id === supplyId);
  const usesSupply = type === 'amend' || type === 'spray' || type === 'irrigate' || type === 'soil_test';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { type, date, notes };
    if (supplyId) {
      body.inventoryId = supplyId;
      if (qty) body.qtyUsed = Number(qty);
    }
    if (type === 'spray' && phi) body.phiDays = Number(phi);
    if (cost) body.cost = Number(cost);
    if (await m.run({ url: `/api/land/${unitId}/events`, body, label: LAND_EVENT_LABEL[type] })) onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Date" htmlFor="le-date"><Input id="le-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></Field>
        {usesSupply && supplies.length > 0 && (
          <Field label={type === 'spray' ? 'Product' : 'Material'} htmlFor="le-sup" hint={supply ? `${supply.qty} ${supply.unit} on hand` : 'Taken off Supplies'}>
            <Select id="le-sup" value={supplyId} onChange={(e) => setSupplyId(e.target.value)}>
              <option value="">Not tracked</option>
              {supplies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
        )}
        {supply && <Field label={`Amount (${supply.unit})`} htmlFor="le-qty"><Input id="le-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>}
        {type === 'spray' && (
          <Field label="Pre-harvest interval (days)" htmlFor="le-phi" hint="From the label. No harvest here until it’s passed."><Input id="le-phi" type="number" inputMode="numeric" min="0" value={phi} onChange={(e) => setPhi(e.target.value)} /></Field>
        )}
        <Field label="Cost ($)" htmlFor="le-cost"><Input id="le-cost" type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      </div>
      <Field label="Notes" htmlFor="le-notes"><Textarea id="le-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} required={type === 'note'} placeholder={type === 'soil_test' ? 'pH 6.4, N low…' : undefined} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy}>Save</Button>
    </form>
  );
}

/* ---------------- settings ---------------- */

export function EditUnit({ unit }: { unit: { id: string; name: string; area: number | null; restDays: number; grazeDays: number | null; notes: string; active: boolean; grazes: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: unit.name, area: unit.area == null ? '' : String(unit.area), restDays: String(unit.restDays), grazeDays: unit.grazeDays == null ? '' : String(unit.grazeDays), notes: unit.notes, active: unit.active });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send(`/api/land/${unit.id}`, 'PATCH', { name: f.name, area: f.area ? Number(f.area) : null, restDays: Number(f.restDays) || 30, grazeDays: f.grazeDays ? Number(f.grazeDays) : null, notes: f.notes, active: f.active });
    setBusy(false);
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <IconButton label="Edit" onClick={() => setOpen(true)}><Pencil /></IconButton>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Edit">
        <form className={s.form} onSubmit={onSubmit}>
          <Field label="Name" htmlFor="eu-name"><Input id="eu-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} /></Field>
          <div className={s.two}>
            <Field label="Size" htmlFor="eu-area"><Input id="eu-area" type="number" inputMode="decimal" min="0" step="any" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
            {unit.grazes && <Field label="Rest days" htmlFor="eu-rest"><Input id="eu-rest" type="number" inputMode="numeric" min="1" value={f.restDays} onChange={(e) => setF({ ...f, restDays: e.target.value })} /></Field>}
            {unit.grazes && <Field label="Days to graze" htmlFor="eu-graze" hint="Blank = no target. Past this, the group is flagged to move."><Input id="eu-graze" type="number" inputMode="numeric" min="1" value={f.grazeDays} onChange={(e) => setF({ ...f, grazeDays: e.target.value })} /></Field>}
          </div>
          <Field label="Notes" htmlFor="eu-notes"><Textarea id="eu-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <Switch label="In use (turn off to archive)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block loading={busy}>Save</Button>
        </form>
      </Dialog>
    </>
  );
}
