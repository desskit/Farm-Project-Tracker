import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { requestForViewer } from '@/lib/data/requests';
import { can } from '@/lib/domain/permissions';
import { Card, PageHeader } from '@/components/ui';
import { RequestStatusPill } from '../status-pill';
import { RequestActions } from './request-actions';
import s from '../requests.module.css';

export default async function RequestPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const found = await requestForViewer(user, params.id);
  if (!found) notFound();
  const { request: r, comments } = found;

  return (
    <main className={s.wrap}>
      <PageHeader
        back={<Link href="/requests" aria-label="All requests"><ChevronLeft /></Link>}
        title={r.title}
        subtitle={`${r.createdByName} · ${new Date(r.createdAt).toLocaleString()}${r.urgent ? ' · urgent' : ''}`}
        actions={<RequestStatusPill status={r.status} />}
      />
      {(r.details || r.photoId) && (
        <Card>
          {r.details && <p className={s.details}>{r.details}</p>}
          {r.photoId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={s.photo} src={`/api/attachments/${r.photoId}`} alt="Photo with the request" />
          )}
        </Card>
      )}
      <Card title="Updates">
        <div className={s.thread}>
          {comments.length === 0 && <p className={s.meta}>No updates yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className={s.msg}>
              <span className={s.msgHead}>{c.userName} · {new Date(c.ts).toLocaleString()}</span>
              <span className={s.msgBody}>{c.body}</span>
            </div>
          ))}
        </div>
      </Card>
      <RequestActions id={r.id} status={r.status} manages={can(user, 'requests.manage')} />
    </main>
  );
}
