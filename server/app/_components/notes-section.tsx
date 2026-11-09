'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { fmtDate } from '@/lib/domain/dates';
import { preparePhoto } from '@/lib/client/photo';
import { submitQueued } from '@/lib/client/outbox';
import type { NoteRow, NoteParentType } from '@/lib/data/notes';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { Banner, Button, Card, IconButton, Textarea } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './notes-section.module.css';

/**
 * Logbook for a project / task / asset. Anyone who can do work can add a note
 * (with an optional photo, queued offline); the author or a manager can delete
 * one. `compact` drops the card frame for use inside a task row.
 */
export function NotesSection({
  parentType, parentId, notes, currentUser, compact = parentType === 'task',
}: {
  parentType: NoteParentType;
  parentId: string;
  notes: NoteRow[];
  currentUser: SessionUser;
  compact?: boolean;
}) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const isManager = can(currentUser, 'work.manage');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() && !photo) return;
    setBusy(true);
    setError(null);
    setQueued(false);
    try {
      // An observation logged at the far fence still needs to survive.
      const prepared = photo ? await preparePhoto(photo) : undefined;
      const r = await submitQueued({ url: '/api/notes', body: { parentType, parentId, body }, label: `Note: ${body.trim().slice(0, 40) || 'photo'}`, photo: prepared, photoField: 'photoId' });
      if (!r.ok && !r.queued) return setError(r.error);
      setBody('');
      setPhoto(null);
      if (r.ok) router.refresh();
      else setQueued(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add note.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!(await askConfirm('Delete this note?'))) return;
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not delete note.');
  }

  const content = (
    <div className={s.wrap}>
      {notes.length > 0 && (
        <div className={s.list}>
          {notes.map((n) => (
            <div className={s.note} key={n.id}>
              <div className={s.main}>
                {n.body && <p className={s.body}>{n.body}</p>}
                {n.photoId && (
                  <a href={`/api/attachments/${n.photoId}`} target="_blank" rel="noopener" className={s.photoLink}>
                    <ImageIcon aria-hidden /> Photo
                  </a>
                )}
                <span className={s.meta}>{n.userName} · {fmtDate(n.date)}</span>
              </div>
              {(n.userId === currentUser.id || isManager) && <IconButton label="Delete note" onClick={() => onDelete(n.id)}><Trash2 /></IconButton>}
            </div>
          ))}
        </div>
      )}
      {can(currentUser, 'work.do') && (
        <form onSubmit={onSubmit} className={s.form}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add a note for the crew…" aria-label="New note" />
          <div className={s.row}>
            <label className={s.photo}>
              <Camera aria-hidden />
              {photo ? '1 photo' : 'Photo'}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
            <Button type="submit" size="sm" loading={busy} disabled={!body.trim() && !photo}>Add note</Button>
          </div>
          {queued && <span className={s.meta}>Saved · syncs when online</span>}
          {error && <Banner tone="danger">{error}</Banner>}
        </form>
      )}
    </div>
  );

  if (compact) return content;
  return <Card title={`Notes (${notes.length})`}>{content}</Card>;
}
