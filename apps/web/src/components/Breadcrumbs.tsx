import Link from 'next/link';
import { Icon } from './Icon';

export type Crumb = { label: string; href?: string };

/**
 * Where you are and how to get back, on every page below the top level.
 * Home is added automatically. The last crumb is the current page and isn't a link.
 * On phones it scrolls sideways in one line rather than wrapping. Also emits BreadcrumbList data for search engines.
 */
export function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  const all: Crumb[] = [{ label: 'Home', href: '/' }, ...items];
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, ...(c.href ? { item: c.href } : {}) })),
  };
  return (
    <nav aria-label="Breadcrumb" className={`-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${className}`}>
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-muted">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={`flex items-center gap-1.5 ${last ? 'min-w-0' : 'shrink-0'}`}>
              {i > 0 ? <span aria-hidden="true" className="text-muted/60">›</span> : null}
              {c.href && !last ? (
                <Link href={c.href} className="inline-flex items-center gap-1 rounded font-semibold hover:text-ink hover:underline">
                  {i === 0 ? <Icon name="home" size={14} /> : null}
                  {i === 0 ? <span className="sr-only sm:not-sr-only">{c.label}</span> : c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={`${last ? 'max-w-[45vw] truncate font-semibold text-ink sm:max-w-[40ch]' : ''}`}>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </nav>
  );
}
