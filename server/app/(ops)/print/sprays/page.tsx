import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { sprayRecord } from '@/lib/data/review';
import { can } from '@/lib/domain/permissions';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { PrintButton } from '@/app/more/rent/print-button';
import { YearPicker, pickYear } from '../year-picker';
import p from '../print.module.css';

export const metadata = { title: 'Spray record · Farm Project Tracker' };

/** Every spray in the year: where, what, how much, and the first day harvest is allowed again. */
export default async function SprayRecord({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'land.view')) notFound();
  const thisYear = Number(todayISO().slice(0, 4));
  const year = pickYear(searchParams.year, thisYear);
  const rows = await sprayRecord(user, year);
  return (
    <Screen title={`Spray record ${year}`} subtitle="What was applied, where, and when harvest is allowed" back="/more/export" actions={<PrintButton label="Print" />}>
      <YearPicker base="/print/sprays" year={year} thisYear={thisYear} />
      {rows.length === 0 ? <p className={p.note}>No sprays were logged in {year}.</p> : (
        <div className={p.scroll}>
          <table className={p.table}>
            <thead><tr><th>Date</th><th>Where</th><th>Product</th><th>Amount</th><th>Harvest from</th><th>Applied by</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.date)}</td><td>{r.unit}</td><td>{r.product}</td><td>{r.qty}</td><td>{r.harvestFrom ? fmtDate(r.harvestFrom) : '—'}</td><td>{r.by}</td><td>{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={p.sign}>Checked by: ______________________ &nbsp; Date: ____________</p>
    </Screen>
  );
}
