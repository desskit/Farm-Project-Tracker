import type { Metadata, Viewport } from 'next';
import './tokens.css';
import './globals.css';
import { getSessionUser } from '@/lib/auth/session';
import { myOverdueCount } from '@/lib/data/dashboard';
import { TopBar } from './_components/top-bar';
import { AppNav } from '@/components/shell/app-nav';
import { DialogsProvider } from '@/components/ui/dialogs';
import { primaryNav, quickActions } from '@/lib/domain/nav';
import { RealtimeSync } from './_components/realtime-sync';
import { TimersStrip } from './_components/timers-strip';
import { OutboxBar } from './_components/outbox-bar';
import { PwaRegister } from './_components/pwa-register';
import { PreviewBanner } from './_components/preview-banner';
import { activeTimersForUser } from '@/lib/data/timers';
import { currentBrand, currentThemePref, currentTextPref } from '@/lib/data/brand';
import { brandInfo } from '@/lib/domain/brand';

export const metadata: Metadata = {
  title: 'Farm Project Tracker',
  description: 'What needs doing on the farm today — chores, upkeep, and projects.',
  manifest: '/manifest.webmanifest',
};

export async function generateViewport(): Promise<Viewport> {
  const { themeColor } = brandInfo(await currentBrand());
  const pref = currentThemePref();
  return {
    themeColor:
      pref === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: themeColor.light },
            { media: '(prefers-color-scheme: dark)', color: themeColor.dark },
          ]
        : themeColor[pref],
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const overdue = user ? await myOverdueCount(user) : 0;
  const timers = user ? await activeTimersForUser(user.id) : [];
  const brand = await currentBrand();
  const theme = currentThemePref();
  const text = currentTextPref();

  return (
    // Set server-side from the setting and cookie, so the first paint is
    // already in the right colors (no flash).
    <html lang="en" data-brand={brand} data-theme={theme === 'system' ? undefined : theme} data-text={text === 'large' ? 'lg' : undefined}>
      <body className={user ? 'has-rail' : undefined} data-user-id={user?.id}>
        <DialogsProvider>
        <PwaRegister />
        {user?.previewBy && <PreviewBanner user={user} />}
        {user && <TopBar user={user} />}
        {user && <RealtimeSync />}
        {user && timers.length > 0 && <TimersStrip timers={timers} />}
        {user && <OutboxBar />}
        {children}
        {user && <AppNav items={primaryNav(user)} actions={quickActions(user)} overdue={overdue} />}
              </DialogsProvider>
      </body>
    </html>
  );
}
