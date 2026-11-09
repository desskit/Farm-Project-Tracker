'use client';
import type { AssetDocRow } from '@/lib/data/asset-docs';
import { DOC_TYPE_LABELS } from '@/lib/domain/asset-doc-types';
import type { AssetDocType } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { DocumentList } from '@/components/patterns/document-list';

const KINDS = (['receipt', 'manual', 'warranty', 'other'] as AssetDocType[]).map((value) => ({ value, label: DOC_TYPE_LABELS[value] }));

/** Receipts, manuals, and warranties filed against a piece of equipment. */
export function AssetDocs({ assetId, docs, currentUser }: { assetId: string; docs: AssetDocRow[]; currentUser: SessionUser }) {
  const manages = can(currentUser, 'work.manage');
  return (
    <DocumentList<AssetDocType>
      title="Documents"
      intro="Receipts, manuals and warranties, kept with the equipment."
      docs={docs.map((d) => ({ id: d.id, name: d.name, kind: d.docType, attachmentId: d.attachmentId, uploaderName: d.uploaderName, date: d.date, canDelete: d.uploadedBy === currentUser.id || manages }))}
      kinds={KINDS}
      defaultKind="receipt"
      pdfKind="manual"
      placeholder="e.g. Purchase receipt"
      deleteUrl={(id) => `/api/asset-docs/${id}`}
      upload={async ({ name, kind, attachmentId }) => {
        const res = await fetch(`/api/assets/${assetId}/docs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, docType: kind, attachmentId }) });
        return res.ok ? null : (await res.json().catch(() => ({}))).error || 'Could not save the document.';
      }}
    />
  );
}
