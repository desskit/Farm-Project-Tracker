'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import type { AppointmentView } from '@/lib/data/appointments';
import { fmtDate } from '@/lib/domain/dates';
import { useMutation } from '@/lib/client/mutate';
import { useDialogs } from '@/components/ui/dialogs';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Select, StatusPill, Textarea } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';

type Opt = { id: string; label: string };
type AboutOpt = { value: string; label: string; group: string };

function when(a: { date: string; time: string }) {
  if (!a.time) return fmtDate(a.date);
  const [h, m] = a.time.split(':').map(Number);
  return `${fmtDate(a.date)}, ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export function AppointmentsView({ upcoming, recent, canAdd, today, contacts, about, people, rentalsOnly }: {
  upcoming: AppointmentView[]; recent: AppointmentView[]; canAdd: boolean; today: string; contacts: Opt[]; about: AboutOpt[]; people: { id: string; name: string }[]; rentalsOnly: boolean;
}) {
  const [editing, setEditing] = useState<AppointmentView | 'new' | null>(null);
  return (
    <>
      <Card title="Coming up" action={canAdd ? <Button size="sm" icon={<Plus />} onClick={() => setEditing('new')}>Add</Button> : undefined} flush>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title="Nothing booked">{canAdd ? 'Add the vet, farrier or an inspector’s visit, and who to remind the day before.' : undefined}</EmptyState>
        ) : upcoming.map((a) => <Row key={a.id} a={a} today={today} onEdit={() => setEditing(a)} />)}
      </Card>
      {recent.length > 0 && (
        <Card title="Recent" flush>
          {recent.map((a) => <Row key={a.id} a={a} today={today} onEdit={() => setEditing(a)} />)}
        </Card>
      )}
      <Dialog sheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add an appointment' : 'Appointment'}>
        {editing && <AppointmentForm a={editing === 'new' ? null : editing} today={today} contacts={contacts} about={about} people={people} rentalsOnly={rentalsOnly} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function Row({ a, today, onEdit }: { a: AppointmentView; today: string; onEdit: () => void }) {
  const router = useRouter();
  const m = useMutation();
  const past = a.date < today;
  return (
    <div className={s.event}>
      <span className={s.eventMain}>
        <strong>{a.title}</strong>
        <small>{[when(a), a.contactName, a.linkLabel, a.notes].filter(Boolean).join(' · ')}</small>
      </span>
      {a.status !== 'scheduled' && <StatusPill tone={a.status === 'done' ? 'done' : 'neutral'}>{a.status === 'done' ? 'Done' : 'Cancelled'}</StatusPill>}
      {a.contactPhone && <a href={`tel:${a.contactPhone.replace(/[^\d+]/g, '')}`} className={s.rowLink} aria-label={`Call ${a.contactName}`}><Phone aria-hidden width={20} height={20} /></a>}
      {a.canEdit && a.status === 'scheduled' && past && (
        <Button size="sm" variant="secondary" icon={<Check />} loading={m.busy} onClick={async () => { if (await m.run({ url: `/api/appointments/${a.id}`, method: 'PATCH', body: { status: 'done' }, label: 'Done' })) router.refresh(); }}>Done</Button>
      )}
      {a.canEdit && <IconButton label={`Edit ${a.title}`} onClick={onEdit}><Pencil /></IconButton>}
    </div>
  );
}

function AppointmentForm({ a, today, contacts, about, people, rentalsOnly, onDone }: {
  a: AppointmentView | null; today: string; contacts: Opt[]; about: AboutOpt[]; people: { id: string; name: string }[]; rentalsOnly: boolean; onDone: () => void;
}) {
  const router = useRouter();
  const m = useMutation();
  const { confirm: askConfirm } = useDialogs();
  const [f, setF] = useState({
    title: a?.title ?? '', date: a?.date ?? today, time: a?.time ?? '', contactId: a?.contactId ?? '', about: a?.linkType && a.linkId ? `${a.linkType}:${a.linkId}` : '', notes: a?.notes ?? '',
  });
  const [who, setWho] = useState<string[]>(a?.people ?? []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const groups = [...new Set(about.map((x) => x.group))];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const [linkType, linkId] = f.about ? f.about.split(':') : [null, null];
    const body = { title: f.title, date: f.date, time: f.time, contactId: f.contactId || null, linkType, linkId, notes: f.notes, people: who };
    const ok = await m.run({ url: a ? `/api/appointments/${a.id}` : '/api/appointments', method: a ? 'PATCH' : 'POST', body, label: 'Appointment' });
    if (ok) { onDone(); router.refresh(); }
  }
  async function cancelIt() {
    if (!a || !(await askConfirm(`Cancel “${a.title}”?`))) return;
    if (await m.run({ url: `/api/appointments/${a.id}`, method: 'PATCH', body: { status: 'cancelled' }, label: 'Cancelled' })) { onDone(); router.refresh(); }
  }
  async function remove() {
    if (!a || !(await askConfirm(`Delete “${a.title}”?`))) return;
    if (await m.run({ url: `/api/appointments/${a.id}`, method: 'DELETE', label: 'Deleted' })) { onDone(); router.refresh(); }
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="What" htmlFor="ap-title"><Input id="ap-title" value={f.title} onChange={set('title')} required maxLength={120} placeholder="Farrier, hoof trims" /></Field>
      <div className={s.two}>
        <Field label="Day" htmlFor="ap-date"><Input id="ap-date" type="date" value={f.date} onChange={set('date')} required /></Field>
        <Field label="Time (optional)" htmlFor="ap-time"><Input id="ap-time" type="time" value={f.time} onChange={set('time')} /></Field>
      </div>
      {contacts.length > 0 && (
        <Field label="With (from Contacts)" htmlFor="ap-contact">
          <Select id="ap-contact" value={f.contactId} onChange={set('contactId')}>
            <option value="">Nobody in particular</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
      )}
      {about.length > 0 && (
        <Field label="About" htmlFor="ap-about" hint={rentalsOnly ? 'You can add visits to rental units.' : 'It shows on that page too. A rental-unit visit reminds its tenants.'}>
          <Select id="ap-about" value={f.about} onChange={set('about')} required={rentalsOnly}>
            <option value="">{rentalsOnly ? 'Pick a unit' : 'The farm in general'}</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>{about.filter((x) => x.group === g).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
            ))}
          </Select>
        </Field>
      )}
      {people.length > 0 && (
        <fieldset className={s.form}>
          <legend className={s.muted}>Remind the day before</legend>
          <div className={s.pills}>
            {people.map((p) => (
              <Button key={p.id} size="sm" variant={who.includes(p.id) ? 'primary' : 'secondary'} aria-pressed={who.includes(p.id)} onClick={() => setWho(who.includes(p.id) ? who.filter((x) => x !== p.id) : [...who, p.id])}>{p.name}</Button>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notes" htmlFor="ap-notes"><Textarea id="ap-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Gate code, which animals, what to have ready" /></Field>
      {m.error && <Banner tone="danger">{m.error}</Banner>}
      <Button type="submit" block loading={m.busy}>Save</Button>
      {a && a.status === 'scheduled' && <Button variant="ghost" onClick={cancelIt} disabled={m.busy}>Cancel the appointment</Button>}
      {a && <Button variant="ghost" icon={<Trash2 />} onClick={remove} disabled={m.busy}>Delete</Button>}
    </form>
  );
}
