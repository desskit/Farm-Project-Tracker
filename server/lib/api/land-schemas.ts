import { z } from 'zod';
import { LAND_EVENT_TYPES, LAND_KIND_LIST } from '@/lib/domain/garden';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().max(64);
const text = (n: number) => z.string().max(n);
const qty = z.number().min(0).max(1e7).nullable().optional();

export const unitSchema = z.object({
  kind: z.enum(LAND_KIND_LIST as [string, ...string[]]).transform((k) => k as (typeof LAND_KIND_LIST)[number]),
  name: z.string().trim().min(1).max(80),
  parentId: id.nullable().optional(),
  area: z.number().min(0).max(1e9).nullable().optional(),
  areaUnit: z.enum(['sqft', 'acre']).optional(),
  restDays: z.number().int().min(1).max(365).optional(),
  notes: text(2000).optional(),
});
export const unitPatchSchema = unitSchema.omit({ kind: true, parentId: true }).partial().extend({ active: z.boolean().optional() });

export const plantingSchema = z.object({
  crop: z.string().trim().min(1).max(80),
  variety: text(80).optional(),
  method: z.enum(['seed', 'transplant']).optional(),
  sownOn: date,
  daysToMaturity: z.number().int().min(1).max(1000).nullable().optional(),
  inventoryId: id.nullable().optional(),
  seedQty: qty,
  succession: z.object({ everyDays: z.number().int().min(1).max(120), count: z.number().int().min(2).max(26) }).nullable().optional(),
  notes: text(1000).optional(),
});
export const plantingStatusSchema = z.object({ status: z.enum(['planned', 'growing', 'harvested', 'failed']) });

export const perennialSchema = z.object({
  crop: z.string().trim().min(1).max(80),
  variety: text(80).optional(),
  count: z.number().int().min(1).max(100000).optional(),
  plantedOn: date.nullable().optional(),
  notes: text(1000).optional(),
});
export const perennialPatchSchema = z.object({ count: z.number().int().min(0).max(100000).optional(), variety: text(80).optional(), notes: text(1000).optional(), active: z.boolean().optional() });

export const harvestSchema = z.object({
  plantingId: id.nullable().optional(),
  perennialId: id.nullable().optional(),
  crop: text(80).optional(),
  amount: z.number().positive().max(1e7),
  unit: text(20).optional(),
  date: date.optional(),
  notes: text(1000).optional(),
  finished: z.boolean().optional(),
});

export const landEventSchema = z.object({
  type: z.enum(LAND_EVENT_TYPES),
  date: date.optional(),
  inventoryId: id.nullable().optional(),
  qtyUsed: qty,
  phiDays: z.number().int().min(0).max(365).nullable().optional(),
  cost: qty,
  notes: text(2000).optional(),
});

export const moveSchema = z.object({ toUnitId: id.nullable(), date: date.optional(), notes: text(500).optional() });
