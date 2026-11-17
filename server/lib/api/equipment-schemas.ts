import { z } from 'zod';

export const checkoutSchema = z.object({
  dueBack: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(200).optional(),
});
