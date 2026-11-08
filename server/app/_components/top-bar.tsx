import Link from 'next/link';
import type { SessionUser } from '@/lib/auth/session';
import { LogoutButton } from '@/app/_components/logout-button';
import { ROLE_LABEL } from '@/lib/domain/permissions';

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">🌾</span>
          <span className="brand-name">Farm Tracker</span>
        </Link>
        <div className="user-area">
          <Link href="/more/search" className="topbar-search" aria-label="Search" title="Search">
            🔍
          </Link>
          <span className="role-badge">{ROLE_LABEL[user.role]}</span>
          <LogoutButton className="topbar-link" />
        </div>
      </div>
    </header>
  );
}
