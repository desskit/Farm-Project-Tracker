import { StatusPill } from '@/components/ui';
import type { RequestStatus } from '@/db/schema';

const TONE = { open: 'today', in_progress: 'info', done: 'done', declined: 'neutral' } as const;
const LABEL: Record<RequestStatus, string> = { open: 'Open', in_progress: 'Being worked on', done: 'Done', declined: 'Declined' };

export function RequestStatusPill({ status }: { status: RequestStatus }) {
  return <StatusPill tone={TONE[status]}>{LABEL[status]}</StatusPill>;
}
