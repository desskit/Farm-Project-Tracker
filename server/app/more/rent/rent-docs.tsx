'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import type { RentDocRow } from '@/lib/data/rent-docs';
import { RENT_DOC_LABELS, RENT_DOC_TYPES } from '@/lib/domain/rent-doc-types';
import type { RentDocType } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { useDialogs } from '@/components/ui/dialogs';

const DOC_ICON: Record<RentDocType, string> = {
  lease: '📑',
  addendum: '📎',
  deposit: '🧾',
  inspection: '🔍',
  insurance: '🛡️',
  other: '📄',
};

/**
 * One renter's rental paperwork. Managers see a block per renter; a renter
 * sees only their own. Uploads are deliberately not manager-only — a renter
 * sending back a signed lease shouldn't have to wait on someone else to file
 * it.
 */
export function RentDocs({
  renterId,
  renterName,
  docs,
  currentUser,
  showHeading,
}: {
  renterId: string;
  renterName: string;
  docs: RentDocRow[];
  currentUser: SessionUser;
  /** Managers see several of these, so each needs a name on it. */
  showHeading: boolean;
}) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const isManager = can(currentUser, 'finance.view');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState<RentDocType>('lease');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f);
    // Default the label to the filename (without extension) so most uploads
    // need no typing at all.
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentId = await uploadPhoto(file);
      const res = await fetch('/api/rent-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: renterId, name: name.trim() || file.name, docType, attachmentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save the document.');
        return;
      }
      setFile(null);
      setName('');
      setDocType('lease');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!await askConfirm('Delete this document? The file is removed too.')) return;
    const res = await fetch(`/api/rent-docs/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete the document.');
    }
  }

  return (
    <div className="card" id="documents">
      {showHeading && (
        <p className="item-title" style={{ marginBottom: 6 }}>
          {renterName}
          {docs.length > 0 && <span className="count-pill" style={{ marginLeft: 8 }}>{docs.length}</span>}
        </p>
      )}

      {docs.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          {docs.map((d) => (
            <div className="hist-row" key={d.id}>
              <span>
                <a href={`/api/attachments/${d.attachmentId}`} target="_blank" rel="noopener" className="chip-link">
                  {DOC_ICON[d.docType]} {d.name}
                </a>{' '}
                <span className="subtle">
                  · {RENT_DOC_LABELS[d.docType]} · {d.uploaderName} · {fmtDate(d.date)}
                </span>
              </span>
              {(d.uploadedBy === currentUser.id || d.userId === currentUser.id || isManager) && (
                <button className="icon-btn" title="Delete document" onClick={() => onDelete(d.id)}>
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="subtle" style={{ marginTop: showHeading ? 0 : undefined }}>
          No paperwork on file yet.
        </p>
      )}

      <form onSubmit={onSubmit}>
        <div className="field">
          <input type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </div>
        {file && (
          <>
            <div className="field">
              <label>Label</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026 lease — signed"
              />
            </div>
            <div className="field">
              <label>Kind</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value as RentDocType)}>
                {RENT_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RENT_DOC_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={busy} className="btn primary block">
              {busy ? 'Uploading…' : 'Add document'}
            </button>
          </>
        )}
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
