import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { pushConfigured, sendPushToUserVerbose, subscriptionCount } from '@/lib/notify/push';
import { errorResponse } from '@/lib/api/errors';

/**
 * Sends a test notification to the signed-in admin's own devices.
 *
 * Deliberately scoped to the caller: this confirms the server's VAPID setup
 * without giving an admin a button that buzzes everyone else's phone.
 */
export async function POST() {
  try {
    const admin = await requireAdmin();
    if (!pushConfigured()) {
      return NextResponse.json(
        { error: 'Push is not configured on this server. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, then restart.' },
        { status: 400 },
      );
    }
    if ((await subscriptionCount(admin.id)) === 0) {
      return NextResponse.json(
        { error: 'No devices registered yet. Tap “Enable push on this device” above first.' },
        { status: 400 },
      );
    }

    const r = await sendPushToUserVerbose(admin.id, {
      title: 'Farm Tracker test',
      body: 'Push is working. This is a test from the Notifications page.',
      url: '/more/notifications',
    });

    if (r.delivered === 0) {
      // Everything was pruned: the subscriptions existed but the browsers have
      // dropped them, so the fix is to re-enable rather than to change config.
      if (r.pruned > 0 && r.failed === 0) {
        return NextResponse.json(
          {
            error: `Your ${r.pruned === 1 ? 'registration was' : `${r.pruned} registrations were`} expired and have been cleared. Tap “Enable push on this device” again.`,
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: r.error || 'The push service rejected the send.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, delivered: r.delivered, pruned: r.pruned, failed: r.failed, error: r.error });
  } catch (e) {
    return errorResponse(e);
  }
}
