/**
 * Chores and tasks moved from a single `assignedTo` to a list of `assigneeIds`.
 * A phone running the PWA keeps its cached bundle for a while after a deploy,
 * so requests in the old shape can still arrive. This folds them into the new
 * one instead of silently dropping the assignment.
 */
export function foldLegacyAssignee(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = input as Record<string, unknown>;
  if (Array.isArray(o.assigneeIds) || !('assignedTo' in o)) return input;
  const { assignedTo, ...rest } = o;
  return { ...rest, assigneeIds: typeof assignedTo === 'string' && assignedTo ? [assignedTo] : [] };
}
