import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getSessionUser } from '@/lib/auth/session';
import { TopNav } from './_components/top-nav';

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
  return (
    <html lang="en">
      <body>
        {user && <TopNav user={user} />}
        {children}
      </body>
    </html>
  );
}
