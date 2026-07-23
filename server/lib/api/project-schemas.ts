import { z } from 'zod';

const status = z.enum(['idea', 'planned', 'in_progress', 'on_hold', 'done']);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  status: status.optional(),
  targetDate: z.string().nullable().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  status: status.optional(),
  targetDate: z.string().nullable().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  requirePhoto: z.boolean().optional(),
  open: z.boolean().optional(),
});

export const updateTaskSchema = createTaskSchema.extend({
  title: z.string().trim().min(1).optional(),
});

export const sendBackSchema = z.object({ reason: z.string().optional() });
