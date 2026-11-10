'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import type { ContactKind } from '@/db/schema';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Select, StatusPill, Switch, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../(ops)/farm/animals/animals.module.css';

const KIND: Record<ContactKind, string> = { emergency: 'Emergency', vet: 'Vet', farrier: 'Farrier', supplier: 'Supplier', utility: 'Utility', other: 'Other' };
type Contact = { id: string; name: string; kind: ContactKind; phone: string; email: string; notes: string; showTenants: boolean };
const EMPTY = { name: '', kind: 'other' as ContactKind, phone: '', email: '', notes: '', showTenants: false };

export function ContactList({ contacts, canEdit }: { contacts: Contact[]; canEdit: boolean }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(c: Contact | 'new') {
    setF(c === 'new' ? EMPTY : { name: c.name, kind: c.kind, phone: c.phone, email: c.email, notes: c.notes, showTenants: c.showTenants });
    setError(null);
    setEditing(c);
  }
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(editing === 'new' ? '/api/contacts' : `/api/contacts/${(editing as Contact).id}`, {
      method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not save.');
    setEditing(null);
    router.refresh();
  }
  async function onDelete(c: Contact) {
    if (!(await askConfirm(`Remove ${c.name}?`))) return;
    const res = await fetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <Card action={canEdit ? <Button size="sm" icon={<Plus />} onClick={() => open('new')}>Add</Button> : undefined} flush>
        {contacts.length === 0 ? (
          <EmptyState icon={<Phone />} title="No contacts yet">{canEdit ? 'Add the vet, the farrier, your feed store and who to call in an emergency.' : undefined}</EmptyState>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{c.name}</strong>
                {c.notes && <small>{c.notes}</small>}
                <span className={s.actions}>
                  {c.phone && <a className={s.fileBtn} href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Phone aria-hidden /> {c.phone}</a>}
                  {c.email && <a className={s.fileBtn} href={`mailto:${c.email}`}><Mail aria-hidden /> Email</a>}
                </span>
              </span>
              <StatusPill tone={c.kind === 'emergency' ? 'overdue' : 'neutral'}>{KIND[c.kind]}</StatusPill>
              {canEdit && (
                <>
                  <IconButton label={`Edit ${c.name}`} onClick={() => open(c)}><Pencil /></IconButton>
                  <IconButton label={`Remove ${c.name}`} onClick={() => onDelete(c)}><Trash2 /></IconButton>
                </>
              )}
            </div>
          ))
        )}
      </Card>
      <Dialog sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a contact' : 'Edit contact'}>
        <form className={s.form} onSubmit={onSubmit}>
          <div className={s.two}>
            <Field label="Name" htmlFor="ct-name"><Input id="ct-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={100} /></Field>
            <Field label="Kind" htmlFor="ct-kind">
              <Select id="ct-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ContactKind })}>
                {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Phone" htmlFor="ct-phone"><Input id="ct-phone" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} /></Field>
            <Field label="Email" htmlFor="ct-email"><Input id="ct-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} /></Field>
          </div>
          <Field label="Notes" htmlFor="ct-notes"><Textarea id="ct-notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Hours, account number, what they’re for" /></Field>
          <Switch label="Show to tenants too" hint="e.g. the after-hours plumber" checked={f.showTenants} onChange={(v) => setF({ ...f, showTenants: v })} />
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block loading={busy}>Save</Button>
        </form>
      </Dialog>
    </>
  );
}
