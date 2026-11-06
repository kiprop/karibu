import { Breadcrumbs } from '@/components/Breadcrumbs';
import Link from 'next/link';
import { api } from '@/lib/server-api';
import { AMENITY_LABEL, CATEGORY_LABEL, SETTLE_CATEGORIES, VISIT_CATEGORIES, isSettle, type Category, type ListingCard as L } from '@/lib/types';
import { ListingCard } from '@/components/ListingCard';
import { Icon } from '@/components/Icon';
import { ExploreMap } from './ExploreMap';
import { NearMe, TellUs } from './SmartBits';

type Understood = { chips: { key: string; label: string }[]; corrections: { from: string; to: string }[]; rest: string; filters: { near?: boolean }; params: Record<string, string> };
type Relaxed = { without: string; params: Record<string, string>; total: number; results: L[] };

/** The page link without one understood filter, so each chip can be removed. */
function withoutChip(u: Understood, key: string) {
  const p = { ...u.params };
  if (key === 'category') { delete p.category; delete p.subtype; delete p.mode; }
  else if (key.startsWith('amenity:')) {
    const a = (p.amenities ?? '').split(',').filter((x) => x && x !== key.slice(8));
    if (a.length) p.amenities = a.join(','); else delete p.amenities;
  } else delete p[key];
  return `/explore?${new URLSearchParams(p)}`;
}

export const metadata = { title: 'Explore' };

type SP = Record<string, string | undefined>;

const AMENITY_FILTERS: Record<string, string[]> = {
  stay: ['hot_water', 'wifi', 'power_backup', 'pool', 'family_rooms', 'breakfast'],
  safari: ['pop_top_roof', 'window_seats', 'park_fees_included', 'vehicle_charging'],
  transport: ['airport_pickup'],
  home: ['wifi', 'backup_water', 'power_backup', 'gated_compound', 'pet_friendly', 'parking'],
  furniture: ['delivery', 'installation', 'card_payment'],
  grooming: ['walk_ins', 'home_visits', 'card_payment'],
};

function qs(base: SP, patch: SP) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) u.set(k, v);
  u.delete('page');
  return `/explore?${u.toString()}`;
}

export default async function Explore({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const sp: SP = {};
  for (const [k, v] of Object.entries(raw)) if (k !== 'amenity') sp[k] = Array.isArray(v) ? v[0] : v;
  // Checkbox filters arrive as repeated ?amenity=… values; the API takes one comma-separated list.
  const picked = [raw.amenity].flat().filter(Boolean) as string[];
  if (picked.length) sp.amenities = picked.join(',');
  const view = sp.view === 'map' ? 'map' : 'list';
  const params = new URLSearchParams();
  for (const k of ['q', 'country', 'city', 'category', 'mode', 'subtype', 'budget', 'minLevel', 'priceMax', 'amenities', 'bedrooms', 'furnished', 'month', 'lat', 'lon', 'sort', 'page', 'nl']) if (sp[k]) params.set(k, sp[k]!);
  params.set('pageSize', view === 'map' ? '50' : '24');
  const [data, meta, cities] = await Promise.all([
    api<{ total: number; page: number; pageSize: number; featured: L[]; results: L[]; understood: Understood | null; relaxed: Relaxed | null; didYouMean: string | null }>(`/listings?${params}`),
    api<{ categories: Record<Category, string[]> }>('/meta'),
    api<{ cities: { slug: string; name: string; isLive: boolean; listingCount: number }[] }>('/cities?country=KE'),
  ]);
  const u = data.understood;
  const cat = (sp.category ?? u?.params.category) as Category | undefined;
  // Visiting (short trips) or Settling in (long stays, moving home). A chosen category decides it.
  const mode: 'visit' | 'settle' = cat ? (isSettle(cat) ? 'settle' : 'visit') : sp.mode === 'settle' ? 'settle' : 'visit';
  const modeCats = mode === 'settle' ? SETTLE_CATEGORIES : VISIT_CATEGORIES;
  const amen = new Set((sp.amenities ?? '').split(',').filter(Boolean));
  const page = data.page;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const featuredIds = new Set(data.featured.map((f) => f.id));

  return (
    <div className="container-k py-8">
      {cat || mode === 'settle' || sp.q || sp.city ? (
        <Breadcrumbs className="mb-4" items={[
          mode === 'settle' ? { label: 'Settle in', href: '/settle' } : { label: 'Explore', href: '/explore' },
          ...(sp.city ? [{ label: cities.cities.find((c) => c.slug === sp.city)?.name ?? sp.city, href: qs({}, { city: sp.city, mode: mode === 'settle' ? 'settle' : undefined }) }] : []),
          { label: cat ? CATEGORY_LABEL[cat] : sp.q ? `“${sp.q}”` : sp.city ? 'Everything' : 'All' },
        ]} />
      ) : null}
      <div role="tablist" aria-label="What are you planning?" className="mb-5 inline-flex rounded-lg bg-soft p-1 text-[14px] font-bold">
        {([['visit', 'Visiting'], ['settle', 'Staying long or moving home']] as const).map(([m, t]) => (
          <Link key={m} role="tab" aria-selected={mode === m} href={qs({ ...sp, category: undefined, subtype: undefined, amenities: undefined }, { mode: m === 'settle' ? 'settle' : undefined })}
            className={`rounded-md px-4 py-1.5 ${mode === m ? 'bg-panel shadow-sm' : 'text-muted'}`}>{t}</Link>
        ))}
      </div>
      <h1 className="font-display text-3xl font-extrabold">{cat ? CATEGORY_LABEL[cat] : sp.q ? `Results for “${sp.q}”` : mode === 'settle' ? 'Settle in' : 'Explore East Africa'}</h1>
      <p className="mt-1 text-muted">Every listing here was checked by our team before it appeared. {data.total} found{sp.sort === 'distance' && sp.lat ? ', nearest first' : ''}.</p>

      {u && u.chips.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5" aria-label="What we understood">
          <span className="text-[12.5px] font-semibold text-muted">We understood</span>
          {u.chips.filter((c) => c.key !== 'near').map((c) => (
            <Link key={c.key} href={withoutChip(u, c.key)} className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1 text-[13px] font-medium text-brand hover:bg-brand/15" aria-label={`Remove ${c.label}`}>
              {c.label} <Icon name="x" size={13} />
            </Link>
          ))}
          {u.rest ? <span className="text-[12.5px] text-muted">and ranked by “{u.rest}”</span> : null}
          {u.filters.near && !sp.lat ? <NearMe base={u.params} label="Use my location" /> : null}
          {u.corrections.length ? <span className="w-full text-[12.5px] text-muted">Read {u.corrections.map((x) => `“${x.from}” as “${x.to}”`).join(', ')}.</span> : null}
        </div>
      ) : null}

      <nav aria-label="Categories" className="mt-5 flex gap-2 overflow-x-auto pb-1">
        <Link href={qs(sp, { category: undefined, subtype: undefined, amenities: undefined, mode: mode === 'settle' ? 'settle' : undefined })} className={`pill ${!cat ? 'pill-on' : ''}`}>All</Link>
        {modeCats.map((c) => (
          <Link key={c} href={qs(sp, { category: c, subtype: undefined, amenities: undefined, mode: undefined })} className={`pill ${cat === c ? 'pill-on' : ''}`} aria-current={cat === c ? 'page' : undefined}>
            {CATEGORY_LABEL[c]}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <form action="/explore" className="card flex h-fit flex-col gap-4 p-4" aria-label="Filters">
          {cat ? <input type="hidden" name="category" value={cat} /> : null}
          {!cat && mode === 'settle' ? <input type="hidden" name="mode" value="settle" /> : null}
          <input type="hidden" name="view" value={view} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-q" className="label">Search</label>
            <input id="f-q" name="q" defaultValue={sp.q} className="input" placeholder="Try “2 bedroom Kilimani under 100k”" />
            <input type="hidden" name="nl" value="1" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-city" className="label">Destination</label>
            <select id="f-city" name="city" defaultValue={sp.city ?? ''} className="input">
              <option value="">Anywhere in Kenya</option>
              {cities.cities.filter((c) => c.isLive).map((c) => (
                <option key={c.slug} value={c.slug}>{c.name} ({c.listingCount})</option>
              ))}
            </select>
          </div>
          {cat ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-sub" className="label">Type</label>
              <select id="f-sub" name="subtype" defaultValue={sp.subtype ?? ''} className="input">
                <option value="">Any type</option>
                {meta.categories[cat].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          ) : null}
          {!cat || cat === 'stay' ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-budget" className="label">Budget</label>
              <select id="f-budget" name="budget" defaultValue={sp.budget ?? ''} className="input">
                <option value="">Any budget</option>
                <option value="budget">Budget</option>
                <option value="mid">Mid-range</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-level" className="label">Verification</label>
            <select id="f-level" name="minLevel" defaultValue={sp.minLevel ?? ''} className="input">
              <option value="">Any verified</option>
              <option value="2">Licensed or better</option>
              <option value="3">Visited by our team</option>
            </select>
          </div>
          {cat && AMENITY_FILTERS[cat] ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="label mb-1">Must have</legend>
              {AMENITY_FILTERS[cat].map((a) => (
                <label key={a} className="flex items-center gap-2 text-[14px]">
                  <input type="checkbox" name="amenity" value={a} defaultChecked={amen.has(a)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                  {AMENITY_LABEL[a]}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-sort" className="label">Sort by</label>
            <select id="f-sort" name="sort" defaultValue={sp.sort ?? 'relevance'} className="input">
              <option value="relevance">Best match</option>
              <option value="rating">Highest rated</option>
              <option value="price">Lowest price</option>
              <option value="newest">Newest</option>
            </select>
          </div>
          <button className="btn-dark" type="submit">Show results</button>
          <Link href="/explore" className="text-center text-[14px] font-bold text-muted">Clear filters</Link>
        </form>

        <div className="min-w-0">
          <div className="mb-4 flex justify-end gap-2" role="group" aria-label="View">
            <NearMe base={Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !['lat', 'lon', 'sort', 'page', 'view'].includes(k))) as Record<string, string>} />
            <Link href={qs(sp, { view: undefined })} className={`pill ${view === 'list' ? 'pill-on' : ''}`}>List</Link>
            <Link href={qs(sp, { view: 'map' })} className={`pill ${view === 'map' ? 'pill-on' : ''}`}>Map</Link>
          </div>
          {data.featured.length && page === 1 && view === 'list' ? (
            <section aria-label="Featured" className="mb-8">
              <p className="eyebrow mb-3">Featured · paid placement, still verified</p>
              <div className="grid gap-6 sm:grid-cols-2">
                {data.featured.map((l) => <ListingCard key={l.id} l={l} />)}
              </div>
            </section>
          ) : null}
          {data.results.length === 0 ? (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-line bg-panel p-5">
                <h2 className="text-lg font-semibold">Nothing matches everything{sp.q ? ` for “${sp.q}”` : ''} yet</h2>
                {data.didYouMean ? <p className="mt-1 text-[15px]">Did you mean <Link className="font-semibold text-brand underline" href={qs({}, { q: data.didYouMean, nl: '1' })}>{data.didYouMean}</Link>?</p> : null}
                <p className="mt-1 text-[14px] text-muted">We add verified businesses every week, and we look for the ones travellers ask for.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <TellUs query={sp.q || [cat ? CATEGORY_LABEL[cat] : null, sp.city].filter(Boolean).join(' in ') || 'this'} city={sp.city ?? u?.params.city} category={cat} />
                  <Link href="/recommend" className="btn-ghost">Know one? Recommend it</Link>
                </div>
              </div>
              {data.relaxed ? (
                <section aria-label="Close matches">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[15px] font-semibold">Without {data.relaxed.without}: {data.relaxed.total} verified</h2>
                    <Link className="text-[14px] font-semibold text-brand" href={`/explore?${new URLSearchParams(data.relaxed.params)}`}>See all</Link>
                  </div>
                  <div className="mt-3 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {data.relaxed.results.map((l) => <ListingCard key={l.id} l={l} />)}
                  </div>
                </section>
              ) : null}
            </div>
          ) : view === 'map' ? (
            <ExploreMap items={data.results.map((l) => ({ id: l.id, lat: l.lat, lon: l.lon, label: l.title, href: `/listing/${l.slug}`, sub: `${l.city} · ${l.subtype}` }))} />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {data.results.filter((l) => !featuredIds.has(l.id) || page > 1).map((l) => <ListingCard key={l.id} l={l} />)}
            </div>
          )}
          {view === 'list' && pages > 1 ? (
            <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-3">
              {page > 1 ? <Link className="pill" href={`${qs(sp, {})}&page=${page - 1}`}>Previous</Link> : null}
              <span className="text-[14px] text-muted">Page {page} of {pages}</span>
              {page < pages ? <Link className="pill" href={`${qs(sp, {})}&page=${page + 1}`}>Next</Link> : null}
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
