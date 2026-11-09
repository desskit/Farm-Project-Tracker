import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { datasetsFor } from '@/lib/data/csv';
import { addDays, todayISO } from '@/lib/domain/dates';
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
    </Screen>
  );
}
