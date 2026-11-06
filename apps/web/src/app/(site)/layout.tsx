import Link from 'next/link';
import { getMe } from '@/lib/server-api';
import { SessionProvider } from '@/components/Session';
import { Icon } from '@/components/Icon';
import { BrandLockup } from '@/components/Brand';
import { cookies } from 'next/headers';
import { AskLauncher } from '@/components/AskKaribu';
import { LangSwitch } from '@/components/LangSwitch';
import { ServiceWorker } from '@/components/ServiceWorker';
import { LANG_COOKIE, langFromCookie, t, type Lang } from '@/lib/i18n';
import { AreaLink, BottomNav, HeaderNav, MobileMenu } from '@/components/SiteNav';

/** The public site: header, phone navigation and footer. The staff console (/admin) has its own frame. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const lang = langFromCookie((await cookies()).get(LANG_COOKIE)?.value);
  const hasBusiness = (me.vendors?.length ?? 0) > 0;
  return (
    <SessionProvider me={me}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-panel focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-panel/95 backdrop-blur">
        <div className="container-k flex h-14 items-center gap-3">
          <BrandLockup />
          <HeaderNav lang={lang} />
          <div className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
            <LangSwitch lang={lang} className="mr-1 hidden xl:inline-flex" />
            <Link href="/share" className="btn-primary hidden min-h-[34px] px-3.5 text-[14px] lg:inline-flex">
              <Icon name="plus" size={17} /> {t(lang, 'Share')}
            </Link>
            <AreaLink lang={lang} kind="me" />
            <AreaLink lang={lang} kind={hasBusiness ? 'business' : 'list'} />
            {me.user ? (
              <Link href="/account" className="btn-outline min-h-[34px] px-3 text-[14px]" aria-label="Account">
                <Icon name="user" size={17} /> <span className="hidden sm:inline">{t(lang, 'Account')}</span>
              </Link>
            ) : (
              <Link href="/signin" className="btn-dark min-h-[34px] px-3.5 text-[14px]">{t(lang, 'Sign in')}</Link>
            )}
            <MobileMenu lang={lang} signedIn={!!me.user} hasBusiness={hasBusiness} />
          </div>
        </div>
      </header>
      <main id="main" className="min-h-[60vh] pb-24 lg:pb-0">{children}</main>
      <BottomNav lang={lang} />
      <footer className="mt-16 border-t border-line bg-panel">
        <div className="container-k grid gap-8 py-10 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLockup href={null} />
            <p className="mt-2 max-w-xs text-muted">Verified stays, game drives, transport and guides across East Africa. We check them; you message them directly.</p>
            <p className="mt-2 text-muted">An <a href="https://enkopintelligence.com" target="_blank" rel="noopener" className="font-semibold underline">Enkop Intelligence</a> venture.</p>
          </div>
          <FooterCol title="Travellers" links={[['/explore', 'Explore'], ['/settle', 'Settle in'], ['/safety/prices', 'Fair prices'], ['/safety', 'Travel smart'], ['/share', 'Share']]} lang={lang} />
          <FooterCol title="My Karibu" links={[['/today', 'Today'], ['/plan', 'Your plan'], ['/ask', 'Ask Karibu'], ['/saved', 'Saved'], ['/trips', 'Trips']]} lang={lang} />
          <FooterCol title="Businesses" links={[['/vendor', 'List your business'], ['/vendor/plan', 'Plans'], ['/how-we-verify', 'How we verify'], ['/recommend', 'Recommend a business'], ['/report', 'Report a problem']]} lang={lang} />
        </div>
        <div className="container-k flex flex-wrap items-center gap-3 border-t border-line/70 py-5 text-[12px] text-muted">
          <LangSwitch lang={lang} />
          <span className="min-w-0 flex-1">Karibu is an information service. Businesses deliver their own services and agree prices and payment directly with you.</span>
        </div>
      </footer>
          <AskLauncher />
          <ServiceWorker />
        </SessionProvider>
  );
}

function FooterCol({ title, links, lang }: { title: string; links: [string, string][]; lang: Lang }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">{t(lang, title)}</span>
      {links.map(([href, label]) => <Link key={href} href={href} className="text-ink/85 hover:text-ink hover:underline">{t(lang, label)}</Link>)}
    </div>
  );
}
