import Link from 'next/link';
import { api } from '@/lib/server-api';
import { ActionCard, Page } from '@/components/Page';
import { ExperienceCard } from '@/components/ExperienceCard';
import { CATEGORY_SINGULAR, type Experience, type ListingCard } from '@/lib/types';

export const metadata = { title: 'Share what you know' };

const WAYS: { href: string; icon: string; title: string; body: string; tone: 'amber' | 'brand' | 'danger' | 'teal'; note: string }[] = [
  { href: '#rate', icon: 'star', title: 'Rate a business', body: 'Stars, would you recommend it, what you paid and what happened.', tone: 'amber', note: 'Free account' },
  { href: '/safety/prices/add', icon: 'tag', title: 'I paid this much', body: 'A meal, ride, tour or souvenir. Helps the next traveller avoid the “mzungu price”.', tone: 'brand', note: 'No account needed' },
  { href: '/report', icon: 'flag', title: 'Report a scam or problem', body: 'Overcharging, a fake operator, a safety issue or wrong information.', tone: 'danger', note: 'No account needed' },
  { href: '/recommend', icon: 'plus', title: 'Recommend a business', body: 'Know a good camp, driver or guide that isn’t on Karibu yet? Tell us.', tone: 'teal', note: 'No account needed' },
];

export default async function Share({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [found, feed] = await Promise.all([
    q ? api<{ results: ListingCard[] }>(`/listings?q=${encodeURIComponent(q)}&pageSize=8`, { revalidate: 0 }) : Promise.resolve(null),
    api<{ experiences: Experience[] }>('/experiences/recent?limit=12', { revalidate: 0 }),
  ]);

  return (
    <Page crumbs={[{ label: 'Share' }]} eyebrow="Traveller to traveller" title="Share what you know"
      desc="What you paid, how you were treated and whether you’d go back. Your experience is what makes the next traveller’s trip safer and fairer.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WAYS.map((w) => <ActionCard key={w.title} {...w} />)}
      </div>

      <section id="rate" className="card scroll-mt-24 p-5">
        <h2 className="section-title">Rate a business</h2>
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

      <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Latest experiences</h2>
        <Link href="/safety/prices" className="text-[14px] font-semibold text-brand hover:underline">See what travellers paid →</Link>
      </div>
      {feed.experiences.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {feed.experiences.map((e) => <ExperienceCard key={e.id} e={e} showListing />)}
        </div>
      ) : (
        <p className="text-muted">No experiences shared yet. Be the first.</p>
      )}
      </section>
    </Page>
  );
}
