import Link from 'next/link';
import type { SessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';
import { fmtDate, monthLabel, relativeLabel, todayISO } from '@/lib/domain/dates';
import { rentBoard } from '@/lib/data/simple';
import { listRequests } from '@/lib/data/requests';
import { leaseReminderText, leaseRemindersDue } from '@/lib/data/rentals';
import { getDashboard } from '@/lib/data/dashboard';
import { listVault } from '@/lib/data/vault';
import { DoneButton } from '@/components/patterns/work-buttons';
import { Notices } from './notices';
import { CodeCard } from './secret-buttons';
import { RentLineActions } from './simple-rent';
import { SwitchToFull } from './simple-switch';
import s from './simple-home.module.css';

const STATUS_WORD = { paid: 'Paid', waiting: 'Says they paid', owed: 'Not paid yet', late: 'Late' } as const;
const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * The Simple layout's home: only what an occasional user needs, in plain
 * words and big buttons. Each section shows only if they're allowed to use it.
 */
export async function SimpleHome({ user }: { user: SessionUser }) {
  const today = todayISO();
  const [board, requests, leasesDue, mine, codes] = await Promise.all([
    can(user, 'finance.view') ? rentBoard(user) : Promise.resolve(null),
    can(user, 'requests.manage') ? listRequests(user) : Promise.resolve([]),
    can(user, 'rentals.manage') ? leaseRemindersDue(today) : Promise.resolve([]),
    can(user, 'work.do') ? getDashboard(user, 'mine') : Promise.resolve(null),
    can(user, 'vault.use') ? listVault(user) : Promise.resolve([]),
  ]);
  const openRequests = requests.filter((r) => r.status === 'open' || r.status === 'in_progress');
  const chores = mine ? [...mine.overdue, ...mine.today].filter((i) => i.kind === 'chore') : [];
  const canRecord = can(user, 'finance.manage');

  return (
    <main className={s.wrap}>
      <div>
        <h1 className={s.hello}>{greeting()}, {user.name.split(' ')[0]}</h1>
        <p className={s.date}>{fmtDate(today)}</p>
      </div>
      <Notices user={user} />

      {board && (
        <section className={s.section} aria-labelledby="sh-rent">
          <h2 id="sh-rent" className={s.sectionTitle}>Rent for {monthLabel(board.month)}</h2>
          {board.rows.length === 0 ? (
            <p className={s.empty}>No rent due this month.</p>
          ) : (
            <>
              <p className={s.sentence}>
                {board.paidCount} of {board.rows.length} paid · {usd(board.collected)} in{board.owed > 0 ? ` · ${usd(board.owed)} still to come` : ''}.
                {board.waiting > 0 && <strong> {board.waiting === 1 ? 'One payment needs' : `${board.waiting} payments need`} your OK.</strong>}
              </p>
              {board.rows.map((r) => (
                <div key={r.id} className={s.line}>
                  <div className={s.lineHead}>
                    <span className={s.lineWho}>{r.who}</span>
                    <span className={s.lineAmount}>{usd(r.amount)}</span>
                  </div>
                  <div className={s.lineMeta}>
                    {r.what} · due {fmtDate(r.dueDate)} · <span className={`${s.status} ${s[r.status]}`}>{STATUS_WORD[r.status]}</span>
                    {r.credited > 0 && <> · {usd(r.credited)} covered by work, {usd(r.amount - r.credited)} left</>}
                  </div>
                  {canRecord && <RentLineActions id={r.id} status={r.status} who={r.who} amount={Math.round((r.amount - r.credited) * 100) / 100} />}
                </div>
              ))}
            </>
          )}
          <Link href="/more/rent" className={s.link}>All rent details <span aria-hidden>›</span></Link>
        </section>
      )}

      {(openRequests.length > 0 || leasesDue.length > 0) && (
        <section className={s.section} aria-labelledby="sh-repairs">
          <h2 id="sh-repairs" className={s.sectionTitle}>Repairs &amp; leases</h2>
          {openRequests.slice(0, 3).map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`} className={s.link}>
              <span>
                {r.urgent ? 'Urgent: ' : ''}{r.title}
                <small>{r.unitName ? `${r.unitName} · ` : ''}from {r.createdByName}</small>
              </span>
              <span aria-hidden>›</span>
            </Link>
          ))}
          {openRequests.length > 3 && <Link href="/requests" className={s.link}>All {openRequests.length} repair requests <span aria-hidden>›</span></Link>}
          {leasesDue.map((l) => (
            <Link key={l.leaseId} href={`/more/rentals/${l.unitId}`} className={s.link}>
              <span>{leaseReminderText(l)}</span>
              <span aria-hidden>›</span>
            </Link>
          ))}
        </section>
      )}

      {mine && (
        <section className={s.section} aria-labelledby="sh-chores">
          <h2 id="sh-chores" className={s.sectionTitle}>Your chores today</h2>
          {chores.length === 0 ? (
            <p className={s.empty}>Nothing for you today.</p>
          ) : (
            chores.map((c) => (
              <div key={c.id} className={s.line}>
                <div className={s.lineHead}>
                  <span className={s.lineWho}>{c.title}</span>
                </div>
                <div className={s.lineMeta}>{c.bucket === 'overdue' ? `Was due ${relativeLabel(c.dueDate)}` : 'Due today'}{c.subtitle ? ` · ${c.subtitle}` : ''}</div>
                <div className={s.bigActions}>
                  {c.gated ? <Link href={c.href} className={s.link}>Open it <span aria-hidden>›</span></Link> : <DoneButton choreId={c.id} label={c.title} />}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {codes.length > 0 && (
        <section className={s.section} aria-labelledby="sh-codes">
          <h2 id="sh-codes" className={s.sectionTitle}>Codes &amp; passwords</h2>
          {codes.slice(0, 6).map((e) => <CodeCard key={e.id} id={e.id} title={e.title} username={e.username} />)}
          {codes.length > 6 && <Link href="/vault" className={s.link}>All {codes.length} codes <span aria-hidden>›</span></Link>}
        </section>
      )}

      <div className={s.switchBack}><SwitchToFull /></div>
    </main>
  );
}
