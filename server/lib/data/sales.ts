/**
 * What the farm sells: eggs, milk, produce, animals, hay. Each sale can name
 * a buyer and whether it's been paid, and can be tied to the herd or ground
 * it came from (that's what profit-by-enterprise reads).
 *
 * Recording needs sales.log. Seeing everyone's sales and the totals needs
 * finance.view; without it a person sees only what they recorded.
 */
import 'server-only';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { animalGroups, landUnits, sales, users, type SaleKind } from '@/db/schema';
import { uid } from '@/lib/ids';
import { todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { cents } from '@/lib/domain/money';
import type { SessionUser } from '@/lib/auth/session';
import { publishChange } from '@/lib/realtime/bus';
import { logActivity } from './activity';
import { DataError } from './errors';

export type SaleRow = typeof sales.$inferSelect & { byName: string | null; groupName: string | null; unitName: string | null };

export async function listSales(viewer: SessionUser, opts: { from?: string; to?: string; owedOnly?: boolean } = {}): Promise<SaleRow[]> {
  const where = [
    opts.from ? gte(sales.date, opts.from) : undefined,
    opts.to ? lte(sales.date, opts.to) : undefined,
    opts.owedOnly ? eq(sales.paid, false) : undefined,
    can(viewer, 'finance.view') ? undefined : eq(sales.userId, viewer.id),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const rows = await db
    .select({ s: sales, byName: users.name, groupName: animalGroups.name, unitName: landUnits.name })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .leftJoin(animalGroups, eq(animalGroups.id, sales.groupId))
    .leftJoin(landUnits, eq(landUnits.id, sales.landUnitId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sales.date), desc(sales.createdAt))
    .limit(300);
  return rows.map((r) => ({ ...r.s, byName: r.byName, groupName: r.groupName, unitName: r.unitName }));
}

export function salesTotals(rows: { amount: number; paid: boolean; kind: SaleKind }[]) {
  const byKind = new Map<SaleKind, number>();
  let total = 0;
  let owed = 0;
  for (const r of rows) {
    total += r.amount;
    if (!r.paid) owed += r.amount;
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + r.amount);
  }
  return { total: cents(total), owed: cents(owed), byKind: [...byKind.entries()].map(([kind, amount]) => ({ kind, amount: cents(amount) })).sort((a, b) => b.amount - a.amount) };
}

export type SaleInput = {
  date?: string; kind: SaleKind; item?: string; qty?: number | null; unit?: string; amount: number;
  buyer?: string; paid?: boolean; groupId?: string | null; landUnitId?: string | null; notes?: string;
};

export async function addSale(user: SessionUser, d: SaleInput): Promise<string> {
  if (!can(user, 'sales.log')) throw new DataError('You can’t record sales.', 403);
  if (!(d.amount > 0)) throw new DataError('Enter what it sold for.', 400);
  const date = d.date || todayISO();
  if (date > todayISO()) throw new DataError('That date hasn’t happened yet.', 400);
  const paid = d.paid !== false;
  const id = uid('sl');
  await db.insert(sales).values({
    id, date, kind: d.kind, item: d.item?.trim() ?? '', qty: d.qty ?? null, unit: d.unit?.trim() ?? '', amount: cents(d.amount),
    buyer: d.buyer?.trim() ?? '', paid, paidOn: paid ? date : null, groupId: d.groupId || null, landUnitId: d.landUnitId || null,
    notes: d.notes?.trim() ?? '', userId: user.id,
  });
  await logActivity(user.id, `recorded a sale: ${d.item?.trim() || d.kind}`, { audience: 'finance.view', href: '/more/sales' });
  publishChange('sales');
  return id;
}

async function mine(user: SessionUser, id: string) {
  const [s] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!s) throw new DataError('No such sale.', 404);
  if (s.userId !== user.id && !can(user, 'finance.manage')) throw new DataError('Only whoever recorded it, or a manager, can change this sale.', 403);
  return s;
}

export async function setSalePaid(user: SessionUser, id: string, paid: boolean): Promise<void> {
  await mine(user, id);
  await db.update(sales).set({ paid, paidOn: paid ? todayISO() : null }).where(eq(sales.id, id));
  publishChange('sales');
}

export async function deleteSale(user: SessionUser, id: string): Promise<void> {
  const s = await mine(user, id);
  if (s.animalEventId) throw new DataError('This came from an animal sale — remove that entry on the animals’ page instead.', 409);
  await db.delete(sales).where(eq(sales.id, id));
  publishChange('sales');
}
