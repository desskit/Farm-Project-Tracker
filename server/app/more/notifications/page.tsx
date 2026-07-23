import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getPrefs } from '@/lib/data/prefs';
import { emailConfigured } from '@/lib/notify/email';
import { pushConfigured } from '@/lib/notify/push';
import { NotificationsView } from './notifications-view';

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const prefs = await getPrefs(user.id);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Notifications</h1>
      </div>
      <NotificationsView
        prefs={prefs}
        emailReady={emailConfigured()}
        pushReady={pushConfigured()}
      />
    </main>
  );
}
