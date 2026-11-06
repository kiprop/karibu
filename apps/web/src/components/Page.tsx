import Link from 'next/link';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { Icon } from './Icon';

/**
 * The one page frame for the public site. Every page below Home uses it, so breadcrumbs, the title,
 * the left edge and the width are the same everywhere:
 *  - breadcrumbs always first, on the container's left edge
 *  - one title style, one description width
 *  - content either uses the full width, or sits in a main column with a side panel (`aside`)
 *    so short forms never float alone on one side of a wide screen
 */
export function PageHeader({ crumbs, eyebrow, title, desc, actions }: { crumbs?: Crumb[]; eyebrow?: React.ReactNode; title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
          <h1 className="page-title">{title}</h1>
          {desc ? <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-muted">{desc}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Page({ crumbs, eyebrow, title, desc, actions, aside, children, className = '' }: {
  crumbs?: Crumb[]; eyebrow?: React.ReactNode; title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode;
  aside?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`container-k flex flex-col gap-6 py-6 sm:py-8 ${className}`}>
      <PageHeader crumbs={crumbs} eyebrow={eyebrow} title={title} desc={desc} actions={actions} />
      {aside ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">{aside}</aside>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Short, single-purpose screens (sign in, confirmations, invitations, offline): one centred card. */
export function Centered({ crumbs, children, wide = false }: { crumbs?: Crumb[]; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="container-k flex flex-col gap-6 py-6 sm:py-8">
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <div className={`mx-auto w-full ${wide ? 'max-w-4xl' : 'max-w-md'} sm:py-6`}>{children}</div>
    </div>
  );
}

/** A side panel card: same look as the console panels. */
export function SideCard({ title, children, tone }: { title?: React.ReactNode; children: React.ReactNode; tone?: 'brand' | 'warn' }) {
  const t = tone === 'brand' ? 'border-brand/25 bg-brand-soft/40' : tone === 'warn' ? 'border-amber/40 bg-amber-soft/50' : 'border-line bg-panel';
  return (
    <section className={`rounded-xl border p-4 text-[14px] ${t}`}>
      {title ? <h2 className="mb-2 text-[14px] font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Numbered "what happens next" steps for side panels. */
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-ground">{i + 1}</span>
          <span className="text-muted [&_b]:text-ink">{it}</span>
        </li>
      ))}
    </ol>
  );
}

const TONE: Record<string, string> = {
  brand: 'bg-brand-soft text-brand', teal: 'bg-teal-soft text-teal', amber: 'bg-amber-soft text-amber', danger: 'bg-danger-soft text-danger', ink: 'bg-soft text-ink',
};

/** A link card for "things you can do here": icon, title, one line, an optional note. Same on every landing page. */
export function ActionCard({ href, icon, title, body, note, tone = 'brand' }: { href: string; icon: string; title: string; body: string; note?: string; tone?: keyof typeof TONE }) {
  return (
    <Link href={href} className="card group flex min-h-[150px] flex-col gap-2 p-5 transition-colors hover:border-muted/50">
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${TONE[tone]}`}><Icon name={icon} size={20} /></span>
      <strong className="mt-1 text-[16px] font-semibold group-hover:underline">{title}</strong>
      <span className="text-[14px] leading-snug text-muted">{body}</span>
      {note ? <span className="mt-auto pt-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted/80">{note}</span> : null}
    </Link>
  );
}

/** Landing-page hero: same left edge and breadcrumbs as every page, words on the left, a picture on the right. */
export function Hero({ crumbs, eyebrow, title, desc, children, picture }: { crumbs?: Crumb[]; eyebrow?: React.ReactNode; title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode; picture: React.ReactNode }) {
  return (
    <section className="border-b border-line bg-panel">
      <div className="container-k flex flex-col gap-5 py-6 sm:py-8">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {eyebrow ? <div className="eyebrow mb-2 text-brand">{eyebrow}</div> : null}
            <h1 className="text-[32px] font-semibold leading-[1.08] tracking-tight sm:text-[44px]">{title}</h1>
            {desc ? <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-muted">{desc}</p> : null}
            {children ? <div className="mt-6">{children}</div> : null}
          </div>
          <div className="min-w-0">{picture}</div>
        </div>
      </div>
    </section>
  );
}
