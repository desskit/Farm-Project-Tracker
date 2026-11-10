'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ClipboardCheck, FileSignature, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { uploadPhoto } from '@/lib/client/photo';
import type { Condition, InspectionItem, InspectionKind, RentalKind, UtilityKind } from '@/db/schema';
import type { AreaChange } from '@/lib/domain/rentals';
import { DEFAULT_AREAS, RENTAL_KIND_LABEL, UTILITY_LABEL } from '@/lib/domain/rentals';
import { currentMonthKey, fmtDate, monthLabel } from '@/lib/domain/dates';
import { Banner, Button, Card, Dialog, EmptyState, Field, IconButton, Input, Select, StatusPill, Switch, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../../farm/animals/animals.module.css';

type Person = { id: string; name: string };

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error || 'Something went wrong.';
}
const money = (n: number) => `$${n.toFixed(2)}`;
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/* ---------------- lease ---------------- */

type Lease = {
  id: string; startDate: string; endDate: string | null; rent: number; dueDay: number; deposit: number | null; lateFee: number | null;
  graceDays: number; noticeDays: number; notes: string; tenants: { id: string; name: string; isPrimary: boolean }[];
};

export function LeaseCard({ unitId, lease, people, today }: { unitId: string; lease: Lease | null; people: Person[]; today: string }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEnd() {
    if (!lease || !(await askConfirm('End this lease today? Rent due after today won’t be billed; anything already due stays to be settled.'))) return;
    const err = await send(`/api/rentals/leases/${lease.id}/end`, 'POST', { endDate: today });
    if (err) setError(err);
    else router.refresh();
  }

  return (
    <Card
      title="Lease"
      action={lease ? <IconButton label="Edit lease" onClick={() => setEditing(true)}><Pencil /></IconButton> : <Button size="sm" icon={<FileSignature />} onClick={() => setEditing(true)}>Start a lease</Button>}
    >
      {lease ? (
        <div className={s.form}>
          <div className={s.trend}>
            <span><strong>{money(lease.rent)}</strong> / month, due on the {ordinal(lease.dueDay)}</span>
          </div>
          <p>{lease.tenants.map((t) => `${t.name}${t.isPrimary && lease.tenants.length > 1 ? ' (billed)' : ''}`).join(' & ')}</p>
          <p className={s.muted}>
            {fmtDate(lease.startDate)} – {lease.endDate ? fmtDate(lease.endDate) : 'month to month'}
            {lease.deposit != null ? ` · deposit ${money(lease.deposit)}` : ''}
            {lease.lateFee ? ` · late fee ${money(lease.lateFee)} after ${lease.graceDays} days` : ''}
          </p>
          {lease.notes && <p className={s.muted}>{lease.notes}</p>}
          <div className={s.actions}><Button size="sm" variant="ghost" onClick={onEnd}>End lease</Button></div>
        </div>
      ) : (
        <p className={s.muted}>Vacant. Start a lease to bill rent here each month.</p>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      <Dialog sheet open={editing} onClose={() => setEditing(false)} title={lease ? 'Edit lease' : 'Start a lease'}>
        {editing && <LeaseForm unitId={unitId} lease={lease} people={people} today={today} onDone={() => setEditing(false)} />}
      </Dialog>
    </Card>
  );
}

function LeaseForm({ unitId, lease, people, today, onDone }: { unitId: string; lease: Lease | null; people: Person[]; today: string; onDone: () => void }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<string[]>(lease?.tenants.map((t) => t.id) ?? []);
  const [primary, setPrimary] = useState(lease?.tenants.find((t) => t.isPrimary)?.id ?? '');
  const [f, setF] = useState({
    startDate: lease?.startDate ?? today, endDate: lease?.endDate ?? '', rent: lease ? String(lease.rent) : '', dueDay: String(lease?.dueDay ?? 1),
    deposit: lease?.deposit != null ? String(lease.deposit) : '', lateFee: lease?.lateFee != null ? String(lease.lateFee) : '',
    graceDays: String(lease?.graceDays ?? 5), noticeDays: String(lease?.noticeDays ?? 60), notes: lease?.notes ?? '',
  });
  const [add, setAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenants.length) return setError('Add at least one tenant.');
    setBusy(true);
    setError(null);
    const body = {
      tenantIds: tenants, primaryId: primary || tenants[0], startDate: f.startDate, endDate: f.endDate || null, rent: Number(f.rent),
      dueDay: Number(f.dueDay) || 1, deposit: numOrNull(f.deposit), lateFee: numOrNull(f.lateFee), graceDays: Number(f.graceDays) || 0,
      noticeDays: Number(f.noticeDays) || 0, notes: f.notes,
    };
    const err = lease ? await send(`/api/rentals/leases/${lease.id}`, 'PATCH', body) : await send(`/api/rentals/${unitId}/leases`, 'POST', body);
    setBusy(false);
    if (err) return setError(err);
    onDone();
    router.refresh();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Tenants" htmlFor="ls-add" hint="Everyone on the lease can see and pay its charges; rent is billed to one of them.">
        <div className={s.quickRow}>
          <Select id="ls-add" value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Add a person…</option>
            {people.filter((p) => !tenants.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button size="sm" variant="secondary" disabled={!add} onClick={() => { setTenants([...tenants, add]); setAdd(''); }}>Add</Button>
        </div>
      </Field>
      {tenants.map((t) => (
        <div key={t} className={s.quickRow}>
          <span className={s.quickName}><strong>{name(t)}</strong></span>
          {tenants.length > 1 && (
            <label className={s.muted}><input type="radio" name="primary" checked={(primary || tenants[0]) === t} onChange={() => setPrimary(t)} /> billed</label>
          )}
          <IconButton label={`Remove ${name(t)}`} onClick={() => setTenants(tenants.filter((x) => x !== t))}><Trash2 /></IconButton>
        </div>
      ))}
      <div className={s.two}>
        <Field label="Starts" htmlFor="ls-start"><Input id="ls-start" type="date" value={f.startDate} onChange={set('startDate')} required /></Field>
        <Field label="Ends" htmlFor="ls-end" hint="Blank = month to month"><Input id="ls-end" type="date" value={f.endDate} onChange={set('endDate')} /></Field>
        <Field label="Rent / month ($)" htmlFor="ls-rent"><Input id="ls-rent" type="number" inputMode="decimal" min="0" step="0.01" value={f.rent} onChange={set('rent')} required /></Field>
        <Field label="Due on day" htmlFor="ls-due"><Input id="ls-due" type="number" inputMode="numeric" min="1" max="28" value={f.dueDay} onChange={set('dueDay')} /></Field>
        <Field label="Deposit ($)" htmlFor="ls-dep"><Input id="ls-dep" type="number" inputMode="decimal" min="0" step="0.01" value={f.deposit} onChange={set('deposit')} /></Field>
        <Field label="Late fee ($)" htmlFor="ls-late" hint="Blank = none"><Input id="ls-late" type="number" inputMode="decimal" min="0" step="0.01" value={f.lateFee} onChange={set('lateFee')} /></Field>
        <Field label="Grace days" htmlFor="ls-grace"><Input id="ls-grace" type="number" inputMode="numeric" min="0" value={f.graceDays} onChange={set('graceDays')} /></Field>
        <Field label="Renewal notice (days before end)" htmlFor="ls-notice"><Input id="ls-notice" type="number" inputMode="numeric" min="0" value={f.noticeDays} onChange={set('noticeDays')} /></Field>
      </div>
      <Field label="Notes" htmlFor="ls-notes"><Textarea id="ls-notes" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy}>{lease ? 'Save' : 'Start lease'}</Button>
    </form>
  );
}

/* ---------------- utilities ---------------- */

type Account = { id: string; kind: UtilityKind; provider: string; accountNo: string; billBackPct: number; active: boolean; bills: { id: string; period: string; amount: number; chargeId: string | null }[] };

export function UtilitiesCard({ unitId, accounts, hasLease }: { unitId: string; accounts: Account[]; hasLease: boolean; today: string }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ kind: 'electric', provider: '', accountNo: '', billBackPct: '100' });
  const [billFor, setBillFor] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(p: Promise<string | null>) {
    setError(null);
    const err = await p;
    if (err) setError(err);
    else router.refresh();
    return !err;
  }
  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (await act(send(`/api/rentals/${unitId}/utilities`, 'POST', { ...f, billBackPct: Number(f.billBackPct) || 0 }))) setAdding(false);
  }

  return (
    <Card title="Utilities" action={!adding ? <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>Add</Button> : undefined} flush={!adding}>
      {adding && (
        <form className={s.form} onSubmit={onAdd}>
          <div className={s.two}>
            <Field label="Utility" htmlFor="ut-kind">
              <Select id="ut-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                {Object.entries(UTILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Provider" htmlFor="ut-prov"><Input id="ut-prov" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} maxLength={80} /></Field>
            <Field label="Account #" htmlFor="ut-acct"><Input id="ut-acct" value={f.accountNo} onChange={(e) => setF({ ...f, accountNo: e.target.value })} maxLength={60} /></Field>
            <Field label="Tenant pays (%)" htmlFor="ut-pct" hint="0 = the farm pays it"><Input id="ut-pct" type="number" inputMode="numeric" min="0" max="100" value={f.billBackPct} onChange={(e) => setF({ ...f, billBackPct: e.target.value })} /></Field>
          </div>
          <div className={s.actions}>
            <Button type="submit">Add</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {!adding && accounts.length === 0 && <EmptyState icon={<Zap />} title="No utilities">Add the electric, water or propane account to bill the tenant’s share.</EmptyState>}
      {!adding && accounts.map((a) => (
        <div key={a.id} className={s.event}>
          <span className={s.eventMain}>
            <strong>{UTILITY_LABEL[a.kind]}{a.provider ? ` · ${a.provider}` : ''}</strong>
            <small>{a.billBackPct ? `Tenant pays ${a.billBackPct}%` : 'Farm pays'}{a.accountNo ? ` · #${a.accountNo}` : ''}</small>
            {a.bills.map((b) => (
              <small key={b.id}>
                {monthLabel(b.period)}: {money(b.amount)}{b.chargeId ? ' · billed' : ''}{' '}
                <button type="button" className={s.linkBtn} onClick={async () => { if (await askConfirm('Remove this bill? An unpaid tenant charge from it is removed too.')) act(send(`/api/rentals/bills/${b.id}`, 'DELETE')); }}>remove</button>
              </small>
            ))}
          </span>
          <Button size="sm" variant="secondary" onClick={() => setBillFor(a)}>Add bill</Button>
        </div>
      ))}
      {error && <Banner tone="danger">{error}</Banner>}
      <Dialog sheet open={billFor !== null} onClose={() => setBillFor(null)} title={billFor ? `${UTILITY_LABEL[billFor.kind]} bill` : ''}>
        {billFor && <BillForm account={billFor} hasLease={hasLease} onDone={() => { setBillFor(null); router.refresh(); }} />}
      </Dialog>
    </Card>
  );
}

function BillForm({ account, hasLease, onDone }: { account: Account; hasLease: boolean; onDone: () => void }) {
  const [period, setPeriod] = useState(currentMonthKey());
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const share = Math.round((Number(amount) || 0) * account.billBackPct) / 100;
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send(`/api/rentals/utilities/${account.id}/bills`, 'POST', { period, amount: Number(amount) });
    setBusy(false);
    if (err) return setError(err);
    onDone();
  }
  return (
    <form className={s.form} onSubmit={onSubmit}>
      <div className={s.two}>
        <Field label="Month it covers" htmlFor="bl-p"><Input id="bl-p" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required /></Field>
        <Field label="Bill total ($)" htmlFor="bl-a"><Input id="bl-a" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
      </div>
      <p className={s.muted}>
        {account.billBackPct === 0 ? 'The farm pays this one — nothing is billed.'
          : !hasLease ? 'No active lease, so nothing is billed to a tenant.'
            : `${money(share)} goes on the tenant’s rent page, due in two weeks.`}
      </p>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy}>Save</Button>
    </form>
  );
}

/* ---------------- inspections ---------------- */

type Inspection = { id: string; kind: InspectionKind; date: string; items: InspectionItem[]; notes: string; photos: { id: string; area: string }[] };
type Comparison = { outId: string; inId: string; inDate: string; changes: AreaChange[] };
const KIND_LABEL: Record<InspectionKind, string> = { move_in: 'Move-in', move_out: 'Move-out', routine: 'Routine' };
const COND_LABEL: Record<Condition, string> = { good: 'Good', fair: 'Fair', poor: 'Poor', na: 'N/A' };

export function InspectionsCard({ unitId, inspections, comparisons, today }: { unitId: string; inspections: Inspection[]; comparisons: Comparison[]; today: string }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [kind, setKind] = useState<InspectionKind | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = inspections[0];

  return (
    <Card title="Inspections" flush>
      <div className={`${s.actions} ${s.event}`}>
        {(['move_in', 'routine', 'move_out'] as const).map((k) => <Button key={k} size="sm" variant="secondary" icon={<ClipboardCheck />} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Button>)}
      </div>
      {inspections.length === 0 && <EmptyState title="None yet">Do a move-in inspection, and the move-out one is compared with it area by area.</EmptyState>}
      {inspections.map((i) => {
        const cmp = comparisons.find((c) => c.outId === i.id);
        const worse = cmp?.changes.filter((c) => c.worse) ?? [];
        const poor = i.items.filter((x) => x.condition === 'poor').length;
        return (
          <div key={i.id} className={s.event}>
            <span className={s.eventMain}>
              <strong>{KIND_LABEL[i.kind]} · {fmtDate(i.date)}</strong>
              <small>{i.items.length} areas{poor ? ` · ${poor} poor` : ''}{i.photos.length ? ` · ${i.photos.length} photo${i.photos.length === 1 ? '' : 's'}` : ''}{cmp ? ` · vs move-in ${fmtDate(cmp.inDate)}: ${worse.length ? `${worse.length} worse` : 'nothing worse'}` : ''}</small>
              {open === i.id && (
                <>
                  {i.items.map((x) => {
                    const ch = cmp?.changes.find((c) => c.area === x.area);
                    return (
                      <small key={x.area}>
                        {x.area}: {COND_LABEL[x.condition]}{ch?.before && ch.before !== x.condition ? ` (was ${COND_LABEL[ch.before]})` : ''}{ch?.worse ? ' ⚠' : ''}{x.notes ? ` — ${x.notes}` : ''}
                      </small>
                    );
                  })}
                  {i.notes && <small>{i.notes}</small>}
                  {i.photos.length > 0 && (
                    <span className={s.thumbs}>
                      {i.photos.map((p) => (
                        <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noopener" title={p.area || 'Photo'}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/attachments/${p.id}`} alt={p.area || 'Inspection photo'} loading="lazy" />
                        </a>
                      ))}
                    </span>
                  )}
                </>
              )}
            </span>
            {worse.length > 0 && <StatusPill tone="overdue">{worse.length} worse</StatusPill>}
            <Button size="sm" variant="ghost" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? 'Hide' : 'View'}</Button>
            <IconButton label="Delete inspection" onClick={async () => {
              if (!(await askConfirm('Delete this inspection?'))) return;
              const err = await send(`/api/rentals/inspections/${i.id}`, 'DELETE');
              if (err) setError(err);
              else router.refresh();
            }}><Trash2 /></IconButton>
          </div>
        );
      })}
      {error && <Banner tone="danger">{error}</Banner>}
      <Dialog sheet open={kind !== null} onClose={() => setKind(null)} title={kind ? `${KIND_LABEL[kind]} inspection` : ''}>
        {kind && <InspectionForm key={kind} unitId={unitId} kind={kind} start={last?.items.map((x) => x.area)} today={today} onDone={() => { setKind(null); router.refresh(); }} />}
      </Dialog>
    </Card>
  );
}

function InspectionForm({ unitId, kind, start, today, onDone }: { unitId: string; kind: InspectionKind; start?: string[]; today: string; onDone: () => void }) {
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<InspectionItem[]>((start?.length ? start : DEFAULT_AREAS).map((area) => ({ area, condition: 'good', notes: '' })));
  const [newArea, setNewArea] = useState('');
  const [notes, setNotes] = useState('');
  const [skipNa, setSkipNa] = useState(true);
  const [photos, setPhotos] = useState<{ attachmentId: string; area: string; name: string }[]>([]);
  const [photoArea, setPhotoArea] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setItem = (i: number, p: Partial<InspectionItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send(`/api/rentals/${unitId}/inspections`, 'POST', {
      kind, date, items: skipNa ? items.filter((x) => x.condition !== 'na') : items, notes,
      photos: photos.map(({ attachmentId, area }) => ({ attachmentId, area })),
    });
    setBusy(false);
    if (err) return setError(err);
    onDone();
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Date" htmlFor="in-date"><Input id="in-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></Field>
      {items.map((x, i) => (
        <div key={x.area} className={s.quickRow}>
          <span className={s.quickName}><strong>{x.area}</strong></span>
          <Select value={x.condition} onChange={(e) => setItem(i, { condition: e.target.value as Condition })} aria-label={`${x.area} condition`}>
            {Object.entries(COND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input value={x.notes} onChange={(e) => setItem(i, { notes: e.target.value })} placeholder="Notes" aria-label={`${x.area} notes`} maxLength={500} />
        </div>
      ))}
      <div className={s.quickRow}>
        <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Another area" aria-label="Another area" maxLength={60} />
        <Button size="sm" variant="secondary" disabled={!newArea.trim() || items.some((x) => x.area === newArea.trim())} onClick={() => { setItems([...items, { area: newArea.trim(), condition: 'good', notes: '' }]); setNewArea(''); }}>Add area</Button>
      </div>
      <Field label="Photos" htmlFor="in-photo" hint="Pick the area first, then add its photos. Only rental managers can open them.">
        <div className={s.quickRow}>
          <Select value={photoArea} onChange={(e) => setPhotoArea(e.target.value)} aria-label="Area the photos show">
            <option value="">General</option>
            {items.map((x) => <option key={x.area} value={x.area}>{x.area}</option>)}
          </Select>
          <label className={s.fileBtn}>
            <Camera aria-hidden /> {uploading ? 'Uploading…' : 'Add photos'}
            <input id="in-photo" type="file" accept="image/*" multiple disabled={uploading} onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (!files.length) return;
              setUploading(true);
              setError(null);
              try {
                const added: typeof photos = [];
                for (const f of files) added.push({ attachmentId: await uploadPhoto(f), area: photoArea, name: f.name });
                setPhotos((p) => [...p, ...added]);
              } catch (x) {
                setError(x instanceof Error ? x.message : 'Upload failed.');
              } finally {
                setUploading(false);
              }
            }} />
          </label>
        </div>
      </Field>
      {photos.length > 0 && (
        <p className={s.muted}>
          {photos.map((p) => `${p.area || 'General'}: ${p.name}`).join(' · ')}{' '}
          <button type="button" className={s.linkBtn} onClick={() => setPhotos([])}>clear</button>
        </p>
      )}
      <Switch label="Leave out areas marked N/A" checked={skipNa} onChange={setSkipNa} />
      <Field label="Overall notes" htmlFor="in-notes"><Textarea id="in-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy} disabled={uploading}>Save inspection</Button>
    </form>
  );
}

/* ---------------- unit settings ---------------- */

export function EditRentalUnit({ unit }: { unit: { id: string; name: string; kind: RentalKind; address: string; notes: string; active: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(unit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await send(`/api/rentals/${unit.id}`, 'PATCH', { name: f.name, kind: f.kind, address: f.address, notes: f.notes, active: f.active });
    setBusy(false);
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <IconButton label="Edit unit" onClick={() => setOpen(true)}><Pencil /></IconButton>
      <Dialog sheet open={open} onClose={() => setOpen(false)} title="Edit unit">
        <form className={s.form} onSubmit={onSubmit}>
          <div className={s.two}>
            <Field label="Name" htmlFor="eu-name"><Input id="eu-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} /></Field>
            <Field label="Kind" htmlFor="eu-kind">
              <Select id="eu-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RentalKind })}>
                {Object.entries(RENTAL_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Address" htmlFor="eu-addr"><Input id="eu-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={200} /></Field>
          <Field label="Notes" htmlFor="eu-notes"><Textarea id="eu-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <Switch label="Still rented out (turn off to archive)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block loading={busy}>Save</Button>
        </form>
      </Dialog>
    </>
  );
}
