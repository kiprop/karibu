'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, type Lang } from '@/lib/i18n';
import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';

/**
 * The one list of sections on the public site. The header, the phone menu, the phone bar and the footer
 * all read from here, so a section has the same name and the same place everywhere.
 */
type Section = { href: string; label: string; icon: string; match: (p: string) => boolean };

const ME_PATHS = ['/today', '/plan', '/ask', '/saved', '/trips', '/account'];
export const SECTIONS: Section[] = [
  { href: '/explore', label: 'Explore', icon: 'search', match: (p) => p.startsWith('/explore') || p.startsWith('/listing') || p.startsWith('/b/') },
  { href: '/settle', label: 'Settle in', icon: 'home', match: (p) => p.startsWith('/settle') },
  { href: '/safety/prices', label: 'Fair prices', icon: 'tag', match: (p) => p.startsWith('/safety/prices') },
  { href: '/safety', label: 'Travel smart', icon: 'shield', match: (p) => (p.startsWith('/safety') && !p.startsWith('/safety/prices')) || p === '/how-we-verify' },
  { href: '/share', label: 'Share', icon: 'plus', match: (p) => p.startsWith('/share') || p === '/report' || p === '/recommend' },
];
export const MY_KARIBU: Section = { href: '/today', label: 'My Karibu', icon: 'compass', match: (p) => ME_PATHS.some((m) => p === m || p.startsWith(m + '/')) };
const BUSINESS: Section = { href: '/vendor', label: 'My business', icon: 'briefcase', match: (p) => p.startsWith('/vendor') };

/** Desktop: the main sections in the header, with the current one marked. */
export function HeaderNav({ lang }: { lang: Lang }) {
  const p = usePathname();
  return (
    <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 whitespace-nowrap lg:flex">
      {SECTIONS.filter((s) => s.href !== '/share').map((s) => {
        const on = s.match(p);
        return (
          <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined}
            className={`relative rounded-md px-3 py-1.5 text-[14px] font-medium ${on ? 'text-ink' : 'text-muted hover:bg-soft hover:text-ink'}`}>
            {t(lang, s.label)}
            {on ? <span aria-hidden="true" className="absolute inset-x-3 -bottom-[11px] h-[2px] rounded-full bg-brand" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header links to My Karibu and the business console, marked when you're inside them. */
export function AreaLink({ lang, kind }: { lang: Lang; kind: 'me' | 'business' | 'list' }) {
  const p = usePathname();
  const s = kind === 'me' ? MY_KARIBU : BUSINESS;
  const on = s.match(p);
  const label = kind === 'list' ? 'List your business' : s.label;
  return (
    <Link href={s.href} aria-current={on ? 'page' : undefined}
      className={`hidden items-center gap-1.5 rounded-md px-3 py-1.5 text-[14px] font-medium lg:inline-flex ${on ? 'bg-soft text-ink' : 'text-muted hover:bg-soft hover:text-ink'}`}>
      {kind !== 'list' ? <Icon name={s.icon} size={17} /> : null}{t(lang, label)}
    </Link>
  );
}

/** Phones and tablets: a menu with every section, the same names as on a computer. */
export function MobileMenu({ lang, signedIn, hasBusiness }: { lang: Lang; signedIn: boolean; hasBusiness: boolean }) {
  const [open, setOpen] = useState(false);
  const p = usePathname();
  useEffect(() => setOpen(false), [p]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open]);
  const row = (s: Section, label = s.label) => {
    const on = s.match(p);
    return (
      <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium ${on ? 'bg-brand-soft text-brand' : 'hover:bg-soft'}`}>
        <Icon name={s.icon} size={19} className={on ? 'text-brand' : 'text-muted'} />{t(lang, label)}
      </Link>
    );
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-soft lg:hidden" aria-label="Menu" aria-expanded={open}>
        <Icon name="menu" size={21} />
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Menu" className="ml-auto flex h-full w-[min(340px,88vw)] flex-col gap-1 overflow-y-auto bg-panel p-3 shadow-xl">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-muted">Menu</span>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-soft" aria-label="Close menu"><Icon name="x" size={19} /></button>
            </div>
            {SECTIONS.map((s) => row(s))}
            <div className="my-2 border-t border-line" />
            {row(MY_KARIBU)}
            {row(BUSINESS, hasBusiness ? 'My business' : 'List your business')}
            {row({ href: signedIn ? '/account' : '/signin', label: signedIn ? 'Account' : 'Sign in', icon: 'user', match: (x) => x === '/account' || x === '/signin' })}
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-1 pt-3 text-[13px] text-muted">
              Language <LangSwitch lang={lang} />
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/** Phones: the five places people go most, always one tap away. Share sits in the middle on purpose. */
export function BottomNav({ lang }: { lang: Lang }) {
  const p = usePathname();
  const items: Section[] = [SECTIONS[0], SECTIONS[2], SECTIONS[4], SECTIONS[3], MY_KARIBU];
  return (
    <nav aria-label="Shortcuts" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-5 text-[11px] font-semibold">
        {items.map((s) => {
          const on = s.match(p);
          const share = s.href === '/share';
          return (
            <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined}
              className={`flex min-h-[60px] flex-col items-center justify-center gap-1 ${on ? 'text-brand' : 'text-muted'}`}>
              {share ? (
                <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-brand text-white shadow-lg"><Icon name={s.icon} size={24} /></span>
              ) : (
                <Icon name={s.icon} size={22} />
              )}
              <span className={share ? 'text-brand' : ''}>{t(lang, s.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
