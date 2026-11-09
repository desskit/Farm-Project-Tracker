'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { SPECIES, SPECIES_LIST, PRODUCT_UNIT, type ProductKind, type Species } from '@/lib/domain/livestock';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import s from './animals.module.css';

type Line = { groupId: string; name: string; kind: ProductKind; today: number };

/** Today's eggs / milk in two taps, right from the list. Works offline. */
export function ProductionQuickLog({ lines }: { lines: Line[] }) {
  return (
    <Card title="Log today">
      <div className={s.quick}>
        {lines.map((l) => <QuickLine key={`${l.groupId}-${l.kind}`} line={l} />)}
      </div>
    </Card>
  );
}

function QuickLine({ line }: { line: Line }) {
  const m = useMutation();
  const [amount, setAmount] = useState('');
  const [saved, setSaved] = useState(false);
  const unit = PRODUCT_UNIT[line.kind];
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return;
    setSaved(false);
    if (await m.run({ url: `/api/animals/groups/${line.groupId}/production`, body: { kind: line.kind, amount: n }, label: `${n} ${unit} from ${line.name}` })) {
      setAmount('');
      setSaved(true);
    }
  }
  return (
    <form className={s.quickRow} onSubmit={onSubmit}>
      <span className={s.quickName}>
        <strong>{line.name}</strong>
        <small>{line.kind}{line.today ? ` · ${line.today} ${unit} so far today` : ''}</small>
      </span>
      <Input type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={unit} aria-label={`${line.kind} from ${line.name}`} />
      <Button type="submit" size="sm" loading={m.busy} disabled={!amount}>Log</Button>
      {m.queued && <span className={s.ok}>Saved — will sync</span>}
      {saved && !m.queued && <span className={s.ok}><Check aria-hidden width={14} height={14} /> Logged</span>}
      {m.error && <span className={s.err}>{m.error}</span>}
    </form>
  );
}

export function NewGroupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>Add</Button>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Add animals">
        {open && <GroupForm onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function GroupForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [species, setSpecies] = useState<Species>('chicken');
  const [name, setName] = useState('');
  const [count, setCount] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/animals/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || SPECIES[species].label, species, headCount: Number(count) || 0, location, notes }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not add them.');
    onDone();
    router.push(`/farm/animals/${data.id}`);
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Kind of animal" htmlFor="g-species">
        <Select id="g-species" value={species} onChange={(e) => setSpecies(e.target.value as Species)}>
          {SPECIES_LIST.map((k) => <option key={k} value={k}>{SPECIES[k].label}</option>)}
        </Select>
      </Field>
      <Field label="Name" htmlFor="g-name" hint="e.g. Layers, Milking does, Duke (a group of one)">
        <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={SPECIES[species].label} maxLength={80} />
      </Field>
      <div className={s.two}>
        <Field label="How many" htmlFor="g-count"><Input id="g-count" type="number" inputMode="numeric" min="0" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <Field label="Where" htmlFor="g-loc"><Input id="g-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Coop, north pasture…" maxLength={120} /></Field>
      </div>
      <Field label="Notes" htmlFor="g-notes"><Textarea id="g-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy}>Add</Button>
    </form>
  );
}
