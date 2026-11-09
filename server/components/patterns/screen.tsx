import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import s from './patterns.module.css';

/** Standard page frame: width, gutters, room for the nav, header with an optional back link. */
export function Screen({
  title, subtitle, back, actions, children, wide,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Where the back arrow goes; omit for top-level screens. */
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className={`${s.screen} ${wide ? s.screenWide : ''}`}>
      <PageHeader
        back={back ? <Link href={back} aria-label="Back" className={s.backLink}><ChevronLeft /></Link> : undefined}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      {children}
    </main>
  );
}
