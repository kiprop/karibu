import Link from 'next/link';
import { api } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { shortDate } from '@/lib/format';

export const metadata = { title: 'Travel smart' };

type Link_ = { topic: string; title: string; url: string; description: string; warning: string | null; lastCheckedOn: string; stale: boolean };
type Info = { country: { code: string; name: string; isLive: boolean }; links: Link_[]; pages: { slug: string; title: string; body: string; sources: string[]; lastReviewedOn: string; stale: boolean }[]; advisories: { id: string; message: string; city: string | null }[] };

const TOOLS = [
  { href: '/safety/check', icon: 'shield', title: 'Check an operator', body: 'Before you pay a safari company, hotel agent or guide.', cls: 'media-transport' },
  { href: '/safety/prices', icon: 'tag', title: 'Fair prices', body: 'Check a quote, and see what travellers really paid.', cls: 'media-stay' },
  { href: '/share', icon: 'star', title: 'Share your experience', body: 'Rate a business, say what you paid, report a scam.', cls: 'media-safari' },
  { href: '/safety/emergency', icon: 'sos', title: 'Emergency card', body: 'Numbers, lost passport steps, embassies.', cls: 'media-event' },
  { href: '/safety/meet', icon: 'people', title: 'Meet safely', body: 'Meeting someone you know only from online.', cls: 'media-experience' },
];

const TOPICS = [
  { key: 'entry', label: 'Visas and entry' },
  { key: 'business_check', label: 'Check a business is licensed' },
  { key: 'parks', label: 'National parks and fees' },
  { key: 'transport', label: 'Trains and airports' },
  { key: 'health', label: 'Health' },
  { key: 'safety', label: 'Police and safety' },
  { key: 'embassies', label: 'Embassies' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'tourism', label: 'Tourism board' },
];

export default async function Safety({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const { country = 'KE' } = await searchParams;
  const [info, { countries }] = await Promise.all([
    api<Info>(`/countries/${country}/info`),
    api<{ countries: { code: string; name: string; isLive: boolean }[] }>('/countries'),
  ]);
  const topics = TOPICS.map((t) => ({ ...t, links: info.links.filter((l) => l.topic === t.key) })).filter((t) => t.links.length);
  return (
    <div className="container-k py-10">
      <nav aria-label="Country" className="flex flex-wrap gap-2">
        {countries.map((c) => (
          <Link key={c.code} href={`/safety?country=${c.code}`} className={`pill ${c.code === info.country.code ? 'pill-on' : ''}`}>
            {c.name}{c.isLive ? '' : ' · soon'}
          </Link>
        ))}
      </nav>
      <p className="eyebrow mt-6">{info.country.name}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold">Travel smart</h1>
      <p className="mt-2 max-w-2xl text-muted">Practical, checked information built around the problems visitors actually run into. Every page shows when we last reviewed it.</p>

      {info.advisories.map((a) => (
        <div key={a.id} className="mt-6 flex gap-3 rounded-2xl bg-amber-soft p-4 text-amber" role="status">
          <Icon name="sos" /> <span><strong>Advisory{a.city ? ` · ${a.city}` : ''}:</strong> {a.message}</span>
        </div>
      ))}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className={`flex min-h-[150px] flex-col gap-2 rounded-2xl p-5 text-white ${t.cls}`}>
            <Icon name={t.icon} size={30} />
            <strong className="font-display text-xl">{t.title}</strong>
            <span className="text-[14px] opacity-95">{t.body}</span>
          </Link>
        ))}
      </div>

      {topics.length ? (
        <section id="official" className="mt-12 scroll-mt-24">
          <h2 className="font-display text-2xl font-extrabold">Official government links</h2>
          <p className="mt-1 max-w-2xl text-muted">
            Go straight to the source for visas, park fees, licence checks and tickets. Look-alike sites copy these and charge extra; we list only official addresses and check them regularly.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {topics.map((t) => (
              <section key={t.key} className="card p-5">
                <h3 className="eyebrow">{t.label}</h3>
                <ul className="mt-2 flex flex-col divide-y divide-line">
                  {t.links.map((l) => (
                    <li key={l.url} className="py-3">
                      <a href={l.url} target="_blank" rel="noopener" className="font-bold text-brand underline">{l.title}</a>
                      <span className="ml-2 font-mono text-[12px] text-muted">{new URL(l.url).hostname.replace(/^www\./, '')}</span>
                      <p className="mt-1 text-[14px]">{l.description}</p>
                      {l.warning ? <p className="mt-1 flex gap-1.5 text-[13px] font-semibold text-amber"><Icon name="sos" size={14} className="mt-0.5 shrink-0" />{l.warning}</p> : null}
                      <p className={`mt-1 text-[12px] ${l.stale ? 'font-bold text-amber' : 'text-muted'}`}>Checked {shortDate(l.lastCheckedOn)}{l.stale ? ' · due for a re-check' : ''}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {info.pages.length ? <h2 className="mt-12 font-display text-2xl font-extrabold">Before you go</h2> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {info.pages.map((p) => (
          <article key={p.slug} id={p.slug} className="card p-5">
            <h3 className="text-lg font-extrabold">{p.title}</h3>
            <p className="mt-2 leading-relaxed">{p.body}</p>
            {p.sources.length ? (
              <ul className="mt-3 text-[14px]">
                {p.sources.map((s) => <li key={s}><a className="font-bold text-brand underline" href={s} target="_blank" rel="noopener">Official source</a></li>)}
              </ul>
            ) : null}
            <p className={`mt-3 text-[12px] ${p.stale ? 'font-bold text-amber' : 'text-muted'}`}>Last reviewed {shortDate(p.lastReviewedOn)}{p.stale ? ' · due for review' : ''}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
