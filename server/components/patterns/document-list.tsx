'use client';
/**
 * A list of filed documents (leases, receipts, manuals…) with an upload form:
 * pick a file, the label defaults to its name, choose the kind, add. Shared
 * by asset documents and rental documents.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Trash2, Upload } from 'lucide-react';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import { Banner, Button, Card, Field, IconButton, Input, Select, Stack } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './patterns.module.css';

export type DocItem = { id: string; name: string; kind: string; attachmentId: string; uploaderName: string; date: string; canDelete: boolean };

export function DocumentList<K extends string>({
  title, intro, docs, kinds, defaultKind, pdfKind, placeholder, upload, deleteUrl, id,
}: {
  title: string;
  intro?: string;
  docs: DocItem[];
  kinds: { value: K; label: string }[];
  defaultKind: K;
  /** Kind to pre-select when a PDF is picked (e.g. "manual"). */
  pdfKind?: K;
  placeholder: string;
  /** Saves the record once the file is uploaded; returns an error message or null. */
  upload: (f: { name: string; kind: K; attachmentId: string }) => Promise<string | null>;
  deleteUrl: (docId: string) => string;
  id?: string;
}) {
  const { confirm: askConfirm } = useDialogs();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<K>(defaultKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | null) {
    setFile(f);
    // Default the label to the filename so most uploads need no typing.
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
    if (f && pdfKind && f.type === 'application/pdf') setKind(pdfKind);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const attachmentId = await uploadPhoto(file);
      const err = await upload({ name: name.trim() || file.name, kind, attachmentId });
      if (err) return setError(err);
      setFile(null);
      setName('');
      setKind(defaultKind);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(docId: string) {
    if (!(await askConfirm('Delete this document? The file is removed too.'))) return;
    const res = await fetch(deleteUrl(docId), { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Could not delete the document.');
  }

  const kindLabel = new Map(kinds.map((k) => [k.value as string, k.label]));
  return (
    <Card title={`${title}${docs.length ? ` (${docs.length})` : ''}`}>
      <div id={id} className={s.docs}>
        {intro && <p className={s.pickMeta}>{intro}</p>}
        {docs.length > 0 ? (
          <div className={s.docList}>
            {docs.map((d) => (
              <div className={s.doc} key={d.id}>
                <a href={`/api/attachments/${d.attachmentId}`} target="_blank" rel="noopener" className={s.docLink}>
                  <FileText aria-hidden />
                  <span>
                    <strong>{d.name}</strong>
                    <span className={s.pickMeta}>{kindLabel.get(d.kind) ?? d.kind} · {d.uploaderName} · {fmtDate(d.date)}</span>
                  </span>
                </a>
                {d.canDelete && <IconButton label="Delete document" onClick={() => onDelete(d.id)}><Trash2 /></IconButton>}
              </div>
            ))}
          </div>
        ) : (
          <p className={s.pickMeta}>Nothing on file yet.</p>
        )}
        <form onSubmit={onSubmit}>
          <Stack>
            <label className={s.dropzone}>
              <Upload aria-hidden />
              {file ? file.name : 'Add a photo or PDF (up to 8 MB)'}
              <input type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <>
                <div className={s.docFields}>
                  <Field label="Label" htmlFor={`${id ?? title}-label`}><Input id={`${id ?? title}-label`} value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} /></Field>
                  <Field label="Kind" htmlFor={`${id ?? title}-kind`}>
                    <Select id={`${id ?? title}-kind`} value={kind} onChange={(e) => setKind(e.target.value as K)}>
                      {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </Select>
                  </Field>
                </div>
                <Button type="submit" block loading={busy}>Add document</Button>
              </>
            )}
            {error && <Banner tone="danger">{error}</Banner>}
          </Stack>
        </form>
      </div>
    </Card>
  );
}
