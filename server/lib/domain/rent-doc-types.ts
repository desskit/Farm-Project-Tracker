/**
 * Client-safe rent-document constants. Kept out of lib/data/rent-docs.ts so
 * client components can import the labels without pulling the server-only
 * data layer (and its node deps) into the browser bundle.
 */
import type { RentDocType } from '@/db/schema';

export const RENT_DOC_LABELS: Record<RentDocType, string> = {
  lease: 'Lease',
  addendum: 'Addendum',
  deposit: 'Deposit receipt',
  inspection: 'Inspection',
  insurance: 'Insurance',
  other: 'Document',
};

/** Order the picker offers them in — most-used first. */
export const RENT_DOC_TYPES: RentDocType[] = ['lease', 'addendum', 'deposit', 'inspection', 'insurance', 'other'];
