import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().max(64);

export const noticeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(2000).optional(),
  audience: z.enum(['farm', 'tenants', 'everyone']),
  expiresOn: date.nullable().optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(['emergency', 'vet', 'farrier', 'supplier', 'utility', 'other']).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  showTenants: z.boolean().optional(),
});

export const guideSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().max(500).optional(),
  steps: z.array(z.object({ text: z.string().max(1000) })).min(1).max(60),
  photos: z.array(z.object({ attachmentId: id, step: z.number().int().min(-1).max(60) })).max(40).optional(),
});

export const guideLinkSchema = z.object({
  parentType: z.enum(['chore', 'asset', 'animal_group', 'land_unit']),
  parentId: id,
  on: z.boolean(),
});
