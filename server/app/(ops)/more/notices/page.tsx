import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { noticesToManage, postableAudiences } from '@/lib/data/notices';
import { Screen } from '@/components/patterns/screen';
import { NoticeBoard } from './notice-board';

export const metadata = { title: 'Notices · Farm Project Tracker' };

export default async function NoticesPage() {
  const user = await getSessionUser();
  if (!user) notFound();
  const audiences = postableAudiences(user);
  if (!audiences.length) notFound();
  const list = await noticesToManage(user);
  return (
    <Screen title="Notices" subtitle="Announcements pinned to the top of Today and the renter portal" back="/more">
      <NoticeBoard
        audiences={audiences}
        notices={list.map((n) => ({ id: n.id, title: n.title, body: n.body, audience: n.audience, expiresOn: n.expiresOn, byName: n.byName }))}
      />
    </Screen>
  );
}
