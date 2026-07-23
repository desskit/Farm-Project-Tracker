import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { SessionUser } from '@/lib/auth/session';

export function TopNav({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'admin';
  return (
    <header style={headerStyle}>
      <div style={innerStyle}>
        <Link href="/" style={brandStyle}>
          🌾 Farm Tracker
        </Link>
        <nav style={navStyle}>
          <Link href="/" style={linkStyle}>
            Today
          </Link>
          <Link href="/chores" style={linkStyle}>
            Chores
          </Link>
          {isAdmin && (
            <Link href="/people" style={linkStyle}>
              People
            </Link>
          )}
          <a href="/api/auth/logout" style={linkStyle}>
            Log out
          </a>
        </nav>
      </div>
    </header>
  );
}

const headerStyle: CSSProperties = { background: 'var(--brand)', color: '#fff' };
const innerStyle: CSSProperties = {
  maxWidth: 640,
  margin: '0 auto',
  padding: '12px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
};
const brandStyle: CSSProperties = { color: '#fff', fontWeight: 800, textDecoration: 'none' };
const navStyle: CSSProperties = { display: 'flex', gap: 16 };
const linkStyle: CSSProperties = { color: 'rgba(255,255,255,.9)', textDecoration: 'none', fontSize: 14 };
