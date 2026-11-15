import { z } from 'zod';

export const entrySchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().max(500).optional(),
  username: z.string().max(200).optional(),
  secret: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  /** Who it's shared with; empty = only me. Left out on an edit = unchanged. */
  shares: z.array(z.object({
    type: z.enum(['user', 'group', 'role', 'farm', 'everyone']),
    target: z.string().max(64).optional(),
    canEdit: z.boolean().optional(),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })).max(50).optional(),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(200).optional(),
  memberIds: z.array(z.string().max(64)).max(200),
});
