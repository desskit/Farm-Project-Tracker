'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; icon: string; match: (path: string) => boolean };

const TABS: Tab[] = [
  { href: '/', label: 'Today', icon: '🏠', match: (p) => p === '/' },
  { href: '/chores', label: 'Chores', icon: '🔁', match: (p) => p.startsWith('/chores') },
  { href: '/maintenance', label: 'Upkeep', icon: '🔧', match: (p) => p.startsWith('/maintenance') },
  { href: '/projects', label: 'Projects', icon: '📋', match: (p) => p.startsWith('/projects') },
  { href: '/more', label: 'More', icon: '⋯', match: (p) => p.startsWith('/more') || p.startsWith('/people') },
];

export function BottomNav({ overdue }: { overdue: number }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        const showBadge = tab.href === '/' && overdue > 0;
        return (
          <Link key={tab.href} href={tab.href} className={`nav-btn${active ? ' active' : ''}`}>
            <span className="nav-ico">
              {tab.icon}
              {showBadge && <span className="nav-badge">{overdue > 9 ? '9+' : overdue}</span>}
            </span>
            <span className="nav-lbl">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
