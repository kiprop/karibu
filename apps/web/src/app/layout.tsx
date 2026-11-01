import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { getMe } from '@/lib/server-api';
import { SessionProvider } from '@/components/Session';
import { Icon } from '@/components/Icon';
import { BrandLockup } from '@/components/Brand';

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
  const me = await getMe();
  const role = me.user?.role;
  const hasBusiness = (me.vendors?.length ?? 0) > 0;
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SessionProvider me={me}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-panel focus:p-3">
            Skip to content
          </a>
          <header className="sticky top-0 z-40 border-b border-line bg-ground/90 backdrop-blur">
            <div className="container-k flex h-16 items-center gap-4">
              <BrandLockup />
              <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 whitespace-nowrap lg:flex">
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/explore">Explore</Link>
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/settle">Settle in</Link>
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/safety/prices">Fair prices</Link>
                <Link className="btn-ghost min-h-[38px] px-3 text-[14px]" href="/safety">Travel smart</Link>
              </nav>
              <div className="ml-auto flex items-center gap-2 whitespace-nowrap">
                <Link href="/safety" className="btn-ghost min-h-[38px] px-2.5 text-[14px] lg:hidden" aria-label="Travel smart: safety and official links">
                  <Icon name="shield" size={20} />
                </Link>
                <Link href="/share" className="btn-primary hidden min-h-[38px] px-4 text-[14px] lg:inline-flex">
                  <Icon name="plus" size={18} /> Share
                </Link>
                <Link href="/saved" className="btn-ghost hidden min-h-[38px] px-3 text-[14px] lg:inline-flex" aria-label="Saved and trips">
                  <Icon name="heart" size={18} /> <span className="hidden xl:inline">Saved</span>
                </Link>
                {role === 'reviewer' || role === 'admin' ? <Link href="/admin" className="btn-ghost min-h-[38px] px-3 text-[14px]">Admin</Link> : null}
                {hasBusiness ? (
                  <Link href="/vendor" className="btn-ghost min-h-[38px] px-3 text-[14px]"><Icon name="briefcase" size={18} /> <span className="hidden sm:inline">My business</span></Link>
                ) : (
                  <Link href="/vendor" className="btn-ghost hidden min-h-[38px] px-3 text-[14px] xl:inline-flex">List your business</Link>
                )}
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
          <main id="main" className="pb-20 lg:pb-0">{children}</main>
          {/* Phones: the main places, always one tap away. Share sits in the middle on purpose. */}
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="grid grid-cols-5 text-[11px] font-bold">
              {[
                ['/explore', 'search', 'Explore'],
                ['/safety/prices', 'tag', 'Prices'],
                ['/share', 'plus', 'Share'],
                ['/settle', 'home', 'Settle in'],
                ['/saved', 'heart', 'Saved'],
              ].map(([href, icon, label]) => (
                <Link key={href} href={href} className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-muted">
                  {href === '/share' ? (
                    <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-brand text-white shadow-lg"><Icon name={icon} size={24} /></span>
                  ) : (
                    <Icon name={icon} size={22} />
                  )}
                  <span className={href === '/share' ? 'text-brand' : ''}>{label}</span>
                </Link>
              ))}
            </div>
          </nav>
          <footer className="mt-16 border-t border-line">
            <div className="container-k grid gap-8 py-10 text-[14px] sm:grid-cols-3">
              <div>
                <BrandLockup href={null} />
                <p className="mt-2 max-w-xs text-muted">Verified stays, game drives, transport and guides across East Africa. We check them; you message them directly.</p>
                <p className="mt-2 text-muted">An <a href="https://enkopintelligence.com" target="_blank" rel="noopener" className="font-bold underline">Enkop Intelligence</a> venture.</p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="eyebrow">Travellers</span>
                <Link href="/explore">Explore listings</Link>
                <Link href="/settle">Settle in: moving home and long stays</Link>
                <Link href="/safety/check">Check an operator</Link>
                <Link href="/safety/prices">Fair prices and “I paid this much”</Link>
                <Link href="/share">Share your experience</Link>
                <Link href="/safety#official">Official government links</Link>
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
