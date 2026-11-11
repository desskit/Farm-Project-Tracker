import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const loanTermsSchema = z.object({
  borrowerId: z.string().min(1).max(64),
  instalment: z.number().positive().max(1e7),
  every: z.enum(['week', 'month']),
  firstDue: date,
});

export const loanPaymentSchema = z.object({
  amount: z.number().positive().max(1e7),
  date: date.optional(),
  note: z.string().max(200).optional(),
});
