import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import s from './notifications.module.css';
import { getSessionUser } from '@/lib/auth/session';
import { getPrefs } from '@/lib/data/prefs';
import { emailConfigured } from '@/lib/notify/email';
import { pushConfigured } from '@/lib/notify/push';
import { NotificationsView } from './notifications-view';
import { can } from '@/lib/domain/permissions';

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const prefs = await getPrefs(user.id);

  return (
    <main className={s.wrap}>
      <PageHeader back={<Link href="/more" aria-label="Back" className={s.back}><ChevronLeft /></Link>} title="Notifications" />
      <NotificationsView
        prefs={prefs}
        emailReady={emailConfigured()}
        pushReady={pushConfigured()}
        isAdmin={can(user, 'system.admin')}
      />
    </main>
  );
}
