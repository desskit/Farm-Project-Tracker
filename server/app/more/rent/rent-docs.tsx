'use client';
import type { RentDocRow } from '@/lib/data/rent-docs';
import { RENT_DOC_LABELS, RENT_DOC_TYPES } from '@/lib/domain/rent-doc-types';
import type { RentDocType } from '@/db/schema';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { DocumentList } from '@/components/patterns/document-list';

const KINDS = RENT_DOC_TYPES.map((value) => ({ value, label: RENT_DOC_LABELS[value] }));

/**
 * One renter's rental paperwork. Managers see a block per renter; a renter
 * sees only their own. Renters can upload too — a signed lease shouldn't wait
 * on someone else to file it.
 */
export function RentDocs({
  renterId, renterName, docs, currentUser, showHeading,
}: {
  renterId: string;
  renterName: string;
  docs: RentDocRow[];
  currentUser: SessionUser;
  /** Managers see several of these, so each needs a name on it. */
  showHeading: boolean;
}) {
  const seesAll = can(currentUser, 'finance.view');
  return (
    <DocumentList<RentDocType>
      id={showHeading ? `documents-${renterId}` : 'documents'}
      title={showHeading ? renterName : 'Your documents'}
      docs={docs.map((d) => ({ id: d.id, name: d.name, kind: d.docType, attachmentId: d.attachmentId, uploaderName: d.uploaderName, date: d.date, canDelete: d.uploadedBy === currentUser.id || d.userId === currentUser.id || seesAll }))}
      kinds={KINDS}
      defaultKind="lease"
      placeholder="e.g. 2026 lease — signed"
      deleteUrl={(id) => `/api/rent-docs/${id}`}
      upload={async ({ name, kind, attachmentId }) => {
        const res = await fetch('/api/rent-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: renterId, name, docType: kind, attachmentId }) });
        return res.ok ? null : (await res.json().catch(() => ({}))).error || 'Could not save the document.';
      }}
    />
  );
}
