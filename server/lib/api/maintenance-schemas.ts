import { z } from 'zod';

export const createAssetSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().optional(),
  meterUnit: z.string().nullable().optional(),
  notes: z.string().optional(),
});

export const updateAssetSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export const addReadingSchema = z.object({
  reading: z.number(),
  date: z.string().optional(),
});

export const createMaintenanceSchema = z.object({
  name: z.string().trim().min(1),
  intervalType: z.enum(['calendar', 'usage']),
  intervalValue: z.number().positive(),
  intervalUnit: z.enum(['months', 'days']).optional(),
  requirePhoto: z.boolean().optional(),
});

export const updateMaintenanceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  intervalValue: z.number().positive().optional(),
  intervalUnit: z.enum(['months', 'days']).optional(),
  requirePhoto: z.boolean().optional(),
});

export const logServiceSchema = z.object({
  date: z.string().optional(),
  reading: z.number().nullable().optional(),
  notes: z.string().optional(),
  cost: z.number().nullable().optional(),
  photoId: z.string().nullable().optional(),
});

export const sendBackSchema = z.object({ reason: z.string().optional() });
