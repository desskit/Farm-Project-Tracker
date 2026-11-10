'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Pencil } from 'lucide-react';
import type { AnimalRow } from '@/lib/data/livestock';
import { uploadPhoto } from '@/lib/client/photo';
import { Banner, Dialog, IconButton } from '@/components/ui';
import { AnimalForm } from '../../[id]/group-client';
import s from '../../animals.module.css';

/** Edit the record (including moving it to another group) and set its photo. */
export function AnimalActions({ animal, others, groups }: { animal: AnimalRow; others: AnimalRow[]; groups: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photoId = await uploadPhoto(file);
      const res = await fetch(`/api/animals/${animal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save the photo.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className={s.iconFile} aria-label="Set photo" title="Set photo">
        <Camera aria-hidden />
        <input type="file" accept="image/*" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      <IconButton label="Edit record" onClick={() => setOpen(true)}><Pencil /></IconButton>
      <Dialog sheet open={open || !!error} onClose={() => { setOpen(false); setError(null); }} title={error ? 'Photo' : 'Edit record'}>
        {error ? <Banner tone="danger">{error}</Banner> : open && <AnimalForm groupId={animal.groupId} animal={animal} others={others} groups={groups} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}
