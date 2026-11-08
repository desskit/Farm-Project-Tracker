'use client';
import type { FormEvent } from 'react';
import { pendingCount } from '@/lib/client/outbox';
import { useDialogs } from '@/components/ui/dialogs';

/**
 * Sign-out as a POST form (a GET link can be triggered from any other site).
 * Before leaving it warns about work still waiting to sync — on a shared
 * phone that work would otherwise be sent later under whoever signs in next —
 * and clears the offline page cache so the next person can't page through
 * the last one's screens.
 */
export function LogoutButton({ className, label = 'Log out' }: { className?: string; label?: string }) {
  const { confirm: askConfirm } = useDialogs();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const waiting = await pendingCount().catch(() => 0);
    if (
      waiting > 0 &&
      !await askConfirm(
        `${waiting} change${waiting === 1 ? ' hasn’t' : 's haven’t'} synced yet. If you log out now, ` +
          `${waiting === 1 ? 'it' : 'they'} will be sent as whoever signs in next on this device. Log out anyway?`,
      )
    ) {
      return;
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Best effort; the server's Clear-Site-Data header covers this too.
    }
    form.submit();
  }

  return (
    <form method="post" action="/api/auth/logout" onSubmit={onSubmit} style={{ display: 'inline' }}>
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
