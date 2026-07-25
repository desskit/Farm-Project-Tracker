'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import type { AssetDocRow } from '@/lib/data/asset-docs';
import { DOC_TYPE_LABELS } from '@/lib/domain/asset-doc-types';
import type { AssetDocType } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';

const DOC_ICON: Record<AssetDocType, string> = {
  receipt: '🧾',
  manual: '📘',
  warranty: '🛡️',
  other: '📄',
};

/** Receipts, manuals, and warranties filed against a piece of equipment. */
export function AssetDocs({
  assetId,
  docs,
  currentUser,
}: {
  assetId: string;
  docs: AssetDocRow[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const isManager = currentUser.role === 'manager' || currentUser.role === 'admin';
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [docType, setDocType] = useState<AssetDocType>('receipt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f);
    // Default the label to the filename (without extension) so most uploads
    // need no typing at all.
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
    if (f && f.type === 'application/pdf') setDocType('manual');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentId = await uploadPhoto(file);
      const res = await fetch(`/api/assets/${assetId}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || file.name, docType, attachmentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save the document.');
        return;
      }
      setFile(null);
      setName('');
      setDocType('receipt');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this document? The file is removed too.')) return;
    const res = await fetch(`/api/asset-docs/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not delete the document.');
    }
  }

  return (
    <>
      <div className="section-title">
        Documents
        <span className="count-pill">{docs.length}</span>
      </div>
      <div className="card">
        <p className="subtle" style={{ marginTop: 0 }}>
          Keep receipts, manuals, and warranties with the equipment. Photos and PDFs, up to 8 MB.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <input type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>
          {file && (
            <>
              <div className="field">
                <label>Label</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Purchase receipt" />
              </div>
              <div className="field">
                <label>Kind</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value as AssetDocType)}>
                  <option value="receipt">Receipt</option>
                  <option value="manual">Manual</option>
                  <option value="warranty">Warranty</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button type="submit" disabled={busy} className="btn primary block">
                {busy ? 'Uploading…' : 'Add document'}
              </button>
            </>
          )}
        </form>
        {error && <p className="error-text">{error}</p>}

        {docs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {docs.map((d) => (
              <div className="hist-row" key={d.id}>
                <span>
                  <a href={`/api/attachments/${d.attachmentId}`} target="_blank" rel="noopener" className="chip-link">
                    {DOC_ICON[d.docType]} {d.name}
                  </a>{' '}
                  <span className="subtle">
                    · {DOC_TYPE_LABELS[d.docType]} · {d.uploaderName} · {fmtDate(d.date)}
                  </span>
                </span>
                {(d.uploadedBy === currentUser.id || isManager) && (
                  <button className="icon-btn" title="Delete document" onClick={() => onDelete(d.id)}>
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
