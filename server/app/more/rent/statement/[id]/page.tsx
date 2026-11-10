import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { leases, rentCharges, rentalUnits } from '@/db/schema';
import { getSessionUser } from '@/lib/auth/session';
import { depositLedger, leaseIdsFor } from '@/lib/data/rentals';
import { can } from '@/lib/domain/permissions';
import { CHARGE_KIND_LABEL } from '@/lib/domain/rentals';
import { fmtDate, monthLabel, todayISO } from '@/lib/domain/dates';
import { Card, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles } from '@/components/patterns/stat-tiles';
import s from '../../../../(ops)/farm/animals/animals.module.css';
import { PrintButton } from '../../print-button';

export const metadata = { title: 'Statement · Farm Project Tracker' };
const money = (n: number) => `$${n.toFixed(2)}`;

/** Everything billed on a lease, what's been paid, what's outstanding, and the deposit. Tenants on the lease or finance.view. */
export default async function StatementPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) notFound();
  const [l] = await db.select({ l: leases, unit: rentalUnits.name }).from(leases).innerJoin(rentalUnits, eq(rentalUnits.id, leases.unitId)).where(eq(leases.id, params.id)).limit(1);
  if (!l) notFound();
  if (!can(user, 'finance.view') && !(await leaseIdsFor(user.id)).includes(l.l.id)) notFound();
  const [charges, deposit] = await Promise.all([
    db.select().from(rentCharges).where(eq(rentCharges.leaseId, l.l.id)).orderBy(desc(rentCharges.dueDate)),
    depositLedger(l.l.id),
  ]);
  const today = todayISO();
  const billed = charges.reduce((n, c) => n + c.amount, 0);
  const paid = charges.filter((c) => c.status === 'verified').reduce((n, c) => n + c.amount, 0);

  return (
    <Screen title="Statement" subtitle={`${l.unit} · as of ${fmtDate(today)}`} back="/more/rent" actions={<PrintButton />}>
      <StatTiles tiles={[{ label: 'Billed', value: money(billed) }, { label: 'Paid', value: money(paid) }, { label: 'Outstanding', value: money(billed - paid), tone: billed - paid > 0 ? 'warn' : undefined }, { label: 'Deposit held', value: money(deposit.balance) }]} />
      <Card title="Charges" flush>
        {charges.map((c) => (
          <div key={c.id} className={s.event}>
            <span className={s.eventMain}>
              <strong>{money(c.amount)} · {c.kind === 'rent' ? `Rent ${monthLabel(c.month)}` : c.label || CHARGE_KIND_LABEL[c.kind]}</strong>
              <small>Due {fmtDate(c.dueDate)}{c.verifiedAt ? ` · received ${fmtDate(c.verifiedAt)}` : ''}</small>
            </span>
            <StatusPill tone={c.status === 'verified' ? 'done' : c.status === 'marked' ? 'info' : c.dueDate < today ? 'overdue' : 'upcoming'}>
              {c.status === 'verified' ? 'Paid' : c.status === 'marked' ? 'Marked paid' : 'Unpaid'}
            </StatusPill>
          </div>
        ))}
      </Card>
      {deposit.entries.length > 0 && (
        <Card title="Deposit" flush>
          {deposit.entries.map((x) => (
            <div key={x.id} className={s.event}>
              <span className={s.eventMain}>
                <strong>{x.kind === 'received' ? '+' : '−'}{money(x.amount)} · {x.kind === 'received' ? 'Received' : x.kind === 'deduction' ? 'Deduction' : 'Refunded'}</strong>
                {x.reason && <span>{x.reason}</span>}
                <small>{fmtDate(x.date)}</small>
              </span>
            </div>
          ))}
        </Card>
      )}
    </Screen>
  );
}
