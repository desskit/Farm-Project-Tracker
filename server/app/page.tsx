import type { CSSProperties } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { listUsers } from '@/lib/data/users';
import { InviteForm } from './invite-form';

/**
 * Placeholder landing page for the server-phase build. The full dashboard UI
 * (ported from js/app.js) arrives in the UI phase; for now this confirms auth
 * works end-to-end and gives admins a way to invite the rest of the crew.
 */
export default async function HomePage() {
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

  const isAdmin = user.role === 'admin';
  const people = isAdmin ? await listUsers() : null;

  return (
    <main style={mainStyle}>
      <p style={titleStyle}>🌾 Farm Project Tracker</p>
      <p style={{ color: 'var(--muted)' }}>Server phase — foundation is up.</p>
      <p style={{ marginTop: 24 }}>
        Signed in as <strong>{user.name}</strong> ({user.role}). <a href="/api/auth/logout">Log out</a>
      </p>

      {isAdmin && people && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 18 }}>People</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {people.map((p) => (
              <li key={p.id} style={rowStyle}>
                {p.name} · {p.email} · {p.role}
                {p.pending ? ' · invite pending' : ''}
              </li>
            ))}
          </ul>
          <h3 style={{ fontSize: 16, marginTop: 24 }}>Invite someone</h3>
          <InviteForm />
        </section>
      )}
    </main>
  );
}

const mainStyle: CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '48px 20px' };
const titleStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };
const rowStyle: CSSProperties = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10 };
