import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const standingOrderSchema = z.object({
  buyer: z.string().trim().min(1).max(80),
  kind: z.enum(['eggs', 'milk', 'produce', 'animal', 'hay', 'other']),
  category: z.string().max(40).optional(),
  item: z.string().max(80).optional(),
  qty: z.number().min(0).max(1e6).nullable().optional(),
  unit: z.string().max(20).optional(),
  price: z.number().positive().max(1e6),
  every: z.enum(['week', '2weeks', 'month']),
  startDate: date,
  groupId: z.string().max(64).nullable().optional(),
  landUnitId: z.string().max(64).nullable().optional(),
  paidOnDelivery: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(300).optional(),
});
export const deliverySchema = z.object({ forDate: date, action: z.enum(['delivered', 'skipped']), paid: z.boolean().optional() });
