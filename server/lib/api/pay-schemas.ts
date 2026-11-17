import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const paySettingsSchema = z.object({
  hourlyRate: z.number().positive().max(10000),
  rentRule: z.enum(['none', 'all', 'fixed']),
  rentFixed: z.number().min(0).max(1e6).nullable().optional(),
  active: z.boolean().optional(),
});
export const payAnchorSchema = z.object({ date });
export const payRunSchema = z.object({ periodStart: date, toRent: z.record(z.string().max(64), z.number().min(0).max(1e6)).optional() });
export const payLinePaidSchema = z.object({ paidOn: date.optional(), how: z.string().max(40).optional() });
export const workLogSchema = z.object({ date, hours: z.number().positive().max(24), note: z.string().max(200).optional() });
export const workLogDecisionSchema = z.object({ approve: z.boolean() });
