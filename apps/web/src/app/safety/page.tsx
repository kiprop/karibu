import Link from 'next/link';
import { api } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { shortDate } from '@/lib/format';

export const metadata = { title: 'Travel smart' };

type Info = { country: { name: string }; pages: { slug: string; title: string; body: string; sources: string[]; lastReviewedOn: string; stale: boolean }[]; advisories: { id: string; message: string; city: string | null }[] };

const TOOLS = [
  { href: '/safety/check', icon: 'shield', title: 'Check an operator', body: 'Before you pay a safari company, hotel agent or guide.', cls: 'media-transport' },
  { href: '/safety/prices', icon: 'tag', title: 'Fair prices', body: 'Check a quote, and see what travellers really paid.', cls: 'media-stay' },
  { href: '/safety/emergency', icon: 'sos', title: 'Emergency card', body: 'Numbers, lost passport steps, embassies.', cls: 'media-event' },
  { href: '/safety/meet', icon: 'people', title: 'Meet safely', body: 'Meeting someone you know only from online.', cls: 'media-experience' },
];

export default async function Safety({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const { country = 'KE' } = await searchParams;
  const info = await api<Info>(`/countries/${country}/info`);
  return (
    <div className="container-k py-10">
      <p className="eyebrow">{info.country.name}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold">Travel smart</h1>
      <p className="mt-2 max-w-2xl text-muted">Practical, checked information built around the problems visitors actually run into. Every page shows when we last reviewed it.</p>

      {info.advisories.map((a) => (
        <div key={a.id} className="mt-6 flex gap-3 rounded-2xl bg-amber-soft p-4 text-amber" role="status">
          <Icon name="sos" /> <span><strong>Advisory{a.city ? ` · ${a.city}` : ''}:</strong> {a.message}</span>
        </div>
      ))}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className={`flex min-h-[150px] flex-col gap-2 rounded-[20px] p-5 text-white ${t.cls}`}>
            <Icon name={t.icon} size={30} />
            <strong className="font-display text-xl">{t.title}</strong>
            <span className="text-[14px] opacity-95">{t.body}</span>
          </Link>
        ))}
      </div>

      <h2 className="mt-12 font-display text-2xl font-extrabold">Before you go</h2>
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
