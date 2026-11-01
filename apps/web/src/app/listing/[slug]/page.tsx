import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/server-api';
import { AMENITY_LABEL, CATEGORY_LABEL, CATEGORY_SINGULAR, LEVEL_LABEL, isSettle, type ListingCard as Card, type ListingDetail } from '@/lib/types';
import { daysSince, eventTime, price, shortDate } from '@/lib/format';
import { SampleNote, Stars, VerifiedBadge } from '@/components/bits';
import { ListingCard } from '@/components/ListingCard';
import { Icon } from '@/components/Icon';
import { SaveButton } from '@/components/SaveButton';
import { ContactPanel } from './ContactPanel';
import { AddToTrip } from './AddToTrip';
import { ListingMap } from './ListingMap';
import { ExperiencesPanel } from './ExperiencesPanel';
import { Gallery } from './Gallery';
import { ShareLink } from './ShareLink';

const LEVEL_DETAIL: Record<number, string> = {
  1: 'We confirmed the phone number, a WhatsApp reply and the owner’s identity.',
  2: 'We also checked the licence, permit or insurance this kind of business needs.',
  3: 'Our team also visited or tested the service in person.',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Facts({ l }: { l: ListingDetail }) {
  const a = l.attributes ?? {};
  const rows: [string, string][] = [];
  if (l.category === 'stay') {
    if (a.setting) rows.push(['Setting', a.setting]);
    if (l.budgetTier) rows.push(['Budget', { budget: 'Budget', mid: 'Mid-range', premium: 'Premium' }[l.budgetTier]]);
    if (a.hotWaterHours) rows.push(['Hot water', a.hotWaterHours]);
    if (a.wifiMbps) rows.push(['Wi-Fi (measured)', `${a.wifiMbps} Mbps`]);
    if (a.nearestGate) rows.push(['Nearest park gate', a.nearestGate]);
    if (a.rooms) rows.push(['Rooms', String(a.rooms)]);
  }
  if (l.category === 'safari') {
    if (a.park) rows.push(['Park or reserve', a.park]);
    if (a.format) rows.push(['Vehicle use', a.format === 'private' ? 'Private' : 'Shared']);
    if (a.vehicle) rows.push(['Vehicle', a.vehicle]);
    if (a.pickup) rows.push(['Pickup', a.pickup]);
    if (a.durationHours) rows.push(['Duration', a.durationHours >= 24 ? `${Math.round(a.durationHours / 24)} days` : `${a.durationHours} hours`]);
    if (a.guideLanguages?.length) rows.push(['Guide languages', a.guideLanguages.join(', ')]);
    if (a.bestMonths?.length) rows.push(['Best months', a.bestMonths.map((m: number) => MONTHS[m - 1]).join(', ')]);
    rows.push(['Park fees', l.amenities.includes('park_fees_included') ? 'Included' : 'Not included, paid at the gate']);
  }
  if (l.category === 'transport') {
    if (a.vehicle) rows.push(['Vehicle', `${a.vehicle}${a.seats ? `, ${a.seats} seats` : ''}`]);
    if (a.baggageKg) rows.push(['Baggage limit', `${a.baggageKg} kg, soft bags`]);
  }
  if (l.category === 'guide') {
    if (a.languages?.length) rows.push(['Languages', a.languages.join(', ')]);
    if (a.maxGroup) rows.push(['Group size', `Up to ${a.maxGroup}`]);
    if (a.durationHours) rows.push(['Duration', `${a.durationHours} hours`]);
    if (a.accreditation) rows.push(['Accreditation', a.accreditation]);
  }
  if (l.category === 'experience') {
    if (a.durationHours) rows.push(['Duration', `${a.durationHours} hours`]);
    if (a.minAge != null) rows.push(['Minimum age', String(a.minAge)]);
    if (a.fitness) rows.push(['Fitness', a.fitness]);
    if (a.permitNeeded) rows.push(['Permit', 'Needed']);
  }
  if (l.category === 'home') {
    if (a.bedrooms != null) rows.push(['Bedrooms', String(a.bedrooms)]);
    if (a.bathrooms != null) rows.push(['Bathrooms', String(a.bathrooms)]);
    if (a.furnished) rows.push(['Furnishing', { furnished: 'Furnished', semi: 'Partly furnished', unfurnished: 'Unfurnished' }[a.furnished as string] ?? a.furnished]);
    if (a.neighbourhood) rows.push(['Neighbourhood', a.neighbourhood]);
    if (a.minLeaseMonths) rows.push(['Minimum lease', `${a.minLeaseMonths} months`]);
    if (a.depositMonths != null) rows.push(['Deposit', `${a.depositMonths} month${a.depositMonths === 1 ? '' : 's'} of rent`]);
    if (a.utilitiesIncluded != null) rows.push(['Utilities', a.utilitiesIncluded ? 'Included in rent' : 'Paid separately']);
    if (a.availableFrom) rows.push(['Available from', shortDate(a.availableFrom)]);
  }
  if (l.category === 'furniture') {
    if (a.scale) rows.push(['Business', { workshop: 'Workshop or fundi', shop: 'Shop', chain: 'Store chain' }[a.scale as string] ?? a.scale]);
    if (a.sells) rows.push(['Sells', { new: 'New', used: 'Second-hand', both: 'New and second-hand' }[a.sells as string] ?? a.sells]);
    if (a.madeToOrder != null) rows.push(['Made to order', a.madeToOrder ? 'Yes' : 'No']);
    if (a.leadTimeDays != null) rows.push(['Typical lead time', a.leadTimeDays <= 1 ? 'Next day' : `${a.leadTimeDays} days`]);
    if (a.warrantyMonths) rows.push(['Warranty', `${a.warrantyMonths} months`]);
  }
  if (l.category === 'home_services') {
    if (a.serviceArea) rows.push(['Areas covered', a.serviceArea]);
    if (a.calloutFee != null) rows.push(['Call-out fee', price(l.currency, a.calloutFee, a.calloutFee)]);
    if (a.staffVetted) rows.push(['Staff', 'ID-checked']);
    if (a.insured) rows.push(['Insurance', 'Insured']);
    if (a.sameDay) rows.push(['Same-day jobs', 'Yes']);
    if (a.hours) rows.push(['Hours', a.hours]);
  }
  if (l.category === 'utilities') {
    if (a.coverage) rows.push(['Coverage', a.coverage]);
    if (a.speedMbps) rows.push(['Top speed', `${a.speedMbps} Mbps`]);
    if (a.installDays != null) rows.push(['Installation', `${a.installDays} day${a.installDays === 1 ? '' : 's'}`]);
    if (a.contract) rows.push(['Contract', a.contract]);
  }
  if (l.category === 'grooming') {
    if (a.hairTypes?.length) rows.push(['Hair types', a.hairTypes.map((h: string) => ({ afro: 'Afro', curly: 'Curly', straight: 'Straight', all: 'All types' })[h] ?? h).join(', ')]);
    if (a.services?.length) rows.push(['Services', a.services.join(', ')]);
    if (a.hours) rows.push(['Hours', a.hours]);
  }
  if (!rows.length) return null;
  return (
    <section id="facts" className="scroll-mt-28">
      <h2 className="font-display text-xl font-extrabold">Key facts</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line py-2 text-[15px]">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>
      {a.routes?.length ? (
        <div className="mt-4">
          <h3 className="font-bold">Guide prices by route</h3>
          <ul className="mt-2 flex flex-col gap-1 text-[15px]">
            {a.routes.map((r: any) => (
              <li key={r.from + r.to} className="flex justify-between border-b border-line py-1.5">
                <span>{r.from} to {r.to}</span>
                <span className="font-semibold">{price(l.currency, r.priceFrom, r.priceTo)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { listing } = await api<{ listing: ListingDetail }>(`/listings/${slug}`, { revalidate: 0 });
    return { title: listing.title, description: listing.summary };
  } catch {
    return { title: 'Listing' };
  }
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let listing: ListingDetail;
  try {
    ({ listing } = await api<{ listing: ListingDetail }>(`/listings/${slug}`, { revalidate: 0 }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const l = listing;
  const confirmedDays = daysSince(l.lastConfirmedAt);
  const settle = isSettle(l.category);
  const who = settle ? 'people' : 'travellers';
  const { listings: similar } = await api<{ listings: Card[] }>(`/listings/${l.slug}/similar`, { revalidate: 0 }).catch(() => ({ listings: [] as Card[] }));
  const pct = l.recommendAnswers ? Math.round((l.recommendYes / l.recommendAnswers) * 100) : null;
  const sections = [
    ['overview', 'Overview'], ['facts', 'Key facts'], ['paid', 'What people paid'], ['location', 'Location'], ['experiences', `Experiences (${l.reviewCount})`],
  ];

  return (
    <div className="container-k py-5">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <Link href={settle ? '/settle' : '/explore'} className="hover:underline">{settle ? 'Settle in' : 'Explore'}</Link><span aria-hidden="true">›</span>
        <Link href={`/explore?city=${l.citySlug}`} className="hover:underline">{l.city}</Link><span aria-hidden="true">›</span>
        <Link href={`/explore?city=${l.citySlug}&category=${l.category}`} className="hover:underline">{CATEGORY_LABEL[l.category]}</Link><span aria-hidden="true">›</span>
        <span className="truncate text-ink">{l.title}</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{l.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px]">
            <a href="#experiences" className="hover:underline"><Stars rating={l.rating} count={l.reviewCount} size={16} /></a>
            {pct != null && l.recommendAnswers >= 2 ? <span className="font-bold text-teal">{pct}% recommend</span> : null}
            <VerifiedBadge level={l.verificationLevel} />
            {l.isSample ? <SampleNote /> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
            <span>{CATEGORY_SINGULAR[l.category]} · {l.subtype}</span>
            <span className="inline-flex items-center gap-1"><Icon name="pin" size={15} />{l.city}{l.locationIsPrivate ? ' (exact address after you message)' : ''}</span>
            <Link href={`/b/${l.vendorSlug}`} className="font-semibold text-ink underline-offset-2 hover:underline">by {l.vendorName}</Link>
          </div>
        </div>
        <div className="flex gap-2">
          <ShareLink title={l.title} />
          <SaveButton listingId={l.id} title={l.title} variant="button" />
        </div>
      </header>

      <div className="mt-4"><Gallery photos={l.photos} category={l.category} title={l.title} /></div>

      <nav aria-label="On this page" className="sticky top-16 z-30 -mx-4 mt-4 overflow-x-auto border-b border-line bg-ground/95 px-4 backdrop-blur sm:mx-0 sm:px-0">
        <ul className="flex gap-1 whitespace-nowrap text-[14px] font-bold">
          {sections.map(([id, label]) => <li key={id}><a href={`#${id}`} className="inline-block border-b-2 border-transparent px-3 py-3 text-muted hover:border-ink hover:text-ink">{label}</a></li>)}
        </ul>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section id="overview" className="scroll-mt-28">
            <p className="text-lg">{l.summary}</p>
            {l.description ? <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{l.description}</p> : null}
            {l.highlights.length ? (
              <div className="mt-6">
                <h2 className="font-display text-xl font-extrabold">Why {who} like it</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {l.highlights.map((h) => (
                    <figure key={h.id} className="rounded-2xl bg-soft p-4">
                      <blockquote className="text-[15px]">“{h.body.length > 180 ? `${h.body.slice(0, 177).trimEnd()}…` : h.body}”</blockquote>
                      <figcaption className="mt-2 text-[13px] font-bold text-muted">{h.author}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-6 flex gap-3 rounded-2xl bg-teal-soft p-4">
              <Icon name="shield" className="mt-0.5 shrink-0 text-teal" size={24} />
              <div className="text-[15px]">
                <strong className="text-teal">{LEVEL_LABEL[l.verificationLevel]}{l.verifiedAt ? ` · verified ${shortDate(l.verifiedAt)}` : ''}</strong>
                <p className="mt-0.5">{LEVEL_DETAIL[l.verificationLevel]} <Link href="/how-we-verify" className="font-bold underline">How we verify</Link></p>
                {confirmedDays != null ? <p className="mt-1 text-muted">Details confirmed by the business {confirmedDays === 0 ? 'today' : `${confirmedDays} days ago`}.</p> : null}
              </div>
            </div>
          </section>

          <Facts l={l} />
          {l.amenities.length ? (
            <section>
              <h2 className="font-display text-xl font-extrabold">{settle ? 'Good to know' : 'What’s included'}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {l.amenities.map((a) => (
                  <li key={a} className="chip bg-soft px-3 py-1 text-[13px] text-ink"><Icon name="check" size={13} strokeWidth={3} className="text-teal" />{AMENITY_LABEL[a] ?? a}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {l.dates.length ? (
            <section>
              <h2 className="font-display text-xl font-extrabold">Upcoming dates</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {l.dates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
                    <span className="font-semibold">{eventTime(d.startsAt)}</span>
                    {d.confirmed ? <span className="chip bg-teal-soft text-teal">Confirmed by organiser</span> : <span className="chip bg-amber-soft text-amber">Not yet confirmed</span>}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="paid" className="scroll-mt-28">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-extrabold">What people paid</h2>
              <Link href={`/safety/prices/add?listing=${l.slug}`} className="text-[14px] font-bold text-brand underline">I paid…</Link>
            </div>
            {l.paid ? (
              <>
                <p className="mt-1 text-[14px] text-muted">
                  {l.paid.reports} {l.paid.reports === 1 ? 'report' : 'reports'} in the last 12 months
                  {l.paid.reports >= 2 ? `, from ${l.paid.currency} ${l.paid.minAmount.toLocaleString()} to ${l.paid.maxAmount.toLocaleString()}` : ''}. The business lists {price(l.currency, l.priceFrom, l.priceTo)} {l.priceUnit}.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {l.paid.latest.map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                      <span><strong>{p.item}</strong>{p.unit ? <span className="text-muted"> · {p.unit}</span> : null}<span className="block text-[12px] text-muted">paid {shortDate(p.paidOn)}</span></span>
                      <span className="font-extrabold tabular-nums">{l.paid!.currency} {p.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-[14px] text-muted">No one has shared what they paid here yet. If you’ve used this business, your price helps the next person know the going rate. No account needed.</p>
            )}
          </section>

          <section id="location" className="scroll-mt-28">
            <h2 className="font-display text-xl font-extrabold">Location</h2>
            <p className="mt-1 text-[14px] text-muted">{l.locationIsPrivate ? 'Approximate area only. The exact address is shared after you message.' : 'Pin set by the business and checked by our team.'}</p>
            <div className="mt-3"><ListingMap lat={l.lat} lon={l.lon} label={l.title} /></div>
          </section>

          <ExperiencesPanel
            slug={l.slug} vendorName={l.vendorName} rating={l.rating} count={l.reviewCount} recommendYes={l.recommendYes} recommendAnswers={l.recommendAnswers}
            contactedCount={l.contactedCount} breakdown={l.ratingBreakdown} travellerTypes={l.travellerTypes} mentions={l.mentions} initial={l.reviews} settle={settle}
          />

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line p-5">
            <div>
              <p className="eyebrow">About the business</p>
              <p className="mt-1 text-lg font-extrabold">{l.vendorName}</p>
              <p className="text-[14px] text-muted">{LEVEL_LABEL[l.verificationLevel]}{l.verifiedAt ? ` since ${shortDate(l.verifiedAt)}` : ''}</p>
            </div>
            <Link href={`/b/${l.vendorSlug}`} className="btn-outline">See all their listings</Link>
          </section>

          <Link href={`/report?listing=${l.id}&title=${encodeURIComponent(l.title)}`} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-muted"><Icon name="flag" size={16} />Report wrong information or a problem</Link>
        </div>

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="card flex flex-col gap-4 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
            <div>
              <div className="text-[13px] text-muted">From</div>
              <div className="text-2xl font-extrabold">{price(l.currency, l.priceFrom, l.priceTo)}</div>
              <div className="text-[14px] text-muted">{l.priceUnit} · agree the final price directly with the business</div>
              {l.paid && l.paid.reports >= 2 ? (
                <a href="#paid" className="mt-2 block text-[14px] hover:underline"><Icon name="tag" size={14} className="mr-1 inline text-teal" />People paid {l.paid.currency} {l.paid.minAmount.toLocaleString()}–{l.paid.maxAmount.toLocaleString()} ({l.paid.reports} reports)</a>
              ) : null}
            </div>
            <ContactPanel listing={{ id: l.id, title: l.title, phone: l.phone, email: l.email, dates: l.dates.map((d) => d.startsAt.slice(0, 10)) }} />
            <AddToTrip listingId={l.id} />
            <p className="text-[12px] text-muted">Karibu does not take payments. Never pay a personal mobile money number you can’t verify.</p>
          </div>
        </aside>
      </div>

      {similar.length ? (
        <section className="mt-14">
          <h2 className="font-display text-2xl font-extrabold">You might also like</h2>
          <div className="mt-4 flex snap-x gap-4 overflow-x-auto pb-2">
            {similar.map((s) => <div key={s.id} className="w-[270px] shrink-0 snap-start"><ListingCard l={s} /></div>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
