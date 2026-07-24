'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import type { NoteRow, NoteParentType } from '@/lib/data/notes';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Logbook for a project / task / asset. Anyone can add a note (with an optional
 * photo); the author or a manager can delete one. Server-renders the initial
 * notes; changes go through the /api/notes endpoints and refresh the route.
 */
export function NotesSection({
  parentType,
  parentId,
  notes,
  currentUser,
}: {
  parentType: NoteParentType;
  parentId: string;
  notes: NoteRow[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() && !photo) return;
    setBusy(true);
    setError(null);
    try {
      let photoId: string | null = null;
      if (photo) photoId = await uploadPhoto(photo);
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentType, parentId, body, photoId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not add note.');
        return;
      }
      setBody('');
      setPhoto(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add note.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this note?')) return;
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete note.');
    }
  }

  return (
    <>
      <div className="section-title">
        Notes
        <span className="count-pill">{notes.length}</span>
      </div>
      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="field" style={{ marginBottom: 8 }}>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add a note for the crew…" />
          </div>
          <div className="note-add-row">
            <label className="btn small ghost note-photo-btn">
              {photo ? '📷 1 photo' : '📷 Photo'}
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
            <button type="submit" disabled={busy || (!body.trim() && !photo)} className="btn small primary">
              {busy ? 'Saving…' : 'Add note'}
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
        </form>

        {notes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {notes.map((n) => (
              <div className="note-row" key={n.id}>
                <div className="note-main">
                  {n.body && <p className="note-body">{n.body}</p>}
                  {n.photoId && (
                    <a href={`/api/attachments/${n.photoId}`} target="_blank" rel="noopener" className="chip-link">
                      📷 photo
                    </a>
                  )}
                  <p className="note-meta">
                    {n.userName} · {fmtDate(n.date)}
                  </p>
                </div>
                {(n.userId === currentUser.id || isManager) && (
                  <button className="icon-btn" title="Delete note" onClick={() => onDelete(n.id)}>
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
