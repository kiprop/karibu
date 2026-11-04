import Link from 'next/link';
import { api } from '@/lib/server-api';
import { CATEGORY_ICON, Icon } from '@/components/Icon';
import { ListingCard } from '@/components/ListingCard';
import { CATEGORY_LABEL, SETTLE_CATEGORIES, type ListingCard as L } from '@/lib/types';

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
      <section className="text-white" style={{ background: 'linear-gradient(135deg,#14181D 0%,#2A3340 60%,#3A4A5C 100%)' }}>
        <div className="container-k py-14">
          <p className="eyebrow text-[#F0A83C]">For returning diaspora, remote workers and long stays</p>
          <h1 className="mt-2 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">Moving home, without the runaround.</h1>
          <p className="mt-4 max-w-2xl text-lg opacity-90">
            A home, furniture, people you can trust in your house, internet that works and a good barber. Checked businesses, honest prices from people who paid, and what to watch out for.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {SETTLE_CATEGORIES.map((c) => (
              <Link key={c} href={`/explore?category=${c}`} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 font-bold hover:bg-white/20">
                <Icon name={CATEGORY_ICON[c]} size={18} />{CATEGORY_LABEL[c]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="container-k py-10">
        <h2 className="font-display text-2xl font-extrabold">Your first weeks, step by step</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white media-${s.cat}`}><Icon name={s.icon} size={22} /></span>
                <h3 className="text-lg font-extrabold"><span className="text-muted">{i + 1}.</span> {s.title}</h3>
              </div>
              <ul className="flex flex-col gap-2 text-[15px]">
                {s.tips.map((t) => <li key={t} className="flex gap-2"><Icon name="check" size={16} strokeWidth={3} className="mt-1 shrink-0 text-teal" />{t}</li>)}
              </ul>
              <Link href={`/explore?category=${s.cat}`} className="mt-auto font-bold text-brand">Browse {CATEGORY_LABEL[s.cat as keyof typeof CATEGORY_LABEL].toLowerCase()}</Link>
            </li>
          ))}
        </ol>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <Link href="/safety/prices" className="card flex flex-col gap-2 p-5 hover:border-ink">
            <Icon name="tag" className="text-brand" size={26} /><strong className="text-lg">What things really cost</strong>
            <span className="text-muted">From a sofa to a month of fibre, see what people paid and check a quote.</span>
          </Link>
          <Link href="/safety#official" className="card flex flex-col gap-2 p-5 hover:border-ink">
            <Icon name="shield" className="text-brand" size={26} /><strong className="text-lg">Official government links</strong>
            <span className="text-muted">Immigration, eCitizen and other official sites, with warnings about look-alikes.</span>
          </Link>
          <Link href="/share" className="card flex flex-col gap-2 p-5 hover:border-ink">
            <Icon name="star" className="text-brand" size={26} /><strong className="text-lg">Help the next person home</strong>
            <span className="text-muted">Rate the landlord, fundi or movers you used, and share what you paid.</span>
          </Link>
        </section>

        {results.length ? (
          <section className="mt-12">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-extrabold">Checked businesses for settling in</h2>
              <Link href="/explore?mode=settle" className="font-bold text-brand">See all</Link>
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
