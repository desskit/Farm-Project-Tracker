import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getDashboard, type DashboardItem } from '@/lib/data/dashboard';
import { CompleteChoreButton } from './_components/complete-chore-button';

export default async function HomePage({ searchParams }: { searchParams: { scope?: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main style={mainStyle}>
        <p style={titleStyle}>🌾 Farm Project Tracker</p>
        <p style={{ color: 'var(--muted)' }}>Server phase — foundation is up.</p>
        <p style={{ marginTop: 24 }}>
          <a href="/login">Log in</a>
        </p>
      </main>
    );
  }

  const scope = searchParams.scope === 'all' ? 'all' : 'mine';
  const buckets = await getDashboard(user, scope);
  const total = buckets.overdue.length + buckets.today.length + buckets.upcoming.length;

  return (
    <main style={mainStyle}>
      <div style={headRowStyle}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Today</h1>
          <p style={{ color: 'var(--muted)', margin: '2px 0 0' }}>
            Signed in as {user.name} ({user.role})
          </p>
        </div>
        <div style={segmentStyle}>
          <Link href="/?scope=mine" style={scope === 'mine' ? segActiveStyle : segLinkStyle}>
            Mine
          </Link>
          <Link href="/?scope=all" style={scope === 'all' ? segActiveStyle : segLinkStyle}>
            All
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: 24 }}>
          Nothing due in the next 7 days{scope === 'mine' ? ' for you' : ''}. 🎉
        </p>
      ) : (
        <>
          <BucketSection title="Overdue" items={buckets.overdue} />
          <BucketSection title="Due today" items={buckets.today} />
          <BucketSection title="Coming up" items={buckets.upcoming} />
        </>
      )}
    </main>
  );
}

function BucketSection({ title, items }: { title: string; items: DashboardItem[] }) {
  if (!items.length) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={sectionTitleStyle}>
        {title} <span style={countStyle}>{items.length}</span>
      </h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {items.map((it) => (
          <li key={it.kind + it.id} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/chores/${it.id}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                {it.title}
              </Link>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 0' }}>{it.subtitle}</p>
            </div>
            <CompleteChoreButton choreId={it.id} gated={it.gated} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const mainStyle: CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '24px 20px 48px' };
const titleStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };
const headRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 };
const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--muted)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
const countStyle: CSSProperties = { background: 'var(--surface-2)', color: 'var(--muted)', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 700 };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--surface)',
};
const segmentStyle: CSSProperties = { display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 3, borderRadius: 999 };
const segLinkStyle: CSSProperties = { padding: '5px 12px', borderRadius: 999, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const segActiveStyle: CSSProperties = { ...segLinkStyle, background: 'var(--surface)', color: 'var(--text)', fontWeight: 700 };
