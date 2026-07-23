'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string; icon: string; match: (path: string) => boolean };

export function BottomNav({ isAdmin, overdue }: { isAdmin: boolean; overdue: number }) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: '/', label: 'Today', icon: '🏠', match: (p) => p === '/' },
    { href: '/chores', label: 'Chores', icon: '🔁', match: (p) => p.startsWith('/chores') },
  ];
  if (isAdmin) {
    tabs.push({ href: '/people', label: 'People', icon: '🧑‍🌾', match: (p) => p.startsWith('/people') });
  }

  return (
    <nav className="nav">
      {tabs.map((tab) => {
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
