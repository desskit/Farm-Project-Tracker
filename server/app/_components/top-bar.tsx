import Link from 'next/link';
import { Search, Sprout } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { ROLE_LABEL, can } from '@/lib/domain/permissions';
import s from './top-bar.module.css';

/** Slim brand bar on every page. Sign out lives in More / Me. */
export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className={s.bar} data-noprint>
      <div className={s.inner}>
        <Link href="/" className={s.brand}>
          <span className={s.mark}><Sprout aria-hidden /></span>
          <span className={s.name}>Farm Tracker</span>
        </Link>
        <div className={s.right}>
          {can(user, 'farm.view') && (
            <Link href="/more/search" className={s.icon} aria-label="Search" title="Search">
              <Search aria-hidden />
            </Link>
          )}
          <Link href="/more" className={s.who} title={`${user.name} · ${ROLE_LABEL[user.role]}`}>
            <span className={s.avatar} aria-hidden>{(user.name || '?').charAt(0)}</span>
            <span className={s.role}>{ROLE_LABEL[user.role]}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
