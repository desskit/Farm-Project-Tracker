import Link from 'next/link';
import { ClipboardList, Repeat, Wallet, Wrench } from 'lucide-react';
import { ButtonLink, ListRow, StatusPill, type Tone } from '@/components/ui';
import type { DashboardItem } from '@/lib/data/dashboard';
import { relativeLabel } from '@/lib/domain/dates';
import { DoneButton } from './work-buttons';
import s from './patterns.module.css';

const ICON = { chore: <Repeat />, task: <ClipboardList />, maintenance: <Wrench />, rent: <Wallet /> };
const TONE: Record<DashboardItem['bucket'], Tone> = { overdue: 'overdue', today: 'today', upcoming: 'upcoming' };

/** A due piece of work: what it is, when, and the one action that finishes it. */
export function WorkItemRow({ item }: { item: DashboardItem }) {
  const action =
    item.kind === 'chore' && !item.gated ? (
      <DoneButton choreId={item.id} label={item.title} />
    ) : (
      <ButtonLink href={item.href} size="sm" variant="secondary">
        {item.actionLabel}
      </ButtonLink>
    );
  return (
    <ListRow
      lead={<Link href={item.href} aria-label={item.title} className={s.link}>{ICON[item.kind]}</Link>}
      title={<Link href={item.href} className={s.link}>{item.title}</Link>}
      meta={
        <>
          <StatusPill tone={TONE[item.bucket]}>{relativeLabel(item.dueDate)}</StatusPill> {item.subtitle}
        </>
      }
      trail={action}
    />
  );
}
