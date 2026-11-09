import Link from 'next/link';
import s from './patterns.module.css';

/** Link-based filter chips (period, scope…) that keep working without JavaScript. */
export function FilterChips({ items, label }: { items: { href: string; label: string; on: boolean; count?: number }[]; label: string }) {
  return (
    <nav className={s.chipsNav} aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`${s.chip} ${i.on ? s.chipOn : ''}`} aria-current={i.on ? 'page' : undefined}>
          {i.label}
          {i.count !== undefined && <span className={s.chipN}>{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
