import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSessionUser } from '@/lib/auth/session';
import { getCounts } from '@/lib/data/dashboard';
import { TopBar } from './_components/top-bar';
import { BottomNav } from './_components/bottom-nav';
import { RealtimeSync } from './_components/realtime-sync';
import { TimersStrip } from './_components/timers-strip';
import { activeTimersForUser } from '@/lib/data/timers';

export const metadata: Metadata = {
  title: 'Farm Project Tracker',
  description: 'What needs doing on the farm today — chores, upkeep, and projects.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#2f6f4f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const counts = user ? await getCounts(user) : null;
  const timers = user ? await activeTimersForUser(user.id) : [];

  return (
    <html lang="en">
      <body>
        {user && <TopBar user={user} />}
        {user && <RealtimeSync />}
        {user && timers.length > 0 && <TimersStrip timers={timers} />}
        {children}
        {user && <BottomNav overdue={counts?.overdue ?? 0} />}
      </body>
    </html>
  );
}
