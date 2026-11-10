'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Pencil, Plus, Trash2 } from 'lucide-react';
import { uploadPhoto } from '@/lib/client/photo';
import { Banner, Button, Dialog, Field, IconButton, Input, Select, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from '../../farm/animals/animals.module.css';

type Guide = { id: string; title: string; summary: string; steps: { text: string }[]; photos: { attachmentId: string; step: number }[] };

/** "New guide" (no guide given) or the edit pencil on a guide's page. */
export function GuideEditorButton({ guide }: { guide?: Guide }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {guide ? <IconButton label="Edit guide" onClick={() => setOpen(true)}><Pencil /></IconButton> : <Button size="sm" icon={<Plus />} onClick={() => setOpen(true)}>New guide</Button>}
      <Dialog sheet open={open} onClose={() => setOpen(false)} title={guide ? 'Edit guide' : 'New guide'}>
        {open && <GuideForm guide={guide} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function GuideForm({ guide, onDone }: { guide?: Guide; onDone: () => void }) {
  const router = useRouter();
  const { confirm: askConfirm } = useDialogs();
  const [title, setTitle] = useState(guide?.title ?? '');
  const [summary, setSummary] = useState(guide?.summary ?? '');
  const [steps, setSteps] = useState((guide?.steps ?? []).map((x) => x.text).join('\n'));
  const [photos, setPhotos] = useState(guide?.photos ?? []);
  const [photoStep, setPhotoStep] = useState('-1');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = steps.split('\n').map((x) => x.trim()).filter(Boolean);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { title, summary, steps: lines.map((text) => ({ text })), photos: photos.filter((p) => p.step < lines.length) };
    const res = await fetch(guide ? `/api/guides/${guide.id}` : '/api/guides', { method: guide ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save the guide.');
    onDone();
    if (guide) router.refresh();
    else router.push(`/more/guides/${data.id}`);
  }
  async function onDelete() {
    if (!guide || !(await askConfirm(`Delete “${guide.title}”? It comes off everything it’s attached to.`))) return;
    const res = await fetch(`/api/guides/${guide.id}`, { method: 'DELETE' });
    if (!res.ok) return setError('Could not delete it.');
    onDone();
    router.push('/more/guides');
  }

  return (
    <form className={s.form} onSubmit={onSubmit}>
      <Field label="Title" htmlFor="gd-title"><Input id="gd-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Starting the generator" /></Field>
      <Field label="In one line (optional)" htmlFor="gd-sum"><Input id="gd-sum" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} placeholder="When the power’s out; takes 5 minutes" /></Field>
      <Field label="Steps, one per line" htmlFor="gd-steps"><Textarea id="gd-steps" rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} required placeholder={'Turn the fuel valve on\nSet the choke\nPull the cord'} /></Field>
      <Field label="Photos" htmlFor="gd-photo" hint="Pick which step the photos go with, then add them.">
        <div className={s.quickRow}>
          <Select value={photoStep} onChange={(e) => setPhotoStep(e.target.value)} aria-label="Step the photos go with">
            <option value="-1">The whole guide</option>
            {lines.map((l, i) => <option key={i} value={i}>{`Step ${i + 1}: ${l.slice(0, 30)}`}</option>)}
          </Select>
          <label className={s.fileBtn}>
            <Camera aria-hidden /> {uploading ? 'Uploading…' : 'Add photos'}
            <input id="gd-photo" type="file" accept="image/*" multiple disabled={uploading} onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (!files.length) return;
              setUploading(true);
              setError(null);
              try {
                const added: typeof photos = [];
                for (const f of files) added.push({ attachmentId: await uploadPhoto(f), step: Number(photoStep) });
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
        <span className={s.thumbs}>
          {photos.map((p) => (
            <button key={p.attachmentId} type="button" className={s.thumbBtn} title="Tap to remove" onClick={() => setPhotos(photos.filter((x) => x.attachmentId !== p.attachmentId))}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/attachments/${p.attachmentId}`} alt={p.step < 0 ? 'Guide photo' : `Step ${p.step + 1} photo`} />
              <small>{p.step < 0 ? 'Guide' : `Step ${p.step + 1}`} ✕</small>
            </button>
          ))}
        </span>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={busy} disabled={uploading}>Save guide</Button>
      {guide && <Button variant="ghost" icon={<Trash2 />} onClick={onDelete}>Delete guide</Button>}
    </form>
  );
}
