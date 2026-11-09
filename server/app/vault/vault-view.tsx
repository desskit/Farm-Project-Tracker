'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, EyeOff, History, KeyRound, Lock, Pencil, Plus, Search, Trash2, Wand2 } from 'lucide-react';
import type { VaultEntryView } from '@/lib/data/vault';
import type { VaultVisibility } from '@/db/schema';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Segmented, Stack, StatusPill, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './vault.module.css';

type Group = { id: string; name: string };

const VIS_LABEL: Record<VaultVisibility, string> = {
  private: 'Only me',
  groups: 'Groups',
  farm: 'Everyone on the farm',
  everyone: 'Everyone, renters too',
};

async function reveal(id: string): Promise<{ secret: string; notes: string }> {
  const res = await fetch(`/api/vault/${id}/reveal`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not open it.');
  return data;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function VaultView({
  entries, groups, shareGroups, canCreate, isAdmin, onFarm,
}: {
  entries: VaultEntryView[];
  groups: Group[];
  shareGroups: Group[];
  canCreate: boolean;
  isAdmin: boolean;
  onFarm: boolean;
}) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<VaultEntryView | 'new' | null>(null);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? entries.filter((e) => `${e.title} ${e.url} ${e.username}`.toLowerCase().includes(n)) : entries;
  }, [entries, q]);

  return (
    <Stack gap={16}>
      <div className={s.toolbar}>
        <label className={s.search}>
          <Search aria-hidden />
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search passwords and codes" />
        </label>
        {canCreate && <Button icon={<Plus />} onClick={() => setEditing('new')}>Add</Button>}
      </div>

      <Card flush>
        {shown.length === 0 ? (
          <EmptyState icon={<KeyRound />} title={entries.length ? 'No matches' : 'Nothing here yet'}>
            {entries.length ? undefined : canCreate ? 'Add the Wi-Fi password, gate code or a shared login.' : 'Codes shared with you will show up here.'}
          </EmptyState>
        ) : (
          shown.map((e) => (
            <EntryRow
              key={e.id}
              e={e}
              who={e.visibility === 'groups' ? e.groupIds.map((g) => groupName.get(g) ?? 'a group').join(', ') || 'No group' : VIS_LABEL[e.visibility]}
              canDelete={e.mine || isAdmin}
              onEdit={() => setEditing(e)}
            />
          ))
        )}
      </Card>

      <Dialog sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a password or code' : 'Edit'}>
        {editing && <EntryForm entry={editing === 'new' ? null : editing} groups={shareGroups} onFarm={onFarm} onDone={() => setEditing(null)} />}
      </Dialog>
    </Stack>
  );
}

function EntryRow({ e, who, canDelete, onEdit }: { e: VaultEntryView; who: string; canDelete: boolean; onEdit: () => void }) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const [shownSecret, setShownSecret] = useState<{ secret: string; notes: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<{ who: string; action: string; ts: number }[] | null>(null);

  // Revealed secrets disappear again after 30 seconds.
  useEffect(() => {
    if (!shownSecret) return;
    const t = setTimeout(() => setShownSecret(null), 30_000);
    return () => clearTimeout(t);
  }, [shownSecret]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  async function onShow() {
    setErr(null);
    if (shownSecret) return setShownSecret(null);
    try {
      setShownSecret(await reveal(e.id));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not open it.');
    }
  }
  async function onCopy() {
    setErr(null);
    try {
      const { secret } = shownSecret ?? (await reveal(e.id));
      setMsg((await copy(secret)) ? 'Password copied' : 'Couldn’t copy — tap Show instead');
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not open it.');
    }
  }
  async function onDelete() {
    if (!(await askConfirm(`Delete “${e.title}”? This can’t be undone.`))) return;
    const res = await fetch(`/api/vault/${e.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setErr((await res.json().catch(() => ({}))).error || 'Could not delete.');
  }
  async function onLog() {
    if (log) return setLog(null);
    const res = await fetch(`/api/vault/${e.id}/log`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setLog(data.log);
    else setErr(data.error || 'Could not load the history.');
  }

  return (
    <article className={s.entry}>
      <div className={s.entryHead}>
        <span className={s.icon}><Lock aria-hidden /></span>
        <div className={s.entryMain}>
          <strong className={s.title}>{e.title}</strong>
          {e.url && (
            <a href={/^https?:\/\//.test(e.url) ? e.url : `https://${e.url}`} target="_blank" rel="noopener noreferrer" className={s.url}>{e.url}</a>
          )}
          <span className={s.meta}>
            <StatusPill tone={e.visibility === 'private' ? 'neutral' : 'info'}>{who}</StatusPill>
            {!e.mine && <span>from {e.ownerName}</span>}
          </span>
        </div>
      </div>

      {e.username && (
        <div className={s.field}>
          <span className={s.label}>Username</span>
          <code className={s.value}>{e.username}</code>
          <IconButton label="Copy username" onClick={async () => setMsg((await copy(e.username)) ? 'Username copied' : 'Couldn’t copy')}><Copy /></IconButton>
        </div>
      )}
      <div className={s.field}>
        <span className={s.label}>Password</span>
        <code className={s.value}>{shownSecret ? shownSecret.secret : '••••••••••'}</code>
        <IconButton label={shownSecret ? 'Hide' : 'Show'} onClick={onShow}>{shownSecret ? <EyeOff /> : <Eye />}</IconButton>
        <IconButton label="Copy password" onClick={onCopy}><Copy /></IconButton>
      </div>
      {shownSecret?.notes && <p className={s.notes}>{shownSecret.notes}</p>}
      {!shownSecret && e.hasNotes && <p className={s.meta}>Has notes — tap Show to see them.</p>}

      {msg && <span className={s.ok} role="status">{msg}</span>}
      {err && <Banner tone="danger">{err}</Banner>}

      {(e.mine || canDelete) && (
        <div className={s.tools}>
          {e.mine && <Button size="sm" variant="ghost" icon={<Pencil />} onClick={onEdit}>Edit</Button>}
          <Button size="sm" variant="ghost" icon={<History />} onClick={onLog}>{log ? 'Hide history' : 'Who opened it'}</Button>
          {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onDelete}>Delete</Button>}
        </div>
      )}
      {log && (
        <ul className={s.log}>
          {log.length === 0 && <li>Nobody has opened it yet.</li>}
          {log.map((l, i) => (
            <li key={i}>{l.who} · {l.action === 'reveal' ? 'opened' : l.action === 'create' ? 'added' : 'changed'} · {new Date(l.ts).toLocaleString()}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function generate(len = 20): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_';
  const bytes = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function EntryForm({ entry, groups, onFarm, onDone }: { entry: VaultEntryView | null; groups: Group[]; onFarm: boolean; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(!entry?.hasNotes);
  const [visibility, setVisibility] = useState<VaultVisibility>(entry?.visibility ?? 'private');
  const [groupIds, setGroupIds] = useState<string[]>(entry?.groupIds ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Editing keeps existing notes unless changed: load them (a logged reveal) only if asked.
  async function loadNotes() {
    if (!entry) return;
    try {
      setNotes((await reveal(entry.id)).notes);
      setNotesLoaded(true);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not load notes.');
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = { title, url, username, visibility, groupIds: visibility === 'groups' ? groupIds : [] };
    if (secret) body.secret = secret;
    if (notesLoaded) body.notes = notes;
    else if (entry) {
      // Notes weren't loaded, so fetch them to resend unchanged.
      try {
        body.notes = (await reveal(entry.id)).notes;
      } catch {
        setBusy(false);
        return setErr('Could not keep the existing notes.');
      }
    }
    const res = await fetch(entry ? `/api/vault/${entry.id}` : '/api/vault', {
      method: entry ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) return setErr((await res.json().catch(() => ({}))).error || 'Could not save.');
    onDone();
    router.refresh();
  }

  const options: { value: VaultVisibility; label: string }[] = [
    { value: 'private', label: 'Only me' },
    ...(groups.length ? [{ value: 'groups' as const, label: 'Groups' }] : []),
    ...(onFarm ? [{ value: 'farm' as const, label: 'Farm' }] : []),
    { value: 'everyone', label: 'Everyone' },
  ];

  return (
    <form onSubmit={submit}>
      <Stack>
        <Field label="Name" htmlFor="v-title"><Input id="v-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="e.g. Barn Wi-Fi, Front gate" /></Field>
        <Field label="Username (optional)" htmlFor="v-user"><Input id="v-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></Field>
        <Field label={entry ? 'New password or code (leave blank to keep)' : 'Password or code'} htmlFor="v-secret">
          <div className={s.secretRow}>
            <Input id="v-secret" type={showSecret ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)} required={!entry} autoComplete="new-password" />
            <IconButton label={showSecret ? 'Hide' : 'Show'} onClick={() => setShowSecret((v) => !v)}>{showSecret ? <EyeOff /> : <Eye />}</IconButton>
            <IconButton label="Generate a strong password" onClick={() => { setSecret(generate()); setShowSecret(true); }}><Wand2 /></IconButton>
          </div>
        </Field>
        <Field label="Website (optional)" htmlFor="v-url"><Input id="v-url" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="example.com" /></Field>
        {notesLoaded ? (
          <Field label="Notes (optional, encrypted)" htmlFor="v-notes"><Textarea id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        ) : (
          <div><Button size="sm" variant="ghost" onClick={loadNotes}>Edit notes</Button></div>
        )}
        <Field label="Who can see it" htmlFor="v-vis" hint={visibility === 'everyone' ? 'Includes renters and guests — good for gate codes.' : visibility === 'private' ? 'Nobody else, not even admins.' : undefined}>
          <Segmented label="Who can see it" value={visibility} onChange={setVisibility} options={options} />
        </Field>
        {visibility === 'groups' && (
          <fieldset className={s.groups}>
            <legend className={s.label}>Share with</legend>
            {groups.map((g) => (
              <label key={g.id} className={s.groupOpt}>
                <input type="checkbox" checked={groupIds.includes(g.id)} onChange={(e) => setGroupIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id)))} />
                {g.name}
              </label>
            ))}
          </fieldset>
        )}
        {err && <Banner tone="danger">{err}</Banner>}
        <Button type="submit" block loading={busy}>{entry ? 'Save' : 'Add'}</Button>
      </Stack>
    </form>
  );
}
