import { z } from 'zod';

export const entrySchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().max(500).optional(),
  username: z.string().max(200).optional(),
  secret: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
  visibility: z.enum(['private', 'groups', 'farm', 'everyone']),
  groupIds: z.array(z.string().max(64)).max(50).optional(),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(200).optional(),
  memberIds: z.array(z.string().max(64)).max(200),
});
