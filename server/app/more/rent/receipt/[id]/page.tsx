import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { leases, rentalUnits, users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth/session';
import { chargeIsMine, rentChargeById } from '@/lib/data/rent';
import { can } from '@/lib/domain/permissions';
import { CHARGE_KIND_LABEL } from '@/lib/domain/rentals';
import { fmtDate, monthLabel } from '@/lib/domain/dates';
import { Card } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import p from '@/components/patterns/patterns.module.css';
import { PrintButton } from '../../print-button';

export const metadata = { title: 'Receipt · Farm Project Tracker' };

/** A printable receipt for a charge the farm has confirmed as received. */
export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) notFound();
  const c = await rentChargeById(params.id);
  if (!c || c.status !== 'verified') notFound();
  if (!can(user, 'finance.view') && !(await chargeIsMine(user.id, c))) notFound();
  const [[payer], unit] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, c.userId)).limit(1),
    c.leaseId
      ? db.select({ name: rentalUnits.name, address: rentalUnits.address }).from(leases).innerJoin(rentalUnits, eq(rentalUnits.id, leases.unitId)).where(eq(leases.id, c.leaseId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const what = c.kind === 'rent' ? `Rent for ${monthLabel(c.month)}` : c.label || CHARGE_KIND_LABEL[c.kind];
  const row = (label: string, value: string) => <div className={p.kv}><span className={p.kvLabel}>{label}</span><strong>{value}</strong></div>;

  return (
    <Screen title="Receipt" subtitle={`No. ${c.id.slice(-8).toUpperCase()}`} back="/more/rent/history" actions={<PrintButton />}>
      <Card flush>
        {row('Received from', payer?.name ?? 'Tenant')}
        {unit && row('For', [unit.name, unit.address].filter(Boolean).join(' · '))}
        {row('Payment for', what)}
        {row('Amount', `$${c.amount.toFixed(2)}`)}
        {row('Received', c.verifiedAt ? fmtDate(c.verifiedAt) : '')}
        {c.note ? row('Note', c.note) : null}
      </Card>
    </Screen>
  );
}
