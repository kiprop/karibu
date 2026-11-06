'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Icon } from './Icon';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

export type RailItem = { href: string; label: string; icon: string; count?: number | null; hot?: boolean; group?: string; match?: (path: string, view: string | null) => boolean };

function Rail({ items, head }: { items: RailItem[]; head?: React.ReactNode }) {
  const path = usePathname();
  const view = useSearchParams().get('view');
  let last = '';
  return (
    <>
      {/* Wide screens: a side menu, like the staff console */}
      <aside className="hidden border-r border-line bg-panel lg:block">
        <nav aria-label="Your Karibu" className="sticky top-14 flex flex-col gap-px p-2 pt-3">
          {head}
          {items.map((it) => {
            const active = it.match ? it.match(path, view) : path === it.href || (it.href !== '/' && path.startsWith(it.href + '/'));
            const g = it.group && it.group !== last ? <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold text-muted/80">{it.group}</div> : null;
            if (it.group) last = it.group;
            return (
              <span key={it.href} className="contents">
                {g}
                <Link href={it.href} aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium ${active ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-soft'}`}>
                  <Icon name={it.icon} size={16} className={active ? 'text-brand' : 'text-muted'} />
                  <span className="flex-1">{it.label}</span>
                  {it.count ? <span className={`rounded px-1.5 text-[11px] font-semibold ${it.hot ? 'bg-danger text-white' : 'bg-soft text-muted'}`}>{it.count}</span> : null}
                </Link>
              </span>
            );
          })}
        </nav>
      </aside>
      {/* Phones and tablets: the same sections as a scrolling tab row */}
      <nav aria-label="Your Karibu" className="sticky top-14 z-30 -mb-px overflow-x-auto border-b border-line bg-panel/95 backdrop-blur lg:hidden">
        <div className="flex w-max gap-1 px-4 py-2">
          {items.map((it) => {
            const active = it.match ? it.match(path, view) : path === it.href || path.startsWith(it.href + '/');
            return (
              <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium ${active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-soft'}`}>
                <Icon name={it.icon} size={15} />{it.label}
                {it.count ? <span className="rounded bg-soft px-1 text-[11px]">{it.count}</span> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/** The signed-in frame for travellers and businesses: a side menu on wide screens, tabs on phones. */
export function RailShell({ items, head, children }: { items: RailItem[]; head?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-56px)] grid-cols-[minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
      <Suspense fallback={<aside className="hidden lg:block" />}>
        <Rail items={items} head={head} />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Page header inside a signed-in area: breadcrumbs from Home, title, description, actions. Same shape as the public PageHeader. */
export function AreaHead({ crumbs, title, desc, actions }: { crumbs: Crumb[]; title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <Breadcrumbs items={crumbs} />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="area-title">{title}</h1>
          {desc ? <p className="mt-1 max-w-[70ch] text-[14px] text-muted">{desc}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** The body of every page inside a signed-in area: same padding and maximum width everywhere. */
export function Area({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex w-full max-w-[1180px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

/** A dense panel with an optional header row, like the console's cards. */
export function Panel({ title, meta, children, className = '', pad = true }: { title?: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-panel ${className}`}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {meta ? <span className="text-[12.5px] text-muted">{meta}</span> : null}
        </div>
      ) : null}
      {pad ? <div className="p-4">{children}</div> : children}
    </section>
  );
}

export function Stat({ k, v, d, tone }: { k: string; v: React.ReactNode; d?: React.ReactNode; tone?: 'bad' | 'ok' }) {
  return (
    <div className={`rounded-xl border bg-panel px-4 py-3 ${tone === 'bad' ? 'border-danger' : 'border-line'}`}>
      <div className="text-[12px] font-medium text-muted">{k}</div>
      <div className={`mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight ${tone === 'bad' ? 'text-danger' : ''}`}>{v}</div>
      {d ? <div className="text-[12px] text-muted">{d}</div> : null}
    </div>
  );
}
