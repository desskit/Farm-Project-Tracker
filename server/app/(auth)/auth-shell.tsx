import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sprout } from 'lucide-react';
import s from './auth.module.css';

/** Shared frame for sign-in, reset and invite screens. */
export function AuthShell({
  title, lede, children, footer,
}: { title: string; lede?: ReactNode; children: ReactNode; footer?: { href: string; label: string } }) {
  return (
    <main className={s.wrap}>
      <div className={s.brand}>
        <span className={s.mark}><Sprout aria-hidden /></span>
        <span>Farm Project Tracker</span>
      </div>
      <section className={s.card}>
        <h1 className={s.title}>{title}</h1>
        {lede && <p className={s.lede}>{lede}</p>}
        {children}
      </section>
      {footer && (
        <p className={s.footer}>
          <Link href={footer.href}>{footer.label}</Link>
        </p>
      )}
    </main>
  );
}
