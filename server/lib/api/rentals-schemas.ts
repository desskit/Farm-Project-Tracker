import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().max(64);
const text = (n: number) => z.string().max(n);
const money = z.number().min(0).max(1e7);

export const rentalUnitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['house', 'apartment', 'room', 'cabin', 'rv', 'other']).optional(),
  address: text(200).optional(),
  notes: text(2000).optional(),
});
export const rentalUnitPatchSchema = rentalUnitSchema.partial().extend({ active: z.boolean().optional() });

export const leaseSchema = z.object({
  tenantIds: z.array(id).min(1).max(12),
  primaryId: id.optional(),
  startDate: date,
  endDate: date.nullable().optional(),
  rent: z.number().positive().max(1e6),
  dueDay: z.number().int().min(1).max(28).optional(),
  deposit: money.nullable().optional(),
  lateFee: money.nullable().optional(),
  graceDays: z.number().int().min(0).max(60).optional(),
  noticeDays: z.number().int().min(0).max(365).optional(),
  notes: text(2000).optional(),
});
export const leasePatchSchema = leaseSchema.partial();
export const endLeaseSchema = z.object({ endDate: date.optional() });

export const utilitySchema = z.object({
  kind: z.enum(['electric', 'water', 'gas', 'propane', 'internet', 'trash', 'other']),
  provider: text(80).optional(),
  accountNo: text(60).optional(),
  billBackPct: z.number().int().min(0).max(100).optional(),
});
export const utilityPatchSchema = utilitySchema.omit({ kind: true }).partial().extend({ active: z.boolean().optional() });
export const billSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), amount: z.number().positive().max(1e6), notes: text(500).optional() });

export const inspectionSchema = z.object({
  kind: z.enum(['move_in', 'move_out', 'routine']),
  date,
  items: z.array(z.object({ area: text(60), condition: z.enum(['good', 'fair', 'poor', 'na']), notes: text(500) })).min(1).max(60),
  notes: text(2000).optional(),
  photos: z.array(z.object({ attachmentId: id, area: text(60).optional() })).max(40).optional(),
});
