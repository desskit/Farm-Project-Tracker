'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Dialog } from '@/components/ui';
import { isActive, type NavItem, type quickActions } from '@/lib/domain/nav';
import { ICONS } from './icons';
import { SupplyQuickLog } from '@/components/patterns/supply-quick-log';
import s from './shell.module.css';

type Action = ReturnType<typeof quickActions>[number];

/**
 * The app's main navigation: a bottom bar on phones, a side rail on wide
 * screens. Items come from lib/domain/nav (built from the person's
 * permissions); the (+) item opens a sheet of quick actions.
 */
export function AppNav({ items, actions, overdue }: { items: NavItem[]; actions: Action[]; overdue: number }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<'menu' | 'supplies'>('menu');
  const close = () => {
    setSheet(false);
    setMode('menu');
  };

  return (
    <>
      <nav className={s.nav} aria-label="Main">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          if (item.key === 'log') {
            return (
              <button key={item.key} type="button" className={s.fabSlot} onClick={() => setSheet(true)} aria-label="Quick log">
                <span className={s.fab}>
                  <Icon aria-hidden />
                </span>
                <span className={s.label}>{item.label}</span>
              </button>
            );
          }
          const active = isActive(item, pathname);
          const badge = item.badge === 'overdue' && overdue > 0 ? overdue : 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`${s.item} ${active ? s.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={s.icon}>
                <Icon aria-hidden />
                {badge > 0 && (
                  <span className={s.badge} aria-label={`${badge} overdue`}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className={s.label}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Dialog sheet open={sheet} onClose={close} title={mode === 'supplies' ? 'Use supplies' : 'Quick log'}>
        {mode === 'supplies' ? (
          <SupplyQuickLog onDone={close} />
        ) : (
        <div className={s.actions}>
          {actions.map((a) => {
            const Icon = ICONS[a.icon];
            if (a.key === 'supplies') {
              return (
                <button key={a.key} type="button" className={s.action} onClick={() => setMode('supplies')}>
                  <span className={s.actionIcon}>
                    <Icon aria-hidden />
                  </span>
                  <span className={s.actionText}>
                    <strong>{a.label}</strong>
                    <span>{a.hint}</span>
                  </span>
                  <ChevronRight aria-hidden className={s.chev} />
                </button>
              );
            }
            return (
              <Link key={a.key} href={a.href} className={s.action} onClick={close}>
                <span className={s.actionIcon}>
                  <Icon aria-hidden />
                </span>
                <span className={s.actionText}>
                  <strong>{a.label}</strong>
                  <span>{a.hint}</span>
                </span>
                <ChevronRight aria-hidden className={s.chev} />
              </Link>
            );
          })}
        </div>
        )}
      </Dialog>
    </>
  );
}
