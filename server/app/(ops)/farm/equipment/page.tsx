import { notFound } from 'next/navigation';
import { Tractor } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listEquipment } from '@/lib/data/equipment';
import { can } from '@/lib/domain/permissions';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Card, EmptyState, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { CheckoutButtons } from './checkout-buttons';

export const metadata = { title: 'Equipment · Farm Project Tracker' };

const day = (ms: number) => fmtDate(new Date(ms).toISOString().slice(0, 10));

/** Who has what: tools, trailers and vehicles that are out, and what's here. */
export default async function EquipmentPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const today = todayISO();
  const rows = await listEquipment(user, today);
  const out = rows.filter((r) => r.out);
  const here = rows.filter((r) => !r.out);
  const manage = can(user, 'work.manage');
  const canTake = can(user, 'work.do');

  return (
    <Screen title="Equipment" subtitle="Who has what" back="/farm">
      {rows.length === 0 && <Card><EmptyState icon={<Tractor />} title="No equipment yet">Add tools, trailers and vehicles under Assets.</EmptyState></Card>}
      {out.length > 0 && (
        <Card title={`Out now (${out.length})`} flush>
          {out.map((r) => (
            <ListRow
              key={r.id}
              href={`/maintenance/${r.id}`}
              lead={<Tractor />}
              title={r.name}
              meta={`${r.out!.userId === user.id ? 'You' : r.out!.who} · since ${day(r.out!.outAt)}${r.out!.dueBack ? ` · back by ${fmtDate(r.out!.dueBack)}` : ''}`}
              trail={r.out!.overdue ? <StatusPill tone="overdue">Overdue</StatusPill> : undefined}
            />
          ))}
        </Card>
      )}
      {here.length > 0 && (
        <Card title="Here" flush>
          {here.map((r) => (
            <ListRow key={r.id} lead={<Tractor />} title={r.name} meta={r.category} trail={canTake ? <CheckoutButtons assetId={r.id} name={r.name} out={null} me={user.id} canManage={manage} today={today} /> : undefined} />
          ))}
        </Card>
      )}
    </Screen>
  );
}
