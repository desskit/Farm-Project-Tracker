import { z } from 'zod';
import { foldLegacyAssignee } from './assignee-input';

const status = z.enum(['idea', 'planned', 'in_progress', 'on_hold', 'done']);

export const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  status: status.optional(),
  targetDate: z.string().nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  status: status.optional(),
  targetDate: z.string().nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
});

export const createExpenseSchema = z.object({
  label: z.string().trim().min(1),
  amount: z.number().positive(),
  date: z.string().optional(),
  photoId: z.string().nullable().optional(),
});

const taskFields = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
  dueDate: z.string().nullable().optional(),
  requirePhoto: z.boolean().optional(),
  open: z.boolean().optional(),
});

export const createTaskSchema = z.preprocess(foldLegacyAssignee, taskFields);

export const updateTaskSchema = z.preprocess(
  foldLegacyAssignee,
  taskFields.extend({ title: z.string().trim().min(1).optional() }),
);

export const sendBackSchema = z.object({ reason: z.string().optional() });
