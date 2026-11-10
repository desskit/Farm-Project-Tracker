import { z } from 'zod';
import { EVENT_TYPES, SPECIES_LIST } from '@/lib/domain/livestock';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().max(64);
const text = (n: number) => z.string().max(n);

export const groupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.enum(SPECIES_LIST as [string, ...string[]]),
  kind: z.enum(['herd', 'flock', 'litter', 'pen']).optional(),
  headCount: z.number().int().min(0).max(100000).optional(),
  location: text(120).optional(),
  notes: text(2000).optional(),
});
export const groupPatchSchema = groupSchema.omit({ species: true }).partial().extend({ active: z.boolean().optional() });

export const animalSchema = z.object({
  tag: text(40).optional(),
  name: text(80).optional(),
  sex: z.enum(['female', 'male', 'unknown']).optional(),
  breed: text(80).optional(),
  birthDate: date.nullable().optional(),
  damId: id.nullable().optional(),
  sireId: id.nullable().optional(),
  notes: text(2000).optional(),
  photoId: id.nullable().optional(),
});
export const newAnimalSchema = animalSchema.extend({ arrived: z.enum(['existing', 'born', 'bought']).optional() });
export const animalPatchSchema = animalSchema.extend({ groupId: id.optional() });

export const productionSchema = z.object({
  kind: z.enum(['eggs', 'milk', 'wool']),
  amount: z.number().positive().max(100000),
  date: date.optional(),
  notes: text(500).optional(),
});

const num = z.number().min(0).max(1e7).nullable().optional();
export const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  date: date.optional(),
  animalId: id.nullable().optional(),
  count: z.number().int().min(1).max(10000).optional(),
  inventoryId: id.nullable().optional(),
  qtyUsed: num,
  weight: num,
  cost: num,
  meatDays: z.number().int().min(0).max(1000).nullable().optional(),
  milkDays: z.number().int().min(0).max(1000).nullable().optional(),
  breedingId: id.nullable().optional(),
  notes: text(2000).optional(),
});

export const hatchSchema = z.object({
  species: z.enum(['chicken', 'duck', 'turkey', 'goose']),
  setOn: date,
  eggsSet: z.number().int().min(1).max(10000),
  groupId: id.nullable().optional(),
  label: text(60).optional(),
  notes: text(500).optional(),
});
export const hatchPatchSchema = z.object({
  fertile: z.number().int().min(0).max(10000).nullable().optional(),
  status: z.literal('failed').optional(),
  hatched: z.number().int().min(0).max(10000).optional(),
  groupId: id.nullable().optional(),
});

export const breedingSchema = z.object({ damId: id.nullable().optional(), sire: text(80).optional(), bredOn: date, notes: text(1000).optional() });
export const breedingPatchSchema = z.object({ status: z.enum(['bred', 'confirmed', 'born', 'failed']), dueOn: date.optional() });
