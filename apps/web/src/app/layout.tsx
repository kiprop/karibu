import { cookies } from 'next/headers';
import { LANG_COOKIE, langFromCookie } from '@/lib/i18n';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'EI Karibu · Verified travel and living in East Africa', template: '%s · EI Karibu' },
  description: 'Verified stays, game drives, transport and guides for visitors, plus homes, furniture and home services for long stays and people moving home. By Enkop Intelligence.',
  applicationName: 'EI Karibu',
  icons: { icon: '/brand/ei-logo.png', apple: '/brand/ei-logo-192.png' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F4EF' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1015' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = langFromCookie((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
