'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { LAND_KINDS, LAND_KIND_LIST, type LandKind } from '@/lib/domain/garden';
import { Banner, Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import s from '../animals/animals.module.css';

type Parent = { id: string; name: string; kind: LandKind };

/** Add a place. With `parent` set it adds a bed / paddock inside it. */
export function NewUnitButton({ parents, parent, label = 'Add' }: { parents?: Parent[]; parent?: Parent; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={parent ? 'ghost' : 'primary'} icon={<Plus />} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title={parent ? `Add a ${LAND_KINDS[parent.kind].child} to ${parent.name}` : 'Add land'}>
        {open && <UnitForm parents={parents ?? []} parent={parent} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function UnitForm({ parents, parent, onDone }: { parents: Parent[]; parent?: Parent; onDone: () => void }) {
  const router = useRouter();
  const fixedKind = parent ? (LAND_KINDS[parent.kind].child as LandKind) : null;
  const [kind, setKind] = useState<LandKind>(fixedKind ?? 'garden');
  const [parentId, setParentId] = useState(parent?.id ?? '');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [restDays, setRestDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsParent = !LAND_KINDS[kind].top;
  const options = needsParent ? parents.filter((p) => LAND_KINDS[p.kind].child === kind) : [];
  const acres = kind === 'pasture' || kind === 'paddock' || kind === 'field' || kind === 'orchard';
  const many = !!fixedKind; // beds and paddocks often come in rows: "Bed 1…6"

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = many ? Math.max(1, Math.min(50, Math.floor(Number(count) || 1))) : 1;
    let firstId: string | null = null;
    for (let i = 1; i <= n; i++) {
      const res = await fetch('/api/land', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, name: n > 1 ? `${name.trim()} ${i}` : name.trim(), parentId: needsParent ? parentId || null : null,
          area: area ? Number(area) : null, areaUnit: acres ? 'acre' : 'sqft', restDays: Number(restDays) || 30, notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return setError(data.error || 'Could not add it.');
      }
      firstId ??= data.id;
    }
    setBusy(false);
    onDone();
    if (parent) router.refresh();
    else router.push(`/farm/land/${firstId}`);
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      {!fixedKind && (
        <Field label="What is it" htmlFor="lu-kind">
          <Select id="lu-kind" value={kind} onChange={(e) => setKind(e.target.value as LandKind)}>
            {LAND_KIND_LIST.filter((k) => LAND_KINDS[k].top || parents.some((p) => LAND_KINDS[p.kind].child === k)).map((k) => <option key={k} value={k}>{LAND_KINDS[k].label}</option>)}
          </Select>
        </Field>
      )}
      {needsParent && !parent && (
        <Field label={kind === 'bed' ? 'In which garden' : 'In which pasture'} htmlFor="lu-parent">
          <Select id="lu-parent" value={parentId} onChange={(e) => setParentId(e.target.value)} required>
            <option value="">Pick one</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
      <div className={s.two}>
        <Field label="Name" htmlFor="lu-name" hint={many ? 'With several, they’re numbered: Bed 1, Bed 2…' : undefined}>
          <Input id="lu-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={70} placeholder={fixedKind === 'bed' ? 'Bed' : fixedKind === 'paddock' ? 'Paddock' : 'Kitchen garden'} />
        </Field>
        {many && <Field label="How many" htmlFor="lu-count"><Input id="lu-count" type="number" inputMode="numeric" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} /></Field>}
        <Field label={`Size (${acres ? 'acres' : 'sq ft'})`} htmlFor="lu-area"><Input id="lu-area" type="number" inputMode="decimal" min="0" step="any" value={area} onChange={(e) => setArea(e.target.value)} /></Field>
        {(kind === 'paddock' || kind === 'pasture' || kind === 'field') && (
          <Field label="Rest between grazings (days)" htmlFor="lu-rest"><Input id="lu-rest" type="number" inputMode="numeric" min="1" value={restDays} onChange={(e) => setRestDays(e.target.value)} /></Field>
        )}
      </div>
      <Field label="Notes" htmlFor="lu-notes"><Textarea id="lu-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy}>Add</Button>
    </form>
  );
}
