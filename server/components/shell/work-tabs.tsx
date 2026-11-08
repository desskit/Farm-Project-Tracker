'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { workSections } from '@/lib/domain/nav';
import { ICONS } from './icons';
import s from './shell.module.css';

/** Chores · Projects · Upkeep switcher at the top of the Work tab's pages. */
export function WorkTabs({ sections }: { sections: ReturnType<typeof workSections> }) {
  const pathname = usePathname();
  return (
    <nav className={s.workTabs} aria-label="Work">
      {sections.map((t) => {
        const Icon = ICONS[t.icon];
        const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.key} href={t.href} className={`${s.workTab} ${on ? s.workTabOn : ''}`} aria-current={on ? 'page' : undefined}>
            <Icon aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
