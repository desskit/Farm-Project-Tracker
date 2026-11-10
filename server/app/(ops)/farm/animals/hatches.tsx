'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Egg, Plus } from 'lucide-react';
import { HATCHING, SPECIES } from '@/lib/domain/livestock';
import { fmtDate } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { Banner, Button, Card, Dialog, Field, Input, ListRow, Select, StatusPill } from '@/components/ui';
import s from './animals.module.css';

export type HatchLine = {
  id: string; species: string; label: string; setOn: string; eggsSet: number; fertile: number | null;
  groupId: string | null; next: { label: string; date: string } | null; due: string;
};
type Flock = { id: string; name: string; species: string };

/** Clutches in the incubator: what's next for each, and where the chicks go. */
export function HatchesCard({ hatches, flocks, today, canLog }: { hatches: HatchLine[]; flocks: Flock[]; today: string; canLog: boolean }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<HatchLine | null>(null);
  if (!hatches.length && !canLog) return null;
  if (!hatches.length && !flocks.length) return null;
  return (
    <Card title="Hatching" action={canLog ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Set eggs</Button> : undefined} flush>
      {hatches.length === 0 && <p className={s.cardNote}>Nothing in the incubator. Set eggs to get candling, lockdown and hatch-day reminders.</p>}
      {hatches.map((h) => (
        <ListRow
          key={h.id}
          lead={<Egg />}
          onClick={canLog ? () => setOpen(h) : undefined}
          title={`${h.eggsSet} ${SPECIES[h.species as keyof typeof SPECIES]?.single ?? ''} eggs${h.label ? ` · ${h.label}` : ''}`}
          meta={`Set ${fmtDate(h.setOn)}${h.fertile != null ? ` · ${h.fertile} fertile` : ''}${h.next ? ` · ${h.next.label} ${fmtDate(h.next.date)}` : ''}`}
          trail={<StatusPill tone={h.due < today ? 'overdue' : h.due === today ? 'today' : 'upcoming'}>{h.due < today ? 'Past due' : `Due ${fmtDate(h.due)}`}</StatusPill>}
        />
      ))}
      <Dialog sheet open={adding} onClose={() => setAdding(false)} title="Set eggs">
        {adding && <SetForm flocks={flocks} today={today} onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog sheet open={!!open} onClose={() => setOpen(null)} title="Clutch">
        {open && <ClutchForm hatch={open} flocks={flocks} onDone={() => setOpen(null)} />}
      </Dialog>
    </Card>
  );
}

function SetForm({ flocks, today, onDone }: { flocks: Flock[]; today: string; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const [species, setSpecies] = useState<string>(flocks[0]?.species ?? 'chicken');
  const [groupId, setGroupId] = useState(flocks[0]?.id ?? '');
  const [setOn, setSetOn] = useState(today);
  const [eggs, setEggs] = useState('');
  const [label, setLabel] = useState('');
  const matching = flocks.filter((f) => f.species === species);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await m.run({ url: '/api/animals/hatches', body: { species, setOn, eggsSet: Number(eggs), groupId: matching.some((f) => f.id === groupId) ? groupId : matching[0]?.id ?? null, label }, label: 'Set eggs' });
    if (ok) { onDone(); router.refresh(); }
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Kind">
          <Select value={species} onChange={(e) => setSpecies(e.target.value)}>
            {HATCHING.map((sp) => <option key={sp} value={sp}>{SPECIES[sp].label} ({SPECIES[sp].gestationDays} days)</option>)}
          </Select>
        </Field>
        <Field label="How many eggs"><Input type="number" inputMode="numeric" min="1" value={eggs} onChange={(e) => setEggs(e.target.value)} required /></Field>
      </div>
      <div className={s.two}>
        <Field label="Set on"><Input type="date" max={today} value={setOn} onChange={(e) => setSetOn(e.target.value)} required /></Field>
        <Field label="Name (optional)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Incubator 1" maxLength={60} /></Field>
      </div>
      {matching.length > 1 && (
        <Field label="Chicks will join">
          <Select value={matching.some((f) => f.id === groupId) ? groupId : matching[0].id} onChange={(e) => setGroupId(e.target.value)}>
            {matching.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
      )}
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <div className={s.actions}><Button type="submit" loading={m.busy} disabled={!eggs}>Save</Button></div>
    </form>
  );
}

function ClutchForm({ hatch, flocks, onDone }: { hatch: HatchLine; flocks: Flock[]; onDone: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const matching = flocks.filter((f) => f.species === hatch.species);
  const [fertile, setFertile] = useState(hatch.fertile != null ? String(hatch.fertile) : '');
  const [hatched, setHatched] = useState('');
  const [groupId, setGroupId] = useState(hatch.groupId && matching.some((f) => f.id === hatch.groupId) ? hatch.groupId : matching[0]?.id ?? '');
  async function send(body: Record<string, unknown>, label: string) {
    if (await m.run({ url: `/api/animals/hatches/${hatch.id}`, method: 'PATCH', body, label })) { onDone(); router.refresh(); }
  }
  return (
    <div className={s.form}>
      <p className={s.muted}>{hatch.eggsSet} eggs set {fmtDate(hatch.setOn)} · due {fmtDate(hatch.due)}</p>
      <Field label="Fertile after candling" hint="Take out the clear ones; this is how many stayed in.">
        <div className={s.quickRow}>
          <Input type="number" inputMode="numeric" min="0" max={hatch.eggsSet} value={fertile} onChange={(e) => setFertile(e.target.value)} />
          <Button size="sm" variant="secondary" disabled={fertile === '' || m.busy} onClick={() => send({ fertile: Number(fertile) }, 'Candling result')}>Save</Button>
        </div>
      </Field>
      <Field label="Hatched" hint={matching.length ? 'Adds the chicks to the flock as a birth.' : 'Add a flock of this kind first so the chicks have somewhere to go.'}>
        <div className={s.quickRow}>
          <Input type="number" inputMode="numeric" min="0" max={hatch.eggsSet} value={hatched} onChange={(e) => setHatched(e.target.value)} />
          {matching.length > 1 && (
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Flock">
              {matching.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          )}
          <Button size="sm" disabled={hatched === '' || m.busy || (Number(hatched) > 0 && !groupId)} onClick={() => send({ hatched: Number(hatched), groupId: groupId || null }, 'Hatch')}>Hatched</Button>
        </div>
      </Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <div className={s.actions}><Button variant="ghost" disabled={m.busy} onClick={() => send({ status: 'failed' }, 'Clutch failed')}>None hatched</Button></div>
    </div>
  );
}
