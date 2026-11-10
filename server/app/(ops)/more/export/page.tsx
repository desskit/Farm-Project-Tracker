import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { datasetsFor } from '@/lib/data/csv';
import { addDays, todayISO } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { CalendarRange, ClipboardList, Pill, SprayCan } from 'lucide-react';
import { Card, ListRow } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';
import { Screen } from '@/components/patterns/screen';
import { ExportList } from './export-list';

export const metadata = { title: 'Export · Farm Project Tracker' };

export default async function ExportPage() {
  const user = await getSessionUser();
  if (!user) notFound();
  const sets = datasetsFor(user);
  if (!sets.length && !can(user, 'farm.view')) notFound();
  const today = todayISO();
  return (
    <Screen title="Export" subtitle="Spreadsheets and printable records" back="/more">
      {sets.length > 0 && <ExportList sets={sets} from={addDays(today, -365)} to={today} />}
      <Card title="To print" flush>
        <ListRow href="/print/chores" lead={<ClipboardList />} title="Weekly chore sheet" meta="The week ahead, with a box to tick, for the barn wall" />
        {can(user, 'animals.view') && <ListRow href="/print/medicine" lead={<Pill />} title="Medicine book" meta="Treatments given and withdrawal dates" />}
        {can(user, 'land.view') && <ListRow href="/print/sprays" lead={<SprayCan />} title="Spray record" meta="What was applied, where, and harvest-from dates" />}
        <ListRow href="/more/review" lead={<CalendarRange />} title="Year in review" meta="Eggs, harvest, chores, hours and money for the year" />
      </Card>
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
