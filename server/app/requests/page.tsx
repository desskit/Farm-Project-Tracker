import { redirect } from 'next/navigation';
import { MessageSquareWarning } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listRequests } from '@/lib/data/requests';
import { can } from '@/lib/domain/permissions';
import { Card, EmptyState, ListRow, PageHeader } from '@/components/ui';
import { NewRequestForm } from './new-request-form';
import { RequestStatusPill } from './status-pill';
import s from './requests.module.css';

export const metadata = { title: 'Requests · Farm Project Tracker' };

export default async function RequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const manages = can(user, 'requests.manage');
  const requests = await listRequests(user);
  const open = requests.filter((r) => r.status === 'open' || r.status === 'in_progress');
  const closed = requests.filter((r) => r.status === 'done' || r.status === 'declined');

  const row = (r: (typeof requests)[number]) => (
    <ListRow
      key={r.id}
      href={`/requests/${r.id}`}
      lead={<MessageSquareWarning />}
      title={`${r.urgent ? '⚠︎ ' : ''}${r.title}`}
      meta={`${manages ? `${r.createdByName} · ` : ''}${new Date(r.createdAt).toLocaleDateString()}`}
      trail={<RequestStatusPill status={r.status} />}
    />
  );

  return (
    <main className={s.wrap}>
      <PageHeader
        title="Requests"
        subtitle={manages ? 'Everything reported that needs fixing' : 'Tell us what needs fixing; follow along here'}
      />
      {can(user, 'requests.create') && <NewRequestForm />}
      <Card title={manages ? 'Open' : 'Your requests'} flush>
        {open.length ? open.map(row) : <EmptyState title="Nothing open">New requests show up here.</EmptyState>}
      </Card>
      {closed.length > 0 && (
        <Card title="Closed" flush>
          {closed.slice(0, 30).map(row)}
        </Card>
      )}
    </main>
  );
}
