import { SearchX } from 'lucide-react';
import { ButtonLink, EmptyState } from '@/components/ui';
import s from '@/components/patterns/patterns.module.css';

/** Branded 404 — also what notFound() renders for a missing (or hidden) chore, asset or project. */
export default function NotFound() {
  return (
    <main className={s.screen}>
      <EmptyState icon={<SearchX />} title="Not found" action={<ButtonLink href="/">Back to Today</ButtonLink>}>
        That page doesn&apos;t exist, was deleted, or isn&apos;t shared with you.
      </EmptyState>
    </main>
  );
}
