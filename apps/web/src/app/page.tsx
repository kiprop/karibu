import Link from 'next/link';
import { api } from '@/lib/server-api';
import type { ListingCard as L } from '@/lib/types';
import { ListingCard } from '@/components/ListingCard';
import { CATEGORY_ICON, Icon } from '@/components/Icon';

type Country = { code: string; name: string; isLive: boolean; launchWave: number };

const CATS = [
  { key: 'safari', label: 'Game drives', cls: 'media-safari' },
  { key: 'stay', label: 'Stays', cls: 'media-stay' },
  { key: 'transport', label: 'Transport', cls: 'media-transport' },
  { key: 'guide', label: 'Local guides', cls: 'media-guide' },
  { key: 'experience', label: 'Experiences', cls: 'media-experience' },
  { key: 'event', label: 'Events', cls: 'media-event' },
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
  const [{ countries }, safaris, stays, rated] = await Promise.all([
    api<{ countries: Country[] }>('/countries'),
    api<{ results: L[] }>('/listings?category=safari&pageSize=10'),
    api<{ results: L[] }>('/listings?category=stay&budget=mid&pageSize=10'),
    api<{ results: L[] }>('/listings?sort=rating&pageSize=10'),
  ]);

  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft to-ground">
        <div className="container-k pb-10 pt-12 sm:pt-16">
          <p className="eyebrow text-brand">{countries.map((c) => c.name).join(' · ')}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Travel East Africa without the guesswork.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Stays, game drives, drivers and guides checked by our team. Compare honestly, then message them directly on WhatsApp.
          </p>
          <form action="/explore" className="mt-6 flex max-w-2xl items-center gap-2 rounded-full border-2 border-ink bg-panel p-1.5 pl-5 shadow-sm">
            <Icon name="search" className="text-muted" />
            <label htmlFor="hero-q" className="sr-only">Search</label>
            <input id="hero-q" name="q" placeholder="Mara game drive, Naivasha camp, airport transfer…" className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-muted" />
            <button className="btn-primary" type="submit">Search</button>
          </form>
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
              <span className={`flex h-16 w-16 items-center justify-center rounded-[20px] text-white ${c.cls}`}>
                <Icon name={CATEGORY_ICON[c.key]} size={28} />
              </span>
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <Row title="Game drives and safaris" href="/explore?category=safari" items={safaris.results} />
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

      <Row title="Top rated by travellers" href="/explore?sort=rating" items={rated.results} />

      <section className="container-k mt-12">
        <Link href="/safety/check" className="flex flex-col gap-3 rounded-[24px] bg-ink p-6 text-ground sm:flex-row sm:items-center sm:p-8">
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
