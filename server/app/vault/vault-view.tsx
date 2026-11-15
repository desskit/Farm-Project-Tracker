'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, EyeOff, History, KeyRound, Lock, Pencil, Plus, Search, Trash2, Wand2, X } from 'lucide-react';
import type { VaultEntryView } from '@/lib/data/vault';
import { canGrantEdit, type ShareType } from '@/lib/domain/vault-sharing';
import { fmtDate } from '@/lib/domain/dates';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Select, Stack, StatusPill, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './vault.module.css';

type Opt = { id: string; name: string };
/** Who an entry can be shared with: offered in the "Add" picker. */
export type ShareTargets = { people: Opt[]; groups: Opt[]; roles: Opt[]; onFarm: boolean };

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
  entries, targets, canCreate, isAdmin, today,
}: {
  entries: VaultEntryView[];
  targets: ShareTargets;
  canCreate: boolean;
  isAdmin: boolean;
  today: string;
}) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<VaultEntryView | 'new' | null>(null);
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
            <EntryRow key={e.id} e={e} canDelete={e.mine || isAdmin} onEdit={() => setEditing(e)} />
          ))
        )}
      </Card>

      <Dialog sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a password or code' : 'Edit'}>
        {editing && <EntryForm entry={editing === 'new' ? null : editing} targets={targets} today={today} onDone={() => setEditing(null)} />}
      </Dialog>
    </Stack>
  );
}

function EntryRow({ e, canDelete, onEdit }: { e: VaultEntryView; canDelete: boolean; onEdit: () => void }) {
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
            {e.mine ? (
              <StatusPill tone={e.summary.startsWith('Only me') ? 'neutral' : 'info'}>{e.summary}</StatusPill>
            ) : (
              <>
                <StatusPill tone={e.access === 'edit' ? 'upcoming' : 'neutral'}>{e.access === 'edit' ? 'You can edit' : 'View only'}</StatusPill>
                <span>from {e.ownerName}{e.until ? ` · until ${fmtDate(e.until)}` : ''}</span>
              </>
            )}
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

      {(e.mine || canDelete || e.access === 'edit') && (
        <div className={s.tools}>
          {(e.mine || e.access === 'edit') && <Button size="sm" variant="ghost" icon={<Pencil />} onClick={onEdit}>Edit</Button>}
          {(e.mine || canDelete) && <Button size="sm" variant="ghost" icon={<History />} onClick={onLog}>{log ? 'Hide history' : 'Who opened it'}</Button>}
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

type ShareRow = { type: ShareType; target: string; canEdit: boolean; expiresOn: string };

function EntryForm({ entry, targets, today, onDone }: { entry: VaultEntryView | null; targets: ShareTargets; today: string; onDone: () => void }) {
  const owner = !entry || entry.mine;
  const router = useRouter();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(!entry?.hasNotes);
  const [shares, setShares] = useState<ShareRow[]>(
    (entry?.shares ?? []).map((x) => ({ type: x.type, target: x.target, canEdit: x.canEdit, expiresOn: x.expiresOn ?? '' })),
  );
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
    const body: Record<string, unknown> = { title, url, username };
    // Only the owner decides who it's shared with.
    if (owner) body.shares = shares.map((x) => ({ type: x.type, target: x.target, canEdit: x.canEdit, expiresOn: x.expiresOn || null }));
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
        {owner ? (
          <ShareEditor rows={shares} onChange={setShares} targets={targets} today={today} />
        ) : (
          <p className={s.hint}>You can change what’s stored. Only {entry?.ownerName} decides who it’s shared with.</p>
        )}
        {err && <Banner tone="danger">{err}</Banner>}
        <Button type="submit" block loading={busy}>{entry ? 'Save' : 'Add'}</Button>
      </Stack>
    </form>
  );
}

const key = (x: { type: ShareType; target: string }) => `${x.type}:${x.target}`;

/**
 * The owner's share list: who it's shared with, whether each can edit, and
 * an optional last day. Empty means only the owner (not even admins).
 */
function ShareEditor({ rows, onChange, targets, today }: { rows: ShareRow[]; onChange: (r: ShareRow[]) => void; targets: ShareTargets; today: string }) {
  const label = (x: { type: ShareType; target: string }) => {
    const find = (list: Opt[]) => list.find((o) => o.id === x.target)?.name;
    switch (x.type) {
      case 'user': return find(targets.people) ?? 'Former member';
      case 'group': return `${find(targets.groups) ?? 'A group'} (group)`;
      case 'role': return `Everyone who’s ${find(targets.roles) ?? x.target}`;
      case 'farm': return 'Everyone on the farm';
      default: return 'Everyone, renters too';
    }
  };
  const taken = new Set(rows.map(key));
  const set = (i: number, patch: Partial<ShareRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  function add(value: string) {
    if (!value) return;
    const [type, ...rest] = value.split(':');
    const row = { type: type as ShareType, target: rest.join(':'), canEdit: false, expiresOn: '' };
    if (!taken.has(key(row))) onChange([...rows, row]);
  }
  const free = (type: ShareType, list: Opt[]) => list.filter((o) => !taken.has(`${type}:${o.id}`));

  return (
    <fieldset className={s.shares}>
      <legend className={s.label}>Shared with</legend>
      {rows.length === 0 && <p className={s.hint}>Only you. Nobody else can open it, not even admins.</p>}
      {rows.map((r, i) => {
        const ended = !!r.expiresOn && r.expiresOn < today;
        return (
          <div key={key(r)} className={s.shareRow}>
            <span className={s.shareWho}>
              {label(r)}
              {ended && <StatusPill tone="neutral">Ended</StatusPill>}
            </span>
            <div className={s.shareCtl}>
              <Select aria-label={`Access for ${label(r)}`} value={r.canEdit ? 'edit' : 'view'} onChange={(e) => set(i, { canEdit: e.target.value === 'edit' })} disabled={!canGrantEdit(r.type)}>
                <option value="view">Can view</option>
                {canGrantEdit(r.type) && <option value="edit">Can edit</option>}
              </Select>
              <Input type="date" aria-label={`Last day for ${label(r)} (optional)`} title="Last day (optional)" min={today} value={r.expiresOn} onChange={(e) => set(i, { expiresOn: e.target.value })} />
              <IconButton label={`Stop sharing with ${label(r)}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><X /></IconButton>
            </div>
          </div>
        );
      })}
      <Select aria-label="Share with…" value="" onChange={(e) => add(e.target.value)}>
        <option value="">+ Share with…</option>
        {free('user', targets.people).length > 0 && (
          <optgroup label="People">{free('user', targets.people).map((p) => <option key={p.id} value={`user:${p.id}`}>{p.name}</option>)}</optgroup>
        )}
        {free('group', targets.groups).length > 0 && (
          <optgroup label="Groups">{free('group', targets.groups).map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>
        )}
        {free('role', targets.roles).length > 0 && (
          <optgroup label="Everyone with a role">{free('role', targets.roles).map((r) => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}</optgroup>
        )}
        <optgroup label="Everyone">
          {targets.onFarm && !taken.has('farm:') && <option value="farm:">Everyone on the farm</option>}
          {!taken.has('everyone:') && <option value="everyone:">Everyone, renters and guests too</option>}
        </optgroup>
      </Select>
      <p className={s.hint}>Leave the date empty for no end. A shared password stops showing for that person the day after the date you pick. Only people, groups and roles can be allowed to edit.</p>
    </fieldset>
  );
}
