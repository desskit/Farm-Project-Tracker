import Link from 'next/link';
import type { SessionUser } from '@/lib/auth/session';

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">🌾</span>
          <span className="brand-name">Farm Tracker</span>
        </Link>
        <div className="user-area">
          <span className="role-badge">{user.role}</span>
          <a href="/api/auth/logout" className="topbar-link">
            Log out
          </a>
        </div>
      </div>
    </header>
  );
}
