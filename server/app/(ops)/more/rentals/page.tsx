import { notFound } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listRentalUnits } from '@/lib/data/rentals';
import { can } from '@/lib/domain/permissions';
import { RENTAL_KIND_LABEL } from '@/lib/domain/rentals';
import { fmtDate } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import { NewRentalUnitButton } from './rentals-client';
import s from '../../farm/animals/animals.module.css';

export const metadata = { title: 'Rentals · Farm Project Tracker' };

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function RentalsPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'rentals.manage')) notFound();
  const units = await listRentalUnits();
  const live = units.filter((u) => u.active);
  const occupied = live.filter((u) => u.lease).length;
  const ending = live.filter((u) => u.stage).length;
  const requests = live.reduce((n, u) => n + u.openRequests, 0);
  const monthly = live.reduce((n, u) => n + (u.lease?.rent ?? 0), 0);

  return (
    <Screen title="Rentals" subtitle="Units, leases, utilities and inspections" back="/more/rent" actions={<NewRentalUnitButton />}>
      {units.length > 0 && (
        <StatTiles
          tiles={[
            { label: 'Occupied', value: `${occupied}/${live.length}` },
            { label: 'Rent / month', value: money(monthly) },
            { label: 'Leases to act on', value: ending, tone: ending ? 'warn' : undefined },
            { label: 'Open requests', value: requests, tone: requests ? 'warn' : undefined, href: '/requests' },
          ]}
        />
      )}
      <Card flush>
        {units.length === 0 ? (
          <EmptyState icon={<Building2 />} title="No rental units">Add each house, apartment, room or cabin you rent out.</EmptyState>
        ) : (
          units.map((u) => (
            <ListRow
              key={u.id}
              href={`/more/rentals/${u.id}`}
              lead={<Building2 />}
              title={u.name}
              meta={[
                RENTAL_KIND_LABEL[u.kind],
                u.lease ? u.lease.tenants.map((t) => t.name).join(' & ') : 'Vacant',
                u.lease ? `${money(u.lease.rent)}/mo` : '',
                u.lease ? (u.lease.endDate ? `to ${fmtDate(u.lease.endDate)}` : 'month to month') : '',
              ].filter(Boolean).join(' · ')}
              trail={
                <span className={s.pills}>
                  {!u.active && <StatusPill tone="neutral">Archived</StatusPill>}
                  {u.stage && <StatusPill tone={u.stage === 'renewal' ? 'upcoming' : 'overdue'}>{u.stage === 'renewal' ? 'Renewal due' : u.stage === 'ending' ? 'Ending soon' : 'Past end'}</StatusPill>}
                  {u.openRequests > 0 && <StatusPill tone="today">{u.openRequests} request{u.openRequests === 1 ? '' : 's'}</StatusPill>}
                </span>
              }
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
