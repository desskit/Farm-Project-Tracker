import type { SessionUser } from '@/lib/auth/session';
import { ROLE_LABEL } from '@/lib/domain/permissions';
import s from './preview-banner.module.css';

/** Shown on every page while an admin previews the app as someone else. */
export function PreviewBanner({ user }: { user: SessionUser }) {
  if (!user.previewBy) return null;
  const until = new Date(user.previewBy.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <div className={s.banner} role="status">
      <span>
        Viewing as <strong>{user.name}</strong> ({ROLE_LABEL[user.role]}) · read-only until {until}
      </span>
      <form action="/api/preview/stop" method="post">
        <button type="submit" className={s.stop}>End preview</button>
      </form>
    </div>
  );
}
