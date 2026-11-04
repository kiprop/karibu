import Link from 'next/link';
import { api } from '@/lib/server-api';
import type { ListingCard as L } from '@/lib/types';
import { ListingCard } from '@/components/ListingCard';
import { CATEGORY_ICON, Icon } from '@/components/Icon';
import { HeroSearch } from '@/components/HeroSearch';

type Country = { code: string; name: string; isLive: boolean; launchWave: number };

const CATS = [
  { key: 'safari', label: 'Game drives', cls: 'media-safari' },
  { key: 'stay', label: 'Stays', cls: 'media-stay' },
  { key: 'transport', label: 'Transport', cls: 'media-transport' },
  { key: 'guide', label: 'Local guides', cls: 'media-guide' },
  { key: 'experience', label: 'Experiences', cls: 'media-experience' },
  { key: 'event', label: 'Events', cls: 'media-event' },
];

const SETTLE = [
  { key: 'home', label: 'Long-stay homes', body: 'Monthly rentals, viewed before you pay', cls: 'media-home' },
  { key: 'furniture', label: 'Furniture & home', body: 'Local workshops to big stores', cls: 'media-furniture' },
  { key: 'home_services', label: 'Home services', body: 'Movers, cleaners, plumbers, security', cls: 'media-home_services' },
  { key: 'utilities', label: 'Internet & utilities', body: 'Fibre, power, water, gas', cls: 'media-utilities' },
  { key: 'grooming', label: 'Hair & grooming', body: 'Barbers, natural hair, salons', cls: 'media-grooming' },
];

function Row({ title, href, items }: { title: string; href: string; items: L[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-12">
      <div className="container-k flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-extrabold">{title}</h2>
        <Link href={href} className="font-bold text-brand">See all</Link>
      </div>
      <div className="container-k mt-4 flex snap-x gap-4 overflow-x-auto pb-2">
        {items.map((l) => (
          <ListingCard key={l.id} l={l} compact />
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const [{ countries }, safaris, stays, rated, settle] = await Promise.all([
    api<{ countries: Country[] }>('/countries'),
    api<{ results: L[] }>('/listings?category=safari&pageSize=10'),
    api<{ results: L[] }>('/listings?category=stay&budget=mid&pageSize=10'),
    api<{ results: L[] }>('/listings?sort=rating&pageSize=10'),
    api<{ results: L[] }>('/listings?mode=settle&pageSize=10'),
  ]);

  return (
    <>
      <section className="border-b border-line bg-panel">
        <div className="container-k pb-10 pt-12 sm:pt-16">
          <p className="eyebrow text-brand">{countries.map((c) => c.name).join(' · ')}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-[54px]">
            East Africa without the guesswork.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Here for a week or for good? Stays, game drives and drivers, plus homes, furniture and home services, all checked by our team.
            Compare honestly, see what people really paid, then message them directly.
          </p>
          <HeroSearch />
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Destinations">
            {countries.map((c) =>
              c.isLive ? (
                <Link key={c.code} href={`/explore?country=${c.code}`} className="pill pill-on">{c.name}</Link>
              ) : (
                <span key={c.code} className="pill cursor-default text-muted hover:border-line" title="Opening soon">
                  {c.name} <span className="chip bg-teal-soft text-teal">Soon</span>
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="container-k mt-8" aria-label="Categories">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {CATS.map((c) => (
            <Link key={c.key} href={`/explore?category=${c.key}`} className="flex flex-col items-center gap-2 text-center text-[13px] font-bold">
              <span className={`flex h-16 w-16 items-center justify-center rounded-2xl text-white ${c.cls}`}>
                <Icon name={CATEGORY_ICON[c.key]} size={28} />
              </span>
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <Row title="Game drives and safaris" href="/explore?category=safari" items={safaris.results} />

      <section className="container-k mt-14" aria-labelledby="settle-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Staying longer or moving home?</p>
            <h2 id="settle-h" className="mt-1 font-display text-3xl font-extrabold">Settle in</h2>
            <p className="mt-1 max-w-2xl text-muted">For returning diaspora, remote workers and long stays: a home, furniture, people you can let into it, and a good barber.</p>
          </div>
          <Link href="/settle" className="font-bold text-brand">Moving home guide</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETTLE.map((c) => (
            <Link key={c.key} href={`/explore?category=${c.key}`} className={`flex min-h-[140px] flex-col justify-between rounded-2xl p-4 text-white ${c.cls}`}>
              <Icon name={CATEGORY_ICON[c.key]} size={28} />
              <span><strong className="block font-display text-lg leading-tight">{c.label}</strong><span className="text-[13px] opacity-90">{c.body}</span></span>
            </Link>
          ))}
        </div>
      </section>
      <Row title="Popular for settling in" href="/explore?mode=settle" items={settle.results} />
      <Row title="Mid-range stays with hot water that works" href="/explore?category=stay&budget=mid" items={stays.results} />

      <section className="container-k mt-12 grid gap-4 md:grid-cols-3">
        {[
          { icon: 'shield', title: 'Checked, not guessed', body: 'Every business passes identity, licence or site checks before it appears. The badge says exactly what we checked and when.' },
          { icon: 'chat', title: 'Message them directly', body: 'Tap to open WhatsApp with a reference code. No middleman, no booking fees, no commission.' },
          { icon: 'tag', title: 'Fair prices, up front', body: 'Check any quote against what locals pay and what other travellers really paid. No more mzungu price.' },
        ].map((b) => (
          <div key={b.title} className="card p-5">
            <Icon name={b.icon} className="text-brand" size={26} />
            <h3 className="mt-3 text-lg font-extrabold">{b.title}</h3>
            <p className="mt-1 text-muted">{b.body}</p>
          </div>
        ))}
      </section>

      <section className="container-k mt-12">
        <div className="flex flex-col gap-4 rounded-2xl p-6 text-white media-safari sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Been somewhere? Pay it forward.</h2>
            <p className="mt-1 max-w-xl opacity-95">Share what you paid and how you were treated. It takes a minute and it’s how the next traveller avoids the mzungu price.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/safety/prices/add" className="btn bg-white px-5 font-bold text-[#15171C]">I paid this much</Link>
            <Link href="/share" className="btn border-2 border-white px-5 font-bold text-white">Rate a business</Link>
          </div>
        </div>
      </section>

      <Row title="Top rated by travellers" href="/explore?sort=rating" items={rated.results} />

      <section className="container-k mt-12">
        <Link href="/safety/check" className="flex flex-col gap-3 rounded-2xl bg-ink p-6 text-ground sm:flex-row sm:items-center sm:p-8">
          <Icon name="shield" size={40} className="text-[#3FD1BE]" />
          <div className="flex-1">
            <h2 className="font-display text-2xl font-extrabold">Booking a safari elsewhere? Check the operator first.</h2>
            <p className="mt-1 opacity-80">Free check against our verified list and scam watchlist, before you send any money.</p>
          </div>
          <span className="btn bg-ground text-ink">Check an operator</span>
        </Link>
      </section>

      <section className="container-k mt-12">
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1">
            <h2 className="font-display text-2xl font-extrabold">Run a camp, a 4x4 or a tour?</h2>
            <p className="mt-1 text-muted">List free. Our team verifies you, then travellers message you directly. No commission.</p>
          </div>
          <Link href="/vendor" className="btn-primary">List your business</Link>
        </div>
      </section>
    </>
  );
}
