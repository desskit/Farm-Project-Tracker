/**
 * Contacts: the vet, the farrier, suppliers, emergency numbers. Everyone on
 * the farm can see them; tenants see only the ones marked for them. Editing
 * needs work.manage (or rentals.manage, for the tenant-facing ones).
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { contacts, type ContactKind } from '@/db/schema';
import { uid } from '@/lib/ids';
import { can } from '@/lib/domain/permissions';
import type { SessionUser } from '@/lib/auth/session';
import { DataError } from './errors';

export type ContactRow = typeof contacts.$inferSelect;
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = { emergency: 'Emergency', vet: 'Vet', farrier: 'Farrier', supplier: 'Supplier', utility: 'Utility', other: 'Other' };
const ORDER: ContactKind[] = ['emergency', 'vet', 'farrier', 'supplier', 'utility', 'other'];

export function canEditContacts(user: SessionUser): boolean {
  return can(user, 'work.manage') || can(user, 'rentals.manage');
}

export async function listContacts(viewer: SessionUser): Promise<ContactRow[]> {
  const rows = await db.select().from(contacts);
  return rows
    .filter((c) => can(viewer, 'farm.view') || c.showTenants)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
}

export type ContactInput = { name: string; kind?: ContactKind; phone?: string; email?: string; notes?: string; showTenants?: boolean };

export async function saveContact(user: SessionUser, id: string | null, d: ContactInput): Promise<string> {
  if (!canEditContacts(user)) throw new DataError('Only managers can change contacts.', 403);
  const values = { name: d.name.trim(), kind: d.kind ?? 'other', phone: d.phone?.trim() ?? '', email: d.email?.trim() ?? '', notes: d.notes?.trim() ?? '', showTenants: !!d.showTenants };
  if (id) {
    await db.update(contacts).set(values).where(eq(contacts.id, id));
    return id;
  }
  const newId = uid('ct');
  await db.insert(contacts).values({ id: newId, ...values });
  return newId;
}

export async function deleteContact(user: SessionUser, id: string): Promise<void> {
  if (!canEditContacts(user)) throw new DataError('Only managers can change contacts.', 403);
  await db.delete(contacts).where(eq(contacts.id, id));
}
