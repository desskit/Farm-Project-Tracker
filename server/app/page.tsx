import Link from 'next/link';
import { AlertTriangle, Baby, Egg, Hand, ShieldAlert, MessageSquareWarning, Package, Users, Wallet, Wrench } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getDashboard, type DashboardItem } from '@/lib/data/dashboard';
import { farmCards, upForGrabs } from '@/lib/data/today';
import { livestockAlerts } from '@/lib/data/livestock';
import { can } from '@/lib/domain/permissions';
import { addDays, fmtDate, relativeLabel, todayISO } from '@/lib/domain/dates';
import { ButtonLink, Card, EmptyState, ListRow, PageHeader } from '@/components/ui';
import { WorkItemRow } from '@/components/patterns/work-item-row';
import { ClaimButton } from '@/components/patterns/work-buttons';
import { WeatherWidget } from './_components/weather-widget';
import { PortalHome } from './_components/portal-home';
import s from './today.module.css';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default async function TodayPage({ searchParams }: { searchParams: { scope?: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="auth-wrap">
        <p className="auth-brand">🌾 Farm Project Tracker</p>
        <p className="subtle">Chores, equipment upkeep, and projects — all in one place.</p>
        <p style={{ marginTop: 24 }}>
          <Link href="/login" className="btn primary block">
            Log in
          </Link>
        </p>
      </main>
    );
  }

  // Renters (no farm access) get their own home: rent, documents, requests.
  if (!can(user, 'farm.view')) return <PortalHome user={user} />;

  // "Everything due" view for people who can see all the farm's work.
  const everything = searchParams.scope === 'all' && can(user, 'work.viewAll');
  const [mine, grabs, cards, animals] = await Promise.all([
    getDashboard(user, everything ? 'all' : 'mine'),
    everything ? Promise.resolve([]) : upForGrabs(user),
    everything ? Promise.resolve(null) : farmCards(user),
    everything || !can(user, 'animals.view') ? Promise.resolve(null) : livestockAlerts(todayISO(), 7),
  ]);
  const total = mine.overdue.length + mine.today.length + mine.upcoming.length;

  return (
    <main className={s.wrap}>
      <PageHeader
        title={everything ? 'Everything due' : `${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={everything ? 'All the farm’s work for the next week' : 'Here’s your day'}
        actions={
          can(user, 'work.viewAll') ? (
            <ButtonLink href={everything ? '/' : '/?scope=all'} size="sm" variant="ghost">
              {everything ? 'My day' : 'Everything'}
            </ButtonLink>
          ) : undefined
        }
      />

      {!everything && <WeatherWidget />}

      {cards && <FarmToday cards={cards} />}
      {animals && <AnimalsToday a={animals} />}

      {total === 0 ? (
        <Card>
          <EmptyState title={everything ? 'Nothing due this week' : 'You’re all caught up'}>
            {grabs.length ? 'Nothing assigned to you is due. There’s open work below if you want it.' : 'Nothing due for you in the next 7 days.'}
          </EmptyState>
        </Card>
      ) : (
        <>
          <Bucket title="Overdue" items={mine.overdue} />
          <Bucket title="Today" items={mine.today} />
          <Bucket title="Coming up" items={mine.upcoming} />
        </>
      )}

      {grabs.length > 0 && (
        <Card title={<span className={s.titleIcon}><Hand aria-hidden /> Up for grabs</span>} flush>
          {grabs.map((g) => (
            <ListRow
              key={g.kind + g.id}
              title={<Link href={g.href} className={s.link}>{g.title}</Link>}
              meta={`${g.subtitle}${g.dueDate ? ` · ${relativeLabel(g.dueDate)}` : ''}`}
              trail={<ClaimButton kind={g.kind} id={g.id} label={g.title} />}
            />
          ))}
        </Card>
      )}
    </main>
  );
}

/** Eggs so far, births close, and anything that mustn't be sold or eaten yet. */
function AnimalsToday({ a }: { a: Awaited<ReturnType<typeof livestockAlerts>> }) {
  if (!a.eggs && !a.births.length && !a.withdrawals.length) return null;
  const soon = addDays(todayISO(), 7);
  return (
    <Card title="Animals" action={<ButtonLink href="/farm/animals" size="sm" variant="ghost">Open</ButtonLink>} flush>
      {a.eggs && (
        <ListRow
          href="/farm/animals"
          lead={<Egg />}
          title={`${a.eggs.today} eggs today`}
          meta={`${a.eggs.thisWeek} this week${a.eggs.pct != null ? ` (${a.eggs.pct >= 0 ? '+' : ''}${a.eggs.pct}% on last week)` : ''}`}
        />
      )}
      {a.births.filter((b) => b.dueOn <= soon).map((b) => (
        <ListRow key={b.id} href={`/farm/animals/${b.groupId}`} lead={<Baby />} title={`${b.dam ?? b.groupName} due ${relativeLabel(b.dueOn)}`} meta={`Around ${fmtDate(b.dueOn)} · ${b.groupName}`} />
      ))}
      {a.withdrawals.map((w) => (
        <ListRow
          key={w.id}
          href={`/farm/animals/${w.groupId}`}
          lead={<ShieldAlert />}
          title={`${w.groupName}: withholding`}
          meta={[w.milkUntil && `milk/eggs until ${fmtDate(w.milkUntil)}`, w.meatUntil && `meat until ${fmtDate(w.meatUntil)}`, w.what].filter(Boolean).join(' · ')}
        />
      ))}
    </Card>
  );
}

function Bucket({ title, items }: { title: string; items: DashboardItem[] }) {
  if (!items.length) return null;
  return (
    <Card title={<span className={s.titleIcon}>{title} <span className={s.count}>{items.length}</span></span>} flush>
      {items.map((it) => (
        <WorkItemRow key={it.kind + it.id} item={it} />
      ))}
    </Card>
  );
}

function FarmToday({ cards }: { cards: NonNullable<Awaited<ReturnType<typeof farmCards>>> }) {
  const tiles: { href: string; icon: React.ReactNode; label: string; value: number | string; tone?: 'overdue' | 'today' }[] = [];
  if (cards.needsAttention !== undefined)
    tiles.push({ href: '/?scope=all', icon: <AlertTriangle />, label: 'Overdue on the farm', value: cards.needsAttention, tone: cards.needsAttention ? 'overdue' : undefined });
  if (cards.upkeepDue !== undefined)
    tiles.push({ href: '/maintenance', icon: <Wrench />, label: 'Upkeep due', value: cards.upkeepDue, tone: cards.upkeepDue ? 'today' : undefined });
  if (cards.lowStock !== undefined)
    tiles.push({ href: '/more/supplies', icon: <Package />, label: 'Supplies low', value: cards.lowStock, tone: cards.lowStock ? 'today' : undefined });
  if (cards.rentToVerify !== undefined)
    tiles.push({ href: '/more/rent', icon: <Wallet />, label: 'Rent to confirm', value: cards.rentToVerify, tone: cards.rentToVerify ? 'today' : undefined });
  if (cards.openRequests !== undefined)
    tiles.push({ href: '/requests', icon: <MessageSquareWarning />, label: 'Open requests', value: cards.openRequests, tone: cards.openRequests ? 'today' : undefined });
  if (cards.team) tiles.push({ href: '/more/team', icon: <Users />, label: 'Team', value: 'View' });

  return (
    <section aria-label="Farm today" className={s.tiles}>
      {tiles.map((t) => (
        <Link key={t.href + t.label} href={t.href} className={`${s.tile} ${t.tone ? s[t.tone] : ''}`}>
          <span className={s.tileIcon}>{t.icon}</span>
          <span className={s.tileValue}>{t.value}</span>
          <span className={s.tileLabel}>{t.label}</span>
        </Link>
      ))}
    </section>
  );
}

