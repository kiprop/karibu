import Link from 'next/link';
import { api } from '@/lib/server-api';
import type { Category, ListingCard as L } from '@/lib/types';
import { Media, PlaceImage } from '@/components/bits';
import { ListingCard } from '@/components/ListingCard';
import { Icon } from '@/components/Icon';
import { HeroSearch } from '@/components/HeroSearch';
import { Suggestions } from '@/components/Suggestions';
import { cookies } from 'next/headers';
import { LANG_COOKIE, langFromCookie, t } from '@/lib/i18n';

type Country = { code: string; name: string; isLive: boolean; launchWave: number };

const CATS: { key: Category; label: string }[] = [
  { key: 'safari', label: 'Game drives' },
  { key: 'stay', label: 'Stays' },
  { key: 'transport', label: 'Transport' },
  { key: 'guide', label: 'Local guides' },
  { key: 'experience', label: 'Experiences' },
  { key: 'event', label: 'Events' },
];

const PLACES = [
  { slug: 'maasai-mara', name: 'Maasai Mara', line: 'The migration, July to October', fallback: 'safari' as Category },
  { slug: 'amboseli', name: 'Amboseli', line: 'Elephants under Kilimanjaro', fallback: 'safari' as Category },
  { slug: 'nairobi', name: 'Nairobi', line: 'Arrive, settle in, day trips', fallback: 'home' as Category },
  { slug: 'zanzibar', name: 'Zanzibar', line: 'Stone Town and the coast · opening soon', fallback: 'experience' as Category },
];

const SETTLE: { key: Category; label: string; body: string }[] = [
  { key: 'home', label: 'Long-stay homes', body: 'Monthly rentals, viewed before you pay' },
  { key: 'furniture', label: 'Furniture & home', body: 'Local workshops to big stores' },
  { key: 'home_services', label: 'Home services', body: 'Movers, cleaners, plumbers, security' },
  { key: 'utilities', label: 'Internet & utilities', body: 'Fibre, power, water, gas' },
  { key: 'grooming', label: 'Hair & grooming', body: 'Barbers, natural hair, salons' },
];

function SectionHead({ title, href, more = 'See all', eyebrow, desc, id }: { title: string; href?: string; more?: string; eyebrow?: string; desc?: string; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h2 id={id} className="text-[22px] font-semibold tracking-tight">{title}</h2>
        {desc ? <p className="mt-1 max-w-2xl text-[14.5px] text-muted">{desc}</p> : null}
      </div>
      {href ? <Link href={href} className="text-[14px] font-semibold text-brand hover:underline">{more} →</Link> : null}
    </div>
  );
}

function Row({ title, href, items }: { title: string; href: string; items: L[] }) {
  if (!items.length) return null;
  return (
    <section className="container-k mt-12">
      <SectionHead title={title} href={href} />
      <div className="mt-4 flex snap-x gap-4 overflow-x-auto pb-2">
        {items.map((l) => (
          <ListingCard key={l.id} l={l} compact />
        ))}
      </div>
    </section>
  );
}

export default async function Home() {
  const lang = langFromCookie((await cookies()).get(LANG_COOKIE)?.value);
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
        <div className="container-k grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="eyebrow text-brand">{countries.map((c) => c.name).join(' · ')}</p>
            <h1 className="mt-3 text-[36px] font-semibold leading-[1.05] tracking-tight sm:text-[52px]">
              {t(lang, 'East Africa without the guesswork.')}
            </h1>
            <p className="mt-4 max-w-[60ch] text-[16.5px] leading-relaxed text-muted">
              {t(lang, 'Here for a week or for good? Stays, game drives and drivers, plus homes, furniture and home services, all checked by our team. Compare honestly, see what people really paid, then message them directly.')}
            </p>
            <HeroSearch lang={lang} />
          </div>
          <div className="hidden min-w-0 grid-cols-2 content-start gap-3 lg:grid">
            <PlaceImage slug="maasai-mara" eager width={960} className="col-span-2 aspect-[16/9] rounded-xl" />
            <PlaceImage slug="amboseli" fallback="safari" width={640} className="aspect-[4/3] rounded-xl" />
            <PlaceImage slug="zanzibar" fallback="experience" width={640} className="aspect-[4/3] rounded-xl" />
          </div>
        </div>
      </section>

      <section className="container-k mt-8" aria-label="Categories">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {CATS.map((c) => (
            <Link key={c.key} href={`/explore?category=${c.key}`} className="group flex flex-col gap-2 text-[13.5px] font-semibold">
              <Media category={c.key} className="aspect-[4/3] rounded-lg ring-1 ring-line transition group-hover:ring-muted/50" />
              <span className="group-hover:underline">{t(lang, c.label)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-k mt-10" aria-label="Your travel companion">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['/today', 'compass', 'Your trip, day by day', 'Add your dates. Karibu shows what to sort before you fly, your plan each morning, and what’s in season.'],
            ['/ask', 'chat', 'Ask Karibu anything', '“Is 6,500 fair for a taxi from JKIA?” Answers from checked prices, verified businesses and official sites.'],
            ['/plan?mode=settle', 'home', 'Moving home?', 'A first-month plan: SIM and M-Pesa, a verified home, internet, furniture, help at home.'],
          ].map(([href, icon, title, body]) => (
            <Link key={href} href={href} className="group flex gap-3 rounded-xl border border-line bg-panel p-4 hover:border-muted/40">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={icon} size={20} /></span>
              <span><span className="block font-semibold group-hover:underline">{title}</span><span className="mt-0.5 block text-[13.5px] text-muted">{body}</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-k mt-12" aria-labelledby="places-h">
        <SectionHead id="places-h" title="Where people are going" href="/explore" more="Explore everywhere" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PLACES.map((p) => (
            <Link key={p.slug} href={`/explore?city=${p.slug}`} className="group flex flex-col gap-2">
              <PlaceImage slug={p.slug} fallback={p.fallback} width={640} credit={false} className="aspect-[4/3] rounded-lg" />
              <span><span className="block font-semibold group-hover:underline">{p.name}</span><span className="text-[13px] text-muted">{p.line}</span></span>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-muted">Photos from Wikimedia Commons: Thomas Fuhrmann, Amoghavarsha JS, Sam Stearman and Erasmus Kamugisha, CC BY-SA.</p>
      </section>

      <div className="container-k mt-12"><Suggestions title="Suggested for you" limit={6} /></div>

      <Row title="Game drives and safaris" href="/explore?category=safari" items={safaris.results} />

      <section className="container-k mt-14" aria-labelledby="settle-h">
        <SectionHead id="settle-h" eyebrow="Staying longer or moving home?" title="Settle in" href="/settle" more="Moving home guide"
          desc="For returning diaspora, remote workers and long stays: a home, furniture, people you can let into it, and a good barber." />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETTLE.map((c) => (
            <Link key={c.key} href={`/explore?category=${c.key}`} className="card group flex flex-col overflow-hidden hover:border-muted/50">
              <Media category={c.key} className="aspect-[16/10]" />
              <span className="p-3"><strong className="block text-[14.5px] font-semibold leading-tight group-hover:underline">{c.label}</strong><span className="text-[12.5px] text-muted">{c.body}</span></span>
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
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={b.icon} size={20} /></span>
            <h3 className="mt-3 section-title">{b.title}</h3>
            <p className="mt-1 text-[14.5px] text-muted">{b.body}</p>
          </div>
        ))}
      </section>

      <section className="container-k mt-12">
        <div className="card grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight">Been somewhere? Pay it forward.</h2>
              <p className="mt-1 max-w-xl text-muted">Share what you paid and how you were treated. It takes a minute and it’s how the next traveller avoids the mzungu price.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/safety/prices/add" className="btn-primary">I paid this much</Link>
              <Link href="/share" className="btn-outline">Rate a business</Link>
            </div>
          </div>
          <Media category="experience" className="hidden sm:block" />
        </div>
      </section>

      <Row title="Top rated by travellers" href="/explore?sort=rating" items={rated.results} />

      <section className="container-k mt-12">
        <Link href="/safety/check" className="flex flex-col gap-4 rounded-xl bg-ink p-6 text-ground sm:flex-row sm:items-center sm:p-8">
          <Icon name="shield" size={36} className="shrink-0 text-[#3FD1BE]" />
          <div className="flex-1">
            <h2 className="text-[22px] font-semibold tracking-tight">Booking a safari elsewhere? Check the operator first.</h2>
            <p className="mt-1 opacity-80">Free check against our verified list and scam watchlist, before you send any money.</p>
          </div>
          <span className="btn bg-ground text-ink">Check an operator</span>
        </Link>
      </section>

      <section className="container-k mt-12">
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1">
            <h2 className="text-[22px] font-semibold tracking-tight">Run a camp, a 4x4 or a tour?</h2>
            <p className="mt-1 text-muted">List free. Our team verifies you, then travellers message you directly. No commission.</p>
          </div>
          <Link href="/vendor" className="btn-primary">List your business</Link>
        </div>
      </section>
    </>
  );
}
