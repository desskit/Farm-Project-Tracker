import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { datasetsFor } from '@/lib/data/csv';
import { addDays, todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { Card } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';
import { Screen } from '@/components/patterns/screen';
import { ExportList } from './export-list';

export const metadata = { title: 'Export · Farm Project Tracker' };

export default async function ExportPage() {
  const user = await getSessionUser();
  if (!user) notFound();
  const sets = datasetsFor(user);
  if (!sets.length) notFound();
  const today = todayISO();
  return (
    <Screen title="Export" subtitle="Spreadsheets (CSV) of the farm’s records" back="/more">
      <ExportList sets={sets} from={addDays(today, -365)} to={today} />
      {can(user, 'finance.manage') && (
        <Card title="Tax-year pack">
          <p className={s.muted}>Income, what was paid out by category, and the receipts on file, in one download for your accountant.</p>
          <div className={s.actions}>
            {[Number(today.slice(0, 4)), Number(today.slice(0, 4)) - 1].map((y) => (
              <a key={y} href={`/api/data/tax-pack?year=${y}`} download className={s.fileBtn}>{y}</a>
            ))}
          </div>
        </Card>
      )}
    </Screen>
  );
}
