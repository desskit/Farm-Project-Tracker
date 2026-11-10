import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { medicineBook } from '@/lib/data/review';
import { can } from '@/lib/domain/permissions';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { PrintButton } from '@/app/more/rent/print-button';
import { YearPicker, pickYear } from '../year-picker';
import p from '../print.module.css';

export const metadata = { title: 'Medicine book · Farm Project Tracker' };

/** Every treatment given in the year, with the dates meat and milk are clear again. */
export default async function MedicineBook({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'animals.view')) notFound();
  const thisYear = Number(todayISO().slice(0, 4));
  const year = pickYear(searchParams.year, thisYear);
  const rows = await medicineBook(user, year);
  return (
    <Screen title={`Medicine book ${year}`} subtitle="Treatments given and withdrawal dates" back="/more/export" actions={<PrintButton label="Print" />}>
      <YearPicker base="/print/medicine" year={year} thisYear={thisYear} />
      {rows.length === 0 ? <p className={p.note}>No treatments were logged in {year}.</p> : (
        <div className={p.scroll}>
          <table className={p.table}>
            <thead><tr><th>Date</th><th>Group</th><th>Animal</th><th>Product</th><th>Amount</th><th>Meat clear</th><th>Milk / eggs clear</th><th>Given by</th><th>Notes</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.date)}</td><td>{r.group}</td><td>{r.animal}</td><td>{r.product}</td><td>{r.qty}</td>
                  <td>{r.meatUntil ? fmtDate(r.meatUntil) : '—'}</td><td>{r.milkUntil ? fmtDate(r.milkUntil) : '—'}</td><td>{r.by}</td><td>{r.notes}</td>
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
