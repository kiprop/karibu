import Link from 'next/link';
import { api } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { ExperienceCard } from '@/components/ExperienceCard';
import { CATEGORY_SINGULAR, type Experience, type ListingCard } from '@/lib/types';

export const metadata = { title: 'Share what you know' };

const WAYS = [
  { href: '#rate', icon: 'star', title: 'Rate a business', body: 'Stars, would you recommend it, what you paid and what happened.', cls: 'media-safari', note: 'Free account' },
  { href: '/safety/prices/add', icon: 'tag', title: 'I paid this much', body: 'A meal, ride, tour or souvenir. Helps the next traveller avoid the “mzungu price”.', cls: 'media-stay', note: 'No account needed' },
  { href: '/report', icon: 'flag', title: 'Report a scam or problem', body: 'Overcharging, a fake operator, a safety issue or wrong information.', cls: 'media-event', note: 'No account needed' },
  { href: '/recommend', icon: 'plus', title: 'Recommend a business', body: 'Know a good camp, driver or guide that isn’t on Karibu yet? Tell us.', cls: 'media-experience', note: 'No account needed' },
];

export default async function Share({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [found, feed] = await Promise.all([
    q ? api<{ results: ListingCard[] }>(`/listings?q=${encodeURIComponent(q)}&pageSize=8`, { revalidate: 0 }) : Promise.resolve(null),
    api<{ experiences: Experience[] }>('/experiences/recent?limit=12', { revalidate: 0 }),
  ]);

  return (
    <div className="container-k py-10">
      <p className="eyebrow">Traveller to traveller</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold">Share what you know</h1>
      <p className="mt-2 max-w-2xl text-muted">What you paid, how you were treated and whether you’d go back. Your experience is what makes the next traveller’s trip safer and fairer.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WAYS.map((w) => (
          <Link key={w.title} href={w.href} className={`flex min-h-[170px] flex-col gap-2 rounded-[20px] p-5 text-white ${w.cls}`}>
            <Icon name={w.icon} size={28} />
            <strong className="font-display text-xl">{w.title}</strong>
            <span className="text-[14px] opacity-95">{w.body}</span>
            <span className="mt-auto text-[12px] font-bold uppercase tracking-wide opacity-90">{w.note}</span>
          </Link>
        ))}
      </div>

      <section id="rate" className="card mt-10 scroll-mt-24 p-5">
        <h2 className="font-display text-2xl font-extrabold">Rate a business</h2>
        <p className="mt-1 text-[14px] text-muted">Find the stay, driver, guide or tour you used. Ratings need a free account so every star has a real person behind it; we never show your full name.</p>
        <form className="mt-4 flex gap-2" action="/share#rate">
          <label htmlFor="q" className="sr-only">Business or listing name</label>
          <input id="q" name="q" defaultValue={q ?? ''} required minLength={2} className="input" placeholder="Camp, safari company, driver, place…" />
          <button className="btn-primary">Find</button>
        </form>
        {found ? (
          found.results.length ? (
            <ul className="mt-4 divide-y divide-line">
              {found.results.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <strong>{l.title}</strong>
                    <span className="block text-[13px] text-muted">{CATEGORY_SINGULAR[l.category]} · {l.city} · {l.vendorName}</span>
                  </span>
                  <Link href={`/share/experience?listing=${l.slug}`} className="btn-outline h-10">Share experience</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[15px]">
              Nothing on Karibu matches “{q}”. You can still <Link href="/safety/prices/add" className="font-bold text-brand underline">share what you paid</Link>,{' '}
              <Link href="/report" className="font-bold text-brand underline">report a problem</Link> or <Link href="/recommend" className="font-bold text-brand underline">recommend them</Link>.
              We only show ratings for businesses we’ve verified, so one bad actor can’t pose as another.
            </p>
          )
        ) : null}
      </section>

      <h2 className="mt-12 font-display text-2xl font-extrabold">Latest experiences</h2>
      {feed.experiences.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {feed.experiences.map((e) => <ExperienceCard key={e.id} e={e} showListing />)}
        </div>
      ) : (
        <p className="mt-3 text-muted">No experiences shared yet. Be the first.</p>
      )}
      <p className="mt-6 text-[14px]"><Link href="/safety/prices" className="font-bold text-brand underline">See what travellers paid</Link> for food, rides and more.</p>
    </div>
  );
}
