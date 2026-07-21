import type { Metadata, Viewport } from 'next';
import './globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
