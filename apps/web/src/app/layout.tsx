import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getMe } from '@/lib/server-api';
import { SessionProvider } from '@/components/Session';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: { default: 'Karibu · Verified travel in East Africa', template: '%s · Karibu' },
  description: 'Verified stays, game drives, transport and local guides across East Africa. Check, compare, then message them directly on WhatsApp.',
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
  const me = await getMe();
  const role = me.user?.role;
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SessionProvider me={me}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-panel focus:p-3">
            Skip to content
          </a>
          <header className="sticky top-0 z-40 border-b border-line bg-ground/90 backdrop-blur">
            <div className="container-k flex h-16 items-center gap-4">
              <Link href="/" className="flex items-center gap-2" aria-label="Karibu home">
                <span aria-hidden="true" className="h-8 w-8 rounded-[10px]" style={{ background: 'conic-gradient(from 200deg,#E64B24,#F5A60A,#0A7D70,#7B5CFF,#E64B24)' }} />
                <span className="font-display text-[22px] font-extrabold tracking-tight">Karibu</span>
              </Link>
              <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/explore">Explore</Link>
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/explore?category=safari">Game drives</Link>
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/explore?category=stay">Stays</Link>
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/safety">Travel smart</Link>
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <Link href="/saved" className="btn-ghost min-h-[38px] px-3 text-[14px]" aria-label="Saved and trips">
                  <Icon name="heart" size={18} /> <span className="hidden sm:inline">Saved</span>
                </Link>
                {role === 'reviewer' || role === 'admin' ? <Link href="/admin" className="btn-ghost min-h-[38px] px-3 text-[14px]">Admin</Link> : null}
                {role === 'vendor' ? <Link href="/vendor" className="btn-ghost min-h-[38px] px-3 text-[14px]">My business</Link> : null}
                {me.user ? (
                  <Link href="/account" className="btn-outline min-h-[38px] px-3 text-[14px]">
                    <Icon name="user" size={18} /> <span className="hidden sm:inline">Account</span>
                  </Link>
                ) : (
                  <Link href="/signin" className="btn-dark min-h-[38px] px-4 text-[14px]">Sign in</Link>
                )}
              </div>
            </div>
          </header>
          <main id="main">{children}</main>
          <footer className="mt-16 border-t border-line">
            <div className="container-k grid gap-8 py-10 text-[14px] sm:grid-cols-3">
              <div>
                <div className="font-display text-lg font-extrabold">Karibu</div>
                <p className="mt-2 max-w-xs text-muted">Verified stays, game drives, transport and guides across East Africa. We check them; you message them directly.</p>
                <p className="mt-2 text-muted">An Enkop Intelligence venture.</p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="eyebrow">Travellers</span>
                <Link href="/explore">Explore listings</Link>
                <Link href="/safety/check">Check an operator</Link>
                <Link href="/safety">Before you go</Link>
                <Link href="/recommend">Recommend a business</Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="eyebrow">Businesses</span>
                <Link href="/vendor">List your business free</Link>
                <Link href="/vendor/plan">Plans</Link>
                <Link href="/how-we-verify">How we verify</Link>
              </div>
            </div>
            <div className="container-k pb-8 text-[12px] text-muted">
              Karibu is an information service. Businesses deliver their own services and agree prices and payment directly with you.
            </div>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
