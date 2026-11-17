import Link from 'next/link';
import { CalendarClock, Phone } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import type { AppointmentLink } from '@/db/schema';
import { listAppointments, whenLabel } from '@/lib/data/appointments';
import { addDays, todayISO } from '@/lib/domain/dates';
import { ButtonLink, Card, ListRow } from '@/components/ui';

/**
 * Upcoming appointments this person may see: on Today (next week), or on a
 * group / unit / asset / land page (everything coming up for it). Hidden
 * when there's nothing.
 */
export async function AppointmentsCard({ user, days = 7, linkType, linkId, title = 'Coming up' }: {
  user: SessionUser; days?: number; linkType?: AppointmentLink; linkId?: string; title?: string;
}) {
  const today = todayISO();
  const list = await listAppointments(user, today, addDays(today, linkType ? 365 : days), { linkType, linkId });
  if (!list.length) return null;
  return (
    <Card title={title} action={<ButtonLink href="/more/appointments" size="sm" variant="ghost">All</ButtonLink>} flush>
      {list.slice(0, 5).map((a) => (
        <ListRow
          key={a.id}
          lead={<CalendarClock />}
          wrap
          title={a.title}
          meta={[whenLabel(a), a.contactName, !linkType ? a.linkLabel : null].filter(Boolean).join(' · ')}
          trail={a.contactPhone ? (
            <Link href={`tel:${a.contactPhone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${a.contactName}`}><Phone aria-hidden width={20} height={20} /></Link>
          ) : undefined}
        />
      ))}
    </Card>
  );
}
