'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Baby, HeartPulse, Pencil, Plus, Repeat, Scale, Skull, StickyNote, Syringe, Tag, Trash2, Truck, Wallet } from 'lucide-react';
import type { AnimalRow, EventView } from '@/lib/data/livestock';
import type { BreedingStatus } from '@/db/schema';
import { EVENT_LABEL, PRODUCT_UNIT, weekTrend, type AnimalEventType, type ProductKind } from '@/lib/domain/livestock';
import { addDays, fmtDate } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, ListRow, Segmented, Select, StatusPill, Switch, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../animals.module.css';

type Opt = { id: string; label: string };

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error || 'Something went wrong.';
}
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/* ---------------- production ---------------- */

export function ProductionCard({
  groupId, products, daily, from, today, canLog,
}: { groupId: string; products: ProductKind[]; daily: { kind: ProductKind; date: string; amount: number }[]; from: string; today: string; canLog: boolean }) {
  const [kind, setKind] = useState<ProductKind>(products[0]);
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(from, i)), [from]);
  const mine = daily.filter((d) => d.kind === kind);
  const byDate = new Map(mine.map((d) => [d.date, d.amount]));
  const max = Math.max(1, ...mine.map((d) => d.amount));
  const trend = weekTrend(mine, today);
  const unit = PRODUCT_UNIT[kind];

  const m = useMutation();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return;
    if (await m.run({ url: `/api/animals/groups/${groupId}/production`, body: { kind, amount: n, date }, label: `${n} ${unit}` })) setAmount('');
  }

  return (
    <Card title="Production">
      <div className={s.form}>
        {products.length > 1 && <Segmented label="Product" value={kind} onChange={setKind} options={products.map((p) => ({ value: p, label: p }))} />}
        <div className={s.trend}>
          <span><strong>{trend.thisWeek}</strong> {unit} this week</span>
          <span className={s.muted}>{trend.lastWeek} last week</span>
          {trend.pct != null && <span className={trend.pct >= 0 ? s.up : s.down}>{trend.pct >= 0 ? '+' : ''}{trend.pct}%</span>}
        </div>
        <div>
          <svg className={s.chart} viewBox="0 0 300 72" preserveAspectRatio="none" role="img" aria-label={`${kind} per day, last 30 days`}>
            {days.map((d, i) => {
              const v = byDate.get(d) ?? 0;
              const h = v ? Math.max(2, (v / max) * 70) : 0;
              return (
                <rect key={d} x={i * 10 + 1} y={72 - h} width={8} height={h} rx={1.5} className={d === today ? s.today : undefined}>
                  <title>{`${fmtDate(d)}: ${v} ${unit}`}</title>
                </rect>
              );
            })}
          </svg>
          <div className={s.chartAxis}><span>{fmtDate(from)}</span><span>Today</span></div>
        </div>
        {canLog && (
          <form className={s.quickRow} onSubmit={onSubmit}>
            <Input type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={unit} aria-label={`How many ${unit}`} />
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <Button type="submit" size="sm" loading={m.busy} disabled={!amount}>Log {kind}</Button>
            {m.queued && <span className={s.ok}>Saved — will sync</span>}
            {m.error && <span className={s.err}>{m.error}</span>}
          </form>
        )}
      </div>
    </Card>
  );
}

/* ---------------- logging events ---------------- */

type Supply = { id: string; name: string; unit: string; qty: number; meatDays: number | null; milkDays: number | null };

const LOG_ICON: Record<AnimalEventType, JSX.Element> = {
  treatment: <HeartPulse />, vaccination: <Syringe />, weight: <Scale />, birth: <Baby />,
  death: <Skull />, sale: <Wallet />, purchase: <Truck />, note: <StickyNote />,
};

export function LogCard({
  groupId, animals, supplies, breedings, canManage, today,
}: { groupId: string; animals: (Opt & { sex: string })[]; supplies: Supply[]; breedings: Opt[]; canManage: boolean; today: string }) {
  const [type, setType] = useState<AnimalEventType | null>(null);
  const types: AnimalEventType[] = ['treatment', 'vaccination', 'weight', 'birth', 'death', 'note', ...(canManage ? (['purchase', 'sale'] as const) : [])];
  return (
    <Card title="Log">
      <div className={s.logGrid}>
        {types.map((t) => <Button key={t} variant="secondary" icon={LOG_ICON[t]} onClick={() => setType(t)}>{EVENT_LABEL[t]}</Button>)}
      </div>
      <Dialog sheet open={type !== null} onClose={() => setType(null)} title={type ? EVENT_LABEL[type] : ''}>
        {type && <EventForm key={type} type={type} groupId={groupId} animals={animals} supplies={supplies} breedings={breedings} today={today} onDone={() => setType(null)} />}
      </Dialog>
    </Card>
  );
}

function EventForm({
  type, groupId, animals, supplies, breedings, today, onDone,
}: { type: AnimalEventType; groupId: string; animals: (Opt & { sex: string })[]; supplies: Supply[]; breedings: Opt[]; today: string; onDone: () => void }) {
  const m = useMutation();
  const [date, setDate] = useState(today);
  const [animalId, setAnimalId] = useState('');
  const [count, setCount] = useState('1');
  const [supplyId, setSupplyId] = useState('');
  const [qty, setQty] = useState('');
  const [meatDays, setMeatDays] = useState('');
  const [milkDays, setMilkDays] = useState('');
  const [weight, setWeight] = useState('');
  const [cost, setCost] = useState('');
  const [breedingId, setBreedingId] = useState('');
  const [notes, setNotes] = useState('');

  const treat = type === 'treatment' || type === 'vaccination';
  const changesCount = type === 'birth' || type === 'death' || type === 'sale' || type === 'purchase';
  const pickAnimal = type !== 'purchase' && animals.length > 0;
  const showCount = changesCount && (type === 'birth' || !animalId);
  const supply = supplies.find((x) => x.id === supplyId);

  function onSupply(id: string) {
    setSupplyId(id);
    const x = supplies.find((y) => y.id === id);
    setMeatDays(x?.meatDays != null ? String(x.meatDays) : '');
    setMilkDays(x?.milkDays != null ? String(x.milkDays) : '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { type, date, notes };
    if (pickAnimal && animalId) body.animalId = animalId;
    if (showCount) body.count = Math.max(1, Math.floor(Number(count) || 1));
    if (treat && supplyId) {
      body.inventoryId = supplyId;
      body.qtyUsed = numOrNull(qty);
    }
    if (treat) {
      body.meatDays = numOrNull(meatDays);
      body.milkDays = numOrNull(milkDays);
    }
    if (type === 'weight') body.weight = numOrNull(weight);
    if (cost.trim()) body.cost = Number(cost);
    if (type === 'birth' && breedingId) body.breedingId = breedingId;
    if (await m.run({ url: `/api/animals/groups/${groupId}/events`, body, label: EVENT_LABEL[type] })) onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Date" htmlFor="ev-date"><Input id="ev-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></Field>
        {pickAnimal && (
          <Field label={type === 'birth' ? 'Mother' : 'Which animal'} htmlFor="ev-animal">
            <Select id="ev-animal" value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
              <option value="">{type === 'birth' ? 'Not recorded' : changesCount ? 'One without its own record' : 'The whole group'}</option>
              {animals.filter((a) => type !== 'birth' || a.sex !== 'male').map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
        )}
        {showCount && (
          <Field label={type === 'birth' ? 'How many born' : 'How many'} htmlFor="ev-count">
            <Input id="ev-count" type="number" inputMode="numeric" min="1" value={count} onChange={(e) => setCount(e.target.value)} required />
          </Field>
        )}
        {type === 'birth' && breedings.length > 0 && (
          <Field label="From breeding" htmlFor="ev-br">
            <Select id="ev-br" value={breedingId} onChange={(e) => setBreedingId(e.target.value)}>
              <option value="">—</option>
              {breedings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
        )}
        {type === 'weight' && (
          <Field label="Weight (lb)" htmlFor="ev-w"><Input id="ev-w" type="number" inputMode="decimal" min="0" step="any" value={weight} onChange={(e) => setWeight(e.target.value)} required /></Field>
        )}
      </div>

      {treat && (
        <>
          <div className={s.two}>
            <Field label="Product used" htmlFor="ev-sup" hint={supply ? `${supply.qty} ${supply.unit} on hand` : 'Taken off Supplies'}>
              <Select id="ev-sup" value={supplyId} onChange={(e) => onSupply(e.target.value)}>
                <option value="">None / not tracked</option>
                {supplies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
            {supply && (
              <Field label={`Amount (${supply.unit})`} htmlFor="ev-qty"><Input id="ev-qty" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            )}
          </div>
          <div className={s.two}>
            <Field label="Meat withdrawal (days)" htmlFor="ev-meat"><Input id="ev-meat" type="number" inputMode="numeric" min="0" value={meatDays} onChange={(e) => setMeatDays(e.target.value)} placeholder="0" /></Field>
            <Field label="Milk / egg withdrawal (days)" htmlFor="ev-milk"><Input id="ev-milk" type="number" inputMode="numeric" min="0" value={milkDays} onChange={(e) => setMilkDays(e.target.value)} placeholder="0" /></Field>
          </div>
        </>
      )}

      {(treat || type === 'sale' || type === 'purchase') && (
        <Field label={type === 'sale' ? 'Sold for ($)' : 'Cost ($)'} htmlFor="ev-cost"><Input id="ev-cost" type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
      )}
      <Field label="Notes" htmlFor="ev-notes"><Textarea id="ev-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === 'note' ? 'What happened?' : undefined} required={type === 'note'} /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      {m.queued && <Banner tone="ok">Saved — it’ll sync when you’re back online.</Banner>}
      <Button type="submit" block loading={m.busy}>Save</Button>
    </form>
  );
}

/* ---------------- care chores ---------------- */

const CARE_SCHEDULES = {
  daily: 'Every day',
  every2: 'Every 2 days',
  weekly: 'Every week',
  monthly: 'Every month',
} as const;

export function CareCard({ groupId, groupName, chores, canAdd }: { groupId: string; groupName: string; chores: { id: string; name: string; nextDue: string }[]; canAdd: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [every, setEvery] = useState<keyof typeof CARE_SCHEDULES>('daily');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canAdd && chores.length === 0) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const now = new Date();
    const schedule =
      every === 'daily' ? { type: 'daily' }
        : every === 'every2' ? { type: 'everyNDays', n: 2 }
          : every === 'weekly' ? { type: 'weekly', weekdays: [now.getDay()] }
            : { type: 'monthly', day: Math.min(28, now.getDate()) };
    const err = await send('/api/chores', 'POST', { name: name.trim(), schedule, open: true, link: { type: 'animal_group', id: groupId } });
    setBusy(false);
    if (err) return setError(err);
    setName('');
    setAdding(false);
    router.refresh();
  }

  return (
    <Card title="Care chores" action={canAdd && !adding ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Add</Button> : undefined} flush={!adding}>
      {adding ? (
        <form className={s.form} onSubmit={onSubmit}>
          <Field label="Chore" htmlFor="care-name"><Input id="care-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Feed & water ${groupName}`} required maxLength={120} /></Field>
          <Field label="How often" htmlFor="care-every">
            <Select id="care-every" value={every} onChange={(e) => setEvery(e.target.value as keyof typeof CARE_SCHEDULES)}>
              {Object.entries(CARE_SCHEDULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <p className={s.muted}>It goes on the chore list, up for grabs; assign it from there if you like.</p>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className={s.actions}>
            <Button type="submit" loading={busy}>Add chore</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      ) : chores.length === 0 ? (
        <EmptyState icon={<Repeat />} title="No care chores">Feeding, water, mucking out — add them here and they repeat on their own.</EmptyState>
      ) : (
        chores.map((c) => <ListRow key={c.id} href={`/chores/${c.id}`} lead={<Repeat />} title={c.name} meta={`Next ${fmtDate(c.nextDue)}`} />)
      )}
    </Card>
  );
}

/* ---------------- individual animals ---------------- */

function age(birth: string | null): string | null {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`);
  const now = new Date();
  const months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth() - (now.getDate() < b.getDate() ? 1 : 0);
  if (months < 1) return 'newborn';
  if (months < 24) return `${months} mo`;
  return `${Math.floor(months / 12)} yr`;
}

export function AnimalsCard({ groupId, animals, groups, canManage }: { groupId: string; animals: AnimalRow[]; groups: { id: string; name: string }[]; canManage: boolean }) {
  const [editing, setEditing] = useState<AnimalRow | 'new' | null>(null);
  if (!canManage && animals.length === 0) return null;
  const label = (a: AnimalRow) => a.name || `#${a.tag}`;
  return (
    <Card title={`Individual records${animals.length ? ` (${animals.filter((a) => a.status === 'active').length})` : ''}`} action={canManage ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setEditing('new')}>Add</Button> : undefined} flush>
      {animals.length === 0 ? (
        <EmptyState icon={<Tag />} title="No individual records">Optional — give a name or tag to the animals you track one by one.</EmptyState>
      ) : (
        animals.map((a) => (
          <ListRow
            key={a.id}
            lead={<Tag />}
            title={a.name && a.tag ? `${a.name} · #${a.tag}` : label(a)}
            meta={[a.sex !== 'unknown' ? a.sex : '', a.breed, age(a.birthDate)].filter(Boolean).join(' · ') || undefined}
            trail={a.status !== 'active' ? <StatusPill tone="neutral">{a.status}</StatusPill> : undefined}
            onClick={canManage ? () => setEditing(a) : undefined}
          />
        ))
      )}
      <Dialog sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add an animal record' : editing ? `Edit ${label(editing)}` : ''}>
        {editing && (
          <AnimalForm
            groupId={groupId}
            animal={editing === 'new' ? null : editing}
            others={animals.filter((a) => editing === 'new' || a.id !== editing.id)}
            groups={groups.map((g) => ({ id: g.id, label: g.name }))}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </Card>
  );
}

function AnimalForm({ groupId, animal, others, groups, onDone }: { groupId: string; animal: AnimalRow | null; others: AnimalRow[]; groups: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: animal?.name ?? '', tag: animal?.tag ?? '', sex: animal?.sex ?? 'unknown', breed: animal?.breed ?? '',
    birthDate: animal?.birthDate ?? '', damId: animal?.damId ?? '', sireId: animal?.sireId ?? '', notes: animal?.notes ?? '',
    groupId: animal?.groupId ?? groupId, arrived: 'existing',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const label = (a: AnimalRow) => a.name || `#${a.tag}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const base = { name: f.name, tag: f.tag, sex: f.sex, breed: f.breed, birthDate: f.birthDate || null, damId: f.damId || null, sireId: f.sireId || null, notes: f.notes };
    const err = animal
      ? await send(`/api/animals/${animal.id}`, 'PATCH', { ...base, ...(f.groupId !== animal.groupId ? { groupId: f.groupId } : {}) })
      : await send(`/api/animals/groups/${groupId}/animals`, 'POST', { ...base, arrived: f.arrived });
    setBusy(false);
    if (err) return setError(err);
    onDone();
    router.refresh();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Name" htmlFor="an-name"><Input id="an-name" value={f.name} onChange={set('name')} maxLength={80} /></Field>
        <Field label="Tag / ID" htmlFor="an-tag"><Input id="an-tag" value={f.tag} onChange={set('tag')} maxLength={40} /></Field>
        <Field label="Sex" htmlFor="an-sex">
          <Select id="an-sex" value={f.sex} onChange={set('sex')}>
            <option value="unknown">Not set</option><option value="female">Female</option><option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Breed" htmlFor="an-breed"><Input id="an-breed" value={f.breed} onChange={set('breed')} maxLength={80} /></Field>
        <Field label="Born" htmlFor="an-born"><Input id="an-born" type="date" value={f.birthDate} onChange={set('birthDate')} /></Field>
        {others.length > 0 && (
          <>
            <Field label="Mother" htmlFor="an-dam">
              <Select id="an-dam" value={f.damId} onChange={set('damId')}>
                <option value="">—</option>
                {others.filter((a) => a.sex !== 'male').map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </Select>
            </Field>
            <Field label="Father" htmlFor="an-sire">
              <Select id="an-sire" value={f.sireId} onChange={set('sireId')}>
                <option value="">—</option>
                {others.filter((a) => a.sex !== 'female').map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </Select>
            </Field>
          </>
        )}
      </div>
      {animal ? (
        groups.length > 1 && (
          <Field label="Group" htmlFor="an-group" hint="Moving a living animal moves one head to the other group.">
            <Select id="an-group" value={f.groupId} onChange={set('groupId')}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </Select>
          </Field>
        )
      ) : (
        <Field label="Is it already in the head count?" htmlFor="an-arrived">
          <Select id="an-arrived" value={f.arrived} onChange={set('arrived')}>
            <option value="existing">Yes, it’s already counted</option>
            <option value="born">No, just born (adds one)</option>
            <option value="bought">No, just bought (adds one)</option>
          </Select>
        </Field>
      )}
      <Field label="Notes" htmlFor="an-notes"><Textarea id="an-notes" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy}>Save</Button>
    </form>
  );
}

/* ---------------- breeding ---------------- */

type Breeding = { id: string; damName: string | null; sire: string; bredOn: string; dueOn: string | null; status: BreedingStatus };
const BREEDING_TONE: Record<BreedingStatus, 'upcoming' | 'today' | 'done' | 'neutral'> = { bred: 'upcoming', confirmed: 'today', born: 'done', failed: 'neutral' };
const BREEDING_LABEL: Record<BreedingStatus, string> = { bred: 'Bred', confirmed: 'Confirmed', born: 'Born', failed: 'Didn’t take' };

export function BreedingCard({
  groupId, breedings, dams, canManage, gestationDays, today,
}: { groupId: string; breedings: Breeding[]; dams: Opt[]; canManage: boolean; gestationDays: number; today: string }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [adding, setAdding] = useState(false);
  const [damId, setDamId] = useState('');
  const [sire, setSire] = useState('');
  const [bredOn, setBredOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(p: Promise<string | null>) {
    setError(null);
    const err = await p;
    if (err) setError(err);
    else router.refresh();
  }
  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send(`/api/animals/groups/${groupId}/breedings`, 'POST', { damId: damId || null, sire, bredOn });
    setBusy(false);
    if (err) return setError(err);
    setAdding(false);
    setSire('');
    router.refresh();
  }

  return (
    <Card title="Breeding" action={canManage && !adding ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Add</Button> : undefined}>
      <div className={s.form}>
        {adding && (
          <form className={s.form} onSubmit={onAdd}>
            <div className={s.two}>
              {dams.length > 0 && (
                <Field label="Mother" htmlFor="br-dam">
                  <Select id="br-dam" value={damId} onChange={(e) => setDamId(e.target.value)}>
                    <option value="">Not recorded</option>
                    {dams.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Sire" htmlFor="br-sire"><Input id="br-sire" value={sire} onChange={(e) => setSire(e.target.value)} maxLength={80} /></Field>
              <Field label="Bred on" htmlFor="br-on"><Input id="br-on" type="date" value={bredOn} max={today} onChange={(e) => setBredOn(e.target.value)} required /></Field>
            </div>
            <p className={s.muted}>Due around {fmtDate(addDays(bredOn || today, gestationDays))} ({gestationDays} days).</p>
            <div className={s.actions}>
              <Button type="submit" loading={busy}>Save</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        )}
        {breedings.length === 0 && !adding && <p className={s.muted}>Nothing recorded. Add one and the due date shows on Today and the calendar.</p>}
        {breedings.map((b) => (
          <div key={b.id} className={s.event}>
            <span className={s.eventMain}>
              <strong>{b.damName ?? 'Bred'}{b.sire ? ` × ${b.sire}` : ''}</strong>
              <small>Bred {fmtDate(b.bredOn)}{b.dueOn ? ` · due around ${fmtDate(b.dueOn)}` : ''}</small>
            </span>
            <StatusPill tone={b.status === 'bred' && b.dueOn && b.dueOn <= addDays(today, 7) ? 'today' : BREEDING_TONE[b.status]}>{BREEDING_LABEL[b.status]}</StatusPill>
            {canManage && (b.status === 'bred' || b.status === 'confirmed') && (
              <span className={s.actions}>
                {b.status === 'bred' && <Button size="sm" variant="ghost" onClick={() => act(send(`/api/animals/breedings/${b.id}`, 'PATCH', { status: 'confirmed' }))}>Confirm</Button>}
                <Button size="sm" variant="ghost" onClick={() => act(send(`/api/animals/breedings/${b.id}`, 'PATCH', { status: 'failed' }))}>Didn’t take</Button>
              </span>
            )}
            {canManage && (
              <IconButton label="Delete breeding" onClick={async () => { if (await askConfirm('Delete this breeding record?')) act(send(`/api/animals/breedings/${b.id}`, 'DELETE')); }}><Trash2 /></IconButton>
            )}
          </div>
        ))}
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </Card>
  );
}

/* ---------------- history ---------------- */

function describe(e: EventView): string {
  const bits: string[] = [];
  if (e.animalName) bits.push(e.animalName);
  if (e.countDelta) bits.push(`${e.countDelta > 0 ? '+' : ''}${e.countDelta} head`);
  if (e.supplyName && e.qtyUsed) bits.push(`${e.qtyUsed} ${e.supplyUnit ?? ''} ${e.supplyName}`.replace(/\s+/g, ' '));
  if (e.weight) bits.push(`${e.weight} lb`);
  if (e.cost) bits.push(`$${e.cost.toFixed(2)}`);
  if (e.milkUntil) bits.push(`milk/eggs from ${fmtDate(e.milkUntil)}`);
  if (e.meatUntil) bits.push(`meat from ${fmtDate(e.meatUntil)}`);
  return bits.join(' · ');
}

export function HistoryCard({ events, canManage }: { events: EventView[]; canManage: boolean }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [error, setError] = useState<string | null>(null);
  async function onDelete(e: EventView) {
    if (!(await askConfirm(`Remove this ${EVENT_LABEL[e.type].toLowerCase()} entry?${e.countDelta ? ' The head count goes back too.' : ''}${e.qtyUsed ? ' Supplies used aren’t put back.' : ''}`))) return;
    const err = await send(`/api/animals/events/${e.id}`, 'DELETE');
    if (err) setError(err);
    else router.refresh();
  }
  return (
    <Card title="History" flush>
      {events.length === 0 ? (
        <EmptyState icon={<StickyNote />} title="Nothing logged yet" />
      ) : (
        events.map((e) => (
          <div key={e.id} className={s.event}>
            <span className={s.eventMain}>
              <strong>{EVENT_LABEL[e.type]}{describe(e) ? ` — ${describe(e)}` : ''}</strong>
              {e.notes && <span>{e.notes}</span>}
              <small>{fmtDate(e.date)}{e.userName ? ` · ${e.userName}` : ''}</small>
            </span>
            {canManage && <IconButton label="Remove entry" onClick={() => onDelete(e)}><Trash2 /></IconButton>}
          </div>
        ))
      )}
      {error && <Banner tone="danger">{error}</Banner>}
    </Card>
  );
}

/* ---------------- group settings ---------------- */

export function GroupSettings({ group }: { group: { id: string; name: string; location: string; notes: string; headCount: number; active: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: group.name, location: group.location, notes: group.notes, headCount: String(group.headCount), active: group.active });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await send(`/api/animals/groups/${group.id}`, 'PATCH', { name: f.name, location: f.location, notes: f.notes, headCount: Math.max(0, Math.floor(Number(f.headCount) || 0)), active: f.active });
    setBusy(false);
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <IconButton label="Edit group" onClick={() => setOpen(true)}><Pencil /></IconButton>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Edit group">
        <form className={s.form} onSubmit={onSubmit}>
          <Field label="Name" htmlFor="gs-name"><Input id="gs-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} /></Field>
          <div className={s.two}>
            <Field label="Where" htmlFor="gs-loc"><Input id="gs-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={120} /></Field>
            <Field label="Head count" htmlFor="gs-count" hint="A recount; births, deaths and sales change it on their own."><Input id="gs-count" type="number" inputMode="numeric" min="0" value={f.headCount} onChange={(e) => setF({ ...f, headCount: e.target.value })} /></Field>
          </div>
          <Field label="Notes" htmlFor="gs-notes"><Textarea id="gs-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <Switch label="Active (turn off to archive, e.g. after the last one is sold)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block loading={busy}>Save</Button>
        </form>
      </Dialog>
    </>
  );
}
