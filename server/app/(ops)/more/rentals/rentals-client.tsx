'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { RENTAL_KIND_LABEL } from '@/lib/domain/rentals';
import { Banner, Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';

export function NewRentalUnitButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', kind: 'house', address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/rentals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not add it.');
    setOpen(false);
    router.push(`/more/rentals/${data.id}`);
  }
  return (
    <>
      <Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>Add</Button>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Add a rental unit">
        <form className={s.form} onSubmit={onSubmit}>
          <div className={s.two}>
            <Field label="Name" htmlFor="ru-name"><Input id="ru-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} placeholder="Farmhouse, Cabin 2" /></Field>
            <Field label="Kind" htmlFor="ru-kind">
              <Select id="ru-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                {Object.entries(RENTAL_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Address" htmlFor="ru-addr"><Input id="ru-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={200} /></Field>
          <Field label="Notes" htmlFor="ru-notes"><Textarea id="ru-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block loading={busy}>Add</Button>
        </form>
      </Dialog>
    </>
  );
}
