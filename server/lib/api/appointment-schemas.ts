import { z } from 'zod';

export const appointmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  contactId: z.string().max(64).nullable().optional(),
  linkType: z.enum(['animal_group', 'rental_unit', 'asset', 'land_unit']).nullable().optional(),
  linkId: z.string().max(64).nullable().optional(),
  notes: z.string().max(1000).optional(),
  people: z.array(z.string().max(64)).max(50).optional(),
});
export const appointmentPatchSchema = z.union([
  z.object({ status: z.enum(['scheduled', 'done', 'cancelled']) }).strict(),
  appointmentSchema,
]);
