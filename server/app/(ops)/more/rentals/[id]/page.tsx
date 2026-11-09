import { notFound } from 'next/navigation';
import { MessageSquareWarning } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { rentalUnitDetail } from '@/lib/data/rentals';
import { listUsers } from '@/lib/data/users';
import { REQUEST_STATUS_LABEL } from '@/lib/data/requests';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';
import { CHARGE_KIND_LABEL, RENTAL_KIND_LABEL } from '@/lib/domain/rentals';
import { fmtDate, monthLabel, todayISO } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { EditRentalUnit, InspectionsCard, LeaseCard, UtilitiesCard } from './unit-client';
import s from '../../../farm/animals/animals.module.css';

const money = (n: number) => `$${n.toFixed(2)}`;

export default async function RentalUnitPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'rentals.manage')) notFound();
  const d = await rentalUnitDetail(params.id).catch((e) => {
    if (e instanceof DataError && e.status === 404) notFound();
    throw e;
  });
  const people = (await listUsers()).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }));
  const { unit } = d;
  const today = todayISO();

  return (
    <Screen
      title={unit.name}
      subtitle={[RENTAL_KIND_LABEL[unit.kind], unit.address, unit.active ? '' : 'archived'].filter(Boolean).join(' · ')}
      back="/more/rentals"
      actions={<EditRentalUnit unit={{ id: unit.id, name: unit.name, kind: unit.kind, address: unit.address, notes: unit.notes, active: unit.active }} />}
    >
      {unit.notes && <p>{unit.notes}</p>}
      <LeaseCard unitId={unit.id} lease={d.current} people={people} today={today} />

      <Card title="Charges" flush>
        {d.charges.length === 0 ? (
          <EmptyState title="No charges yet">Rent appears here each month once a lease is running.</EmptyState>
        ) : (
          d.charges.slice(0, 12).map((c) => (
            <div key={c.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{money(c.amount)} · {c.kind === 'rent' ? `Rent ${monthLabel(c.month)}` : c.label || CHARGE_KIND_LABEL[c.kind]}</strong>
                <small>Due {fmtDate(c.dueDate)}</small>
              </span>
              <StatusPill tone={c.status === 'verified' ? 'done' : c.status === 'marked' ? 'info' : c.dueDate < today ? 'overdue' : 'upcoming'}>
                {c.status === 'verified' ? 'Paid' : c.status === 'marked' ? 'Marked paid' : 'Unpaid'}
              </StatusPill>
            </div>
          ))
        )}
      </Card>

      <UtilitiesCard unitId={unit.id} accounts={d.accounts} hasLease={!!d.current} today={today} />
      <InspectionsCard unitId={unit.id} inspections={d.inspections} comparisons={d.comparisons} today={today} />

      <Card title="Requests" flush>
        {d.requests.length === 0 ? (
          <EmptyState icon={<MessageSquareWarning />} title="No requests from this unit" />
        ) : (
          d.requests.map((r) => (
            <ListRow key={r.id} href={`/requests/${r.id}`} lead={<MessageSquareWarning />} title={r.title} meta={new Date(r.createdAt).toLocaleDateString()}
              trail={<StatusPill tone={r.status === 'done' ? 'done' : r.status === 'declined' ? 'neutral' : r.urgent ? 'overdue' : 'today'}>{REQUEST_STATUS_LABEL[r.status]}</StatusPill>} />
          ))
        )}
      </Card>

      {d.past.length > 0 && (
        <Card title="Past leases" flush>
          {d.past.map((l) => (
            <ListRow key={l.id} title={l.tenants.map((t) => t.name).join(' & ') || 'Tenant'} meta={`${fmtDate(l.startDate)} – ${l.endDate ? fmtDate(l.endDate) : '?'} · ${money(l.rent)}/mo`} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
