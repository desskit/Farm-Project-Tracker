import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { saleForViewer } from '@/lib/data/sales';
import { loanForViewer } from '@/lib/data/loans';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';
import { saleKindLabel } from '@/lib/domain/money';
import { EVERY_LABEL } from '@/lib/domain/loans';
import { fmtDate } from '@/lib/domain/dates';
import { Screen } from '@/components/patterns/screen';
import { PrintButton } from '@/app/more/rent/print-button';
import p from '../../../../print/print.module.css';

export const metadata = { title: 'Bill of sale · Farm Project Tracker' };

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One page to print and sign: who sold what to whom, for how much, and how it's being paid. */
export default async function BillOfSale({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const found = await saleForViewer(user, params.id).catch((e) => {
    if (e instanceof DataError && e.status === 404) notFound();
    throw e;
  });
  const { sale: s, recordedBy, sellerName, loanId } = found;
  const loan = loanId ? await loanForViewer(user, loanId).catch(() => null) : null;
  const seller = s.personal ? sellerName ?? '' : 'The farm';
  const buyer = loan?.borrowerName ?? s.buyer;

  return (
    <Screen title="Bill of sale" subtitle={fmtDate(s.date)} back={loan ? `/more/loans/${loan.id}` : '/more/sales'} actions={<PrintButton label="Print" />}>
      <table className={p.table}>
        <tbody>
          <tr><th>Date of sale</th><td>{fmtDate(s.date)}</td></tr>
          <tr><th>Seller</th><td>{seller}{!s.personal && recordedBy ? ` (recorded by ${recordedBy})` : ''}</td></tr>
          <tr><th>Buyer</th><td>{buyer || '________________________'}</td></tr>
          <tr><th>Item</th><td>{saleKindLabel(s)}{s.item ? `: ${s.item}` : ''}{s.qty ? ` (${s.qty} ${s.unit})` : ''}</td></tr>
          <tr><th>Serial / ID</th><td>{s.serial || '—'}</td></tr>
          <tr><th>Price</th><td><strong>{usd(s.amount)}</strong></td></tr>
          <tr>
            <th>Payment</th>
            <td>
              {loan
                ? `Paid in ${loan.state.schedule.length} payment${loan.state.schedule.length === 1 ? '' : 's'} of ${usd(loan.instalment)} ${EVERY_LABEL[loan.every]}, starting ${fmtDate(loan.firstDue)}, no interest. ${usd(loan.state.paid)} paid so far.`
                : s.paid ? `Paid in full${s.paidOn ? ` on ${fmtDate(s.paidOn)}` : ''}.` : 'Not yet paid.'}
            </td>
          </tr>
          {s.notes && <tr><th>Notes</th><td>{s.notes}</td></tr>}
        </tbody>
      </table>

      {loan && (
        <table className={p.table}>
          <thead><tr><th>#</th><th>Due</th><th>Amount</th></tr></thead>
          <tbody>
            {loan.state.schedule.map((i) => <tr key={i.n}><td>{i.n}</td><td>{fmtDate(i.date)}</td><td>{usd(i.amount)}</td></tr>)}
          </tbody>
        </table>
      )}

      <p className={p.sign}>Seller: ______________________________ &nbsp; Date: ____________</p>
      <p className={p.sign}>Buyer: ______________________________ &nbsp; Date: ____________</p>
      <p className={`${p.note} no-print`}>Print this or save it as a PDF, and both of you sign it.</p>
    </Screen>
  );
}
