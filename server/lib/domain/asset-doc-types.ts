/**
 * Client-safe asset-document constants. Kept out of lib/data/asset-docs.ts so
 * client components can import the labels without pulling the server-only
 * data layer (and its node deps) into the browser bundle.
 */
import type { AssetDocType } from '@/db/schema';

export const DOC_TYPE_LABELS: Record<AssetDocType, string> = {
  receipt: 'Receipt',
  manual: 'Manual',
  warranty: 'Warranty',
  other: 'Document',
};
