import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { listWebhooks } from '@/lib/data/webhooks';
import { can } from '@/lib/domain/permissions';
import { Screen } from '@/components/patterns/screen';
import { WebhooksView } from './webhooks-view';

export const metadata = { title: 'Webhooks · Farm Project Tracker' };

export default async function WebhooksPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'system.admin')) notFound();
  const hooks = await listWebhooks(user);
  return (
    <Screen title="Webhooks" subtitle="Tell another system when something happens" back="/more/data">
      <WebhooksView hooks={hooks.map((h) => ({ id: h.id, name: h.name, url: h.url, events: h.events, secret: h.secret, active: h.active, lastStatus: h.lastStatus, lastAt: h.lastAt }))} />
    </Screen>
  );
}
