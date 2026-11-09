import { redirect } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { rentHistoryFor } from '@/lib/data/rent';
import { listUsers } from '@/lib/data/users';
import { can } from '@/lib/domain/permissions';
import { fmtDate, monthLabel } from '@/lib/domain/dates';
import { Button, Card, EmptyState, Select, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import s from '@/components/patterns/patterns.module.css';
import r from '../rent.module.css';

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

/** Every month's rent for one person: renters see their own; money people can pick anyone. */
export default async function RentHistoryPage({ searchParams }: { searchParams: { person?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const seesAll = can(user, 'finance.view');
  const people = seesAll ? (await listUsers()).filter((p) => p.active) : [];
  const personId = seesAll && searchParams.person && people.some((p) => p.id === searchParams.person) ? searchParams.person : user.id;
  const rows = await rentHistoryFor(personId);
  const paid = rows.filter((c) => c.status === 'verified').reduce((n, c) => n + c.amount, 0);
  const owed = rows.filter((c) => c.status !== 'verified').reduce((n, c) => n + c.amount, 0);

  return (
    <Screen title="Rent history" back="/more/rent">
      {seesAll && (
        <form method="get" className={r.row}>
          <Select name="person" defaultValue={personId} aria-label="Person">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Show</Button>
        </form>
      )}
      <StatTiles tiles={[{ label: 'paid', value: money(paid), tone: 'good' }, { label: 'not yet confirmed', value: money(owed), tone: owed ? 'warn' : undefined }]} />
      <Card flush>
        {!rows.length ? (
          <EmptyState icon={<Wallet />} title="No rent charges yet" />
        ) : (
          rows.map((c) => (
            <div className={s.kv} key={c.id}>
              <span className={s.kvLabel}>
                {monthLabel(c.month)}
                {c.status === 'verified' ? (
                  <StatusPill tone="done">Paid{c.verifiedAt ? ` ${fmtDate(c.verifiedAt)}` : ''}</StatusPill>
                ) : c.status === 'marked' ? (
                  <StatusPill tone="info">Marked paid</StatusPill>
                ) : (
                  <StatusPill tone="overdue">Unpaid · due {fmtDate(c.dueDate)}</StatusPill>
                )}
              </span>
              <strong>{money(c.amount)}</strong>
            </div>
          ))
        )}
      </Card>
    </Screen>
  );
}
