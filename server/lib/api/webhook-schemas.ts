import { z } from 'zod';

export const webhookSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().min(8).max(500),
  events: z.array(z.string().max(40)).max(20).optional(),
});
export const webhookPatchSchema = webhookSchema.partial().extend({ active: z.boolean().optional() });
