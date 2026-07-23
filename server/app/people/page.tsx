import type { CSSProperties } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { listUsers } from '@/lib/data/users';
import { InviteForm } from './invite-form';

export default async function PeoplePage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  if (user.role !== 'admin') {
    return (
      <main style={mainStyle}>
        <h1 style={{ fontSize: 22 }}>People</h1>
        <p style={{ color: 'var(--muted)' }}>Only admins can manage people.</p>
      </main>
    );
  }

  const people = await listUsers();

  return (
    <main style={mainStyle}>
      <h1 style={{ fontSize: 22, margin: '0 0 16px' }}>People</h1>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {people.map((p) => (
          <li key={p.id} style={rowStyle}>
            {p.name} · {p.email} · {p.role}
            {p.pending ? ' · invite pending' : ''}
          </li>
        ))}
      </ul>
      <h2 style={{ fontSize: 16, marginTop: 24 }}>Invite someone</h2>
      <InviteForm />
    </main>
  );
}

const mainStyle: CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '24px 20px 48px' };
const rowStyle: CSSProperties = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10 };
