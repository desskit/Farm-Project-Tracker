import { FileText, MessageSquareWarning, Wallet } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { rentChargesForMonth, rentAssignmentFor } from '@/lib/data/rent';
import { rentDocCountFor } from '@/lib/data/rent-docs';
import { listRequests } from '@/lib/data/requests';
import { currentMonthKey, monthLabel } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { ButtonLink, Card, ListRow, PageHeader, StatusPill } from '@/components/ui';
import s from './portal-home.module.css';

const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

/**
 * Home for people who don't use the farm app — renters: this month's rent,
 * their documents and their maintenance requests, nothing else.
 */
export async function PortalHome({ user }: { user: SessionUser }) {
  const mk = currentMonthKey();
  const [charges, assignment, docCount, requests] = await Promise.all([
    rentChargesForMonth(mk),
    rentAssignmentFor(user.id),
    rentDocCountFor(user.id),
    listRequests(user),
  ]);
  const charge = charges.find((c) => c.userId === user.id);
  const openRequests = requests.filter((r) => r.status === 'open' || r.status === 'in_progress').length;

  return (
    <main className={s.wrap}>
      <PageHeader title={`Hi, ${user.name.split(' ')[0]}`} subtitle="Your rent, documents and requests" />

      <Card title={`Rent · ${monthLabel(mk)}`}>
        {charge ? (
          <div className={s.rent}>
            <span className={s.amount}>{money(charge.amount)}</span>
            {charge.status === 'verified' ? (
              <StatusPill tone="done">Paid — thank you</StatusPill>
            ) : charge.status === 'marked' ? (
              <StatusPill tone="info">Marked paid · waiting for confirmation</StatusPill>
            ) : (
              <StatusPill tone={charge.dueDate && charge.dueDate < new Date().toISOString().slice(0, 10) ? 'overdue' : 'today'}>
                Due {charge.dueDate}
              </StatusPill>
            )}
            <ButtonLink href="/more/rent" variant={charge.status === 'unpaid' ? 'primary' : 'secondary'} size="sm">
              {charge.status === 'unpaid' ? 'I’ve paid — mark it' : 'Rent history'}
            </ButtonLink>
          </div>
        ) : (
          <p className={s.muted}>{assignment ? 'This month’s charge isn’t out yet.' : 'No rent is set up for you.'}</p>
        )}
      </Card>

      <Card flush>
        <ListRow href="/more/rent#documents" lead={<FileText />} title="Documents" meta={docCount ? `${docCount} on file` : 'Lease and paperwork'} />
        {can(user, 'requests.create') && (
          <ListRow
            href="/requests"
            lead={<MessageSquareWarning />}
            title="Requests"
            meta="Something need fixing? Tell us here"
            trail={openRequests ? <StatusPill tone="info">{openRequests} open</StatusPill> : undefined}
          />
        )}
        <ListRow href="/more/rent" lead={<Wallet />} title="Rent & payments" meta="This month and past months" />
      </Card>
    </main>
  );
}
