import Link from 'next/link';
import { api } from '@/lib/server-api';
import { CATEGORY_ICON, Icon } from '@/components/Icon';
import { ListingCard } from '@/components/ListingCard';
import { CATEGORY_LABEL, SETTLE_CATEGORIES, type Category, type ListingCard as L } from '@/lib/types';
import { ActionCard, Hero } from '@/components/Page';
import { Media, PlaceImage } from '@/components/bits';

export const metadata = { title: 'Settle in: moving home and long stays' };

const STEPS = [
  {
    icon: 'home', title: 'Find a home without losing a deposit', cat: 'home',
    tips: [
      'View the place in person, or by live video call, before you pay anything.',
      'Pay deposits to a company or landlord account in the name on the agreement, never to a personal mobile number you can’t check.',
      'Get a written tenancy agreement that states the rent, deposit, notice period and what the rent includes.',
      'Ask about water storage and backup power; outages happen in many areas.',
    ],
  },
  {
    icon: 'sofa', title: 'Furnish it: local workshop or big store', cat: 'furniture',
    tips: [
      'Local workshops (fundis) build to your measurements in solid wood and are often cheaper, but take weeks. Get a written quote with dimensions, wood and finish.',
      'Stores have fixed prices, stock and warranties, and deliver next day. Good for mattresses and appliances.',
      'For made-to-order work, pay a deposit and the balance on delivery, and inspect before you pay the rest.',
      'Check what others paid before you agree a price.',
    ],
  },
  {
    icon: 'wrench', title: 'People you can let into your home', cat: 'home_services',
    tips: [
      'Movers, cleaners and repair people on Karibu need document checks before they appear.',
      'Agree the price, and any call-out fee, before the job starts.',
      'Prefer businesses that ID-check their staff and say so.',
    ],
  },
  {
    icon: 'wifi', title: 'Get connected', cat: 'utilities',
    tips: [
      'Ask your building which fibre providers already serve it; installation is much faster.',
      'Many homes use prepaid electricity tokens bought with mobile money. Ask how yours works on day one.',
      'Register your SIM with your passport and set up mobile money early; much of daily life runs on it.',
    ],
  },
  {
    icon: 'scissors', title: 'Find your barber or salon', cat: 'grooming',
    tips: [
      'Look for clean, sterilised tools and prices on the wall.',
      'Natural hair specialists list the hair types they work with. Use the filter.',
      'Experiences from people like you (long stay, moving home) are the best guide. Filter by them on any listing.',
    ],
  },
];

export default async function Settle() {
  const { results } = await api<{ results: L[] }>('/listings?mode=settle&sort=rating&pageSize=12', { revalidate: 0 });
  return (
    <div>
      <Hero crumbs={[{ label: 'Settle in' }]} eyebrow="For returning diaspora, remote workers and long stays" title="Moving home, without the runaround."
        desc="A home, furniture, people you can trust in your house, internet that works and a good barber. Checked businesses, honest prices from people who paid, and what to watch out for."
        picture={<PlaceImage slug="nairobi" fallback="home" eager className="aspect-[4/3] rounded-xl sm:aspect-[16/10]" />}>
        <div className="flex flex-wrap gap-2">
          {SETTLE_CATEGORIES.map((c) => (
            <Link key={c} href={`/explore?category=${c}`} className="pill">
              <Icon name={CATEGORY_ICON[c]} size={16} />{CATEGORY_LABEL[c]}
            </Link>
          ))}
        </div>
      </Hero>

      <div className="container-k flex flex-col gap-10 py-10">
        <section>
        <h2 className="section-title">Your first weeks, step by step</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex flex-col overflow-hidden">
              <Media category={s.cat as Category} className="h-28 shrink-0" />
              <div className="flex flex-1 flex-col gap-3 p-5">
              <h3 className="section-title"><span className="text-muted">{i + 1}.</span> {s.title}</h3>
              <ul className="flex flex-col gap-2 text-[14.5px]">
                {s.tips.map((t) => <li key={t} className="flex gap-2"><Icon name="check" size={16} strokeWidth={3} className="mt-1 shrink-0 text-teal" />{t}</li>)}
              </ul>
              <Link href={`/explore?category=${s.cat}`} className="mt-auto font-semibold text-brand hover:underline">Browse {CATEGORY_LABEL[s.cat as keyof typeof CATEGORY_LABEL].toLowerCase()} →</Link>
              </div>
            </li>
          ))}
        </ol>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <ActionCard href="/safety/prices" icon="tag" title="What things really cost" body="From a sofa to a month of fibre, see what people paid and check a quote." />
          <ActionCard href="/safety#official" icon="shield" tone="teal" title="Official government links" body="Immigration, eCitizen and other official sites, with warnings about look-alikes." />
          <ActionCard href="/share" icon="star" tone="amber" title="Help the next person home" body="Rate the landlord, fundi or movers you used, and share what you paid." />
        </section>

        {results.length ? (
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">Checked businesses for settling in</h2>
              <Link href="/explore?mode=settle" className="text-[14px] font-semibold text-brand hover:underline">See all →</Link>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((l) => <ListingCard key={l.id} l={l} />)}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
