import { Megaphone } from 'lucide-react';
import type { SessionUser } from '@/lib/auth/session';
import { noticesFor } from '@/lib/data/notices';
import { Banner } from '@/components/ui';

/** Pinned announcements for this person, at the top of Today or the renter portal. */
export async function Notices({ user }: { user: SessionUser }) {
  const list = await noticesFor(user);
  if (!list.length) return null;
  return (
    <>
      {list.map((n) => (
        <Banner key={n.id} tone="info" title={<><Megaphone aria-hidden width={16} height={16} /> {n.title}</>}>
          {n.body}
          {n.byName ? <> — {n.byName}</> : null}
        </Banner>
      ))}
    </>
  );
}
