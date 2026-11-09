'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Plus, Trash2, Users } from 'lucide-react';
import type { VaultGroupView } from '@/lib/data/vault';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Stack } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../vault.module.css';

type Person = { id: string; name: string; role: string };

export function GroupsView({ groups, people, isSystemAdmin }: { groups: VaultGroupView[]; people: Person[]; isSystemAdmin: boolean }) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const [editing, setEditing] = useState<VaultGroupView | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  async function remove(g: VaultGroupView) {
    if (!(await askConfirm(`Delete the group “${g.name}”? Entries shared only with it become visible to their owner only.`))) return;
    const res = await fetch(`/api/vault/groups/${g.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setErr((await res.json().catch(() => ({}))).error || 'Could not delete.');
  }

  return (
    <Stack gap={16}>
      <div><Button icon={<Plus />} onClick={() => setEditing('new')}>New group</Button></div>
      {err && <Banner tone="danger">{err}</Banner>}
      <Card flush>
        {groups.length === 0 ? (
          <EmptyState icon={<Users />} title="No groups yet">Make groups like “Family”, “Crew” or “Shop logins”, then people can share with them.</EmptyState>
        ) : (
          groups.map((g) => (
            <article key={g.id} className={s.entry}>
              <div className={s.entryHead}>
                <span className={s.icon}><Users aria-hidden /></span>
                <div className={s.entryMain}>
                  <strong className={s.title}>{g.name}</strong>
                  {g.description && <span className={s.meta}>{g.description}</span>}
                  <span className={s.meta}>{g.memberIds.length ? g.memberIds.map((id) => nameById.get(id) ?? 'Someone').join(', ') : 'No members'}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Edit</Button>
                <IconButton label={`Delete ${g.name}`} onClick={() => remove(g)}><Trash2 /></IconButton>
              </div>
            </article>
          ))
        )}
      </Card>
      {isSystemAdmin && <RecoveryKey />}
      <Dialog sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New group' : 'Edit group'}>
        {editing && <GroupForm group={editing === 'new' ? null : editing} people={people} onDone={() => setEditing(null)} />}
      </Dialog>
    </Stack>
  );
}

function GroupForm({ group, people, onDone }: { group: VaultGroupView | null; people: Person[]; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch(group ? `/api/vault/groups/${group.id}` : '/api/vault/groups', {
      method: group ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, memberIds: members }),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error || 'Could not save.');
    onDone();
    router.refresh();
  }
  return (
    <form onSubmit={submit}>
      <Stack>
        <Field label="Name" htmlFor="g-name"><Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="e.g. Family" /></Field>
        <Field label="Description (optional)" htmlFor="g-desc"><Input id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></Field>
        <fieldset className={s.groups}>
          <legend className={s.label}>Members</legend>
          {people.map((p) => (
            <label key={p.id} className={s.groupOpt}>
              <input type="checkbox" checked={members.includes(p.id)} onChange={(e) => setMembers((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))} />
              {p.name} <span className={s.meta}>{p.role}</span>
            </label>
          ))}
        </fieldset>
        {err && <Banner tone="danger">{err}</Banner>}
        <Button type="submit" block loading={busy}>Save group</Button>
      </Stack>
    </form>
  );
}

/** Lets an admin keep a copy of the vault key somewhere safe (password manager, printed in a safe). */
function RecoveryKey() {
  const [key, setKey] = useState<{ key: string; fingerprint: string; file: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function show() {
    setErr(null);
    const res = await fetch('/api/admin/vault-key', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setKey(data);
    else setErr(data.error || 'Could not load the key.');
  }
  return (
    <Card title={<span className={s.meta}><KeyRound aria-hidden /> Recovery key</span>}>
      <Stack>
        <p className={s.meta}>
          Everything in the vault is encrypted with this key, which is kept on the server outside the nightly backups. If the
          server&apos;s disk is lost and only a backup survives, the vault can only be opened with a copy of this key. Keep one
          somewhere safe and offline.
        </p>
        {!key ? (
          <div><Button variant="secondary" onClick={show}>Show recovery key</Button></div>
        ) : (
          <>
            <code className={s.value}>{key.key}</code>
            <p className={s.meta}>Fingerprint {key.fingerprint}{key.file ? ` · stored at ${key.file}` : ' · set by VAULT_KEY'}. To restore, put the key back in that file (or VAULT_KEY in .env).</p>
            <div><Button variant="ghost" onClick={() => setKey(null)}>Hide</Button></div>
          </>
        )}
        {err && <Banner tone="danger">{err}</Banner>}
      </Stack>
    </Card>
  );
}
