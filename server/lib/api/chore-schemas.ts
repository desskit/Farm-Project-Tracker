import { z } from 'zod';

const scheduleSchema = z.object({
  type: z.enum(['daily', 'everyNDays', 'weekly', 'monthly']),
  n: z.number().int().positive().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  day: z.number().int().min(1).max(31).optional(),
  season: z.object({ start: z.string(), end: z.string() }).optional(),
});

export const createChoreSchema = z.object({
  name: z.string().trim().min(1),
  schedule: scheduleSchema,
  catchUp: z.enum(['mustCatchUp', 'skipToNext']).optional(),
  assignedTo: z.string().nullable().optional(),
  nextDue: z.string().optional(),
  requirePhoto: z.boolean().optional(),
  open: z.boolean().optional(),
  steps: z.array(z.string()).optional(),
});

export const updateChoreSchema = createChoreSchema.partial().extend({
  // name/schedule stay optional on update, but if present must be non-empty.
  name: z.string().trim().min(1).optional(),
});

export const completeChoreSchema = z.object({
  notes: z.string().optional(),
  photoId: z.string().nullable().optional(),
});

export const sendBackSchema = z.object({ reason: z.string().optional() });
