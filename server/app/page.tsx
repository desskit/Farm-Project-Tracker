import { getSessionUser } from '@/lib/auth/session';

/**
 * Placeholder landing page for the server-phase scaffold. The full dashboard
 * UI (ported from js/app.js) arrives in the UI phase; for now this confirms the
 * app boots, reads the session, and links onward.
 */
export default async function HomePage() {
  const user = await getSessionUser();
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
      <p style={{ fontSize: 22, fontWeight: 800 }}>🌾 Farm Project Tracker</p>
      <p style={{ color: 'var(--muted)' }}>Server phase — foundation is up.</p>
      {user ? (
        <p style={{ marginTop: 24 }}>
          Signed in as <strong>{user.name}</strong> ({user.role}).{' '}
          <a href="/api/auth/logout">Log out</a>
        </p>
      ) : (
        <p style={{ marginTop: 24 }}>
          Not signed in. <a href="/login">Log in</a>
        </p>
      )}
    </main>
  );
}
