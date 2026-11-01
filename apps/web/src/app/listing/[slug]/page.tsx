import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/server-api';
import { AMENITY_LABEL, CATEGORY_SINGULAR, LEVEL_LABEL, type ListingDetail } from '@/lib/types';
import { daysSince, eventTime, price, shortDate } from '@/lib/format';
import { Media, SampleNote, Stars, VerifiedBadge } from '@/components/bits';
import { Icon } from '@/components/Icon';
import { SaveButton } from '@/components/SaveButton';
import { ContactPanel } from './ContactPanel';
import { AddToTrip } from './AddToTrip';
import { ListingMap } from './ListingMap';
import { ExperienceCard } from '@/components/ExperienceCard';

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
  if (!rows.length) return null;
  return (
    <section>
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

  return (
    <div className="container-k py-6">
      <Link href="/explore" className="inline-flex items-center gap-1 text-[14px] font-bold text-muted"><Icon name="back" size={16} /> All listings</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Media category={l.category} photoUrl={l.photos[0]?.url} alt={l.photos[0]?.alt} className="aspect-[16/9] rounded-[24px]" iconSize={72}>
            {!l.photos.length ? <span className="absolute bottom-3 left-4 text-[12px] font-semibold text-white/90">Photos coming from the business</span> : null}
          </Media>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <VerifiedBadge level={l.verificationLevel} />
            <span className="chip bg-soft text-muted">{CATEGORY_SINGULAR[l.category]} · {l.subtype}</span>
            {l.isSample ? <SampleNote /> : null}
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{l.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            <Stars rating={l.rating} count={l.reviewCount} />
            <span className="inline-flex items-center gap-1 text-muted"><Icon name="pin" size={16} />{l.city}{l.locationIsPrivate ? ' (exact address shared after you message)' : ''}</span>
            <Link href={`/b/${l.vendorSlug}`} className="text-muted underline-offset-2 hover:underline">by {l.vendorName}</Link>
          </div>
          <p className="mt-4 text-lg">{l.summary}</p>
          {l.description ? <p className="mt-3 leading-relaxed text-muted">{l.description}</p> : null}

          <section className="mt-6 flex gap-3 rounded-2xl bg-teal-soft p-4">
            <Icon name="shield" className="mt-0.5 text-teal" size={24} />
            <div className="text-[15px]">
              <strong className="text-teal">{LEVEL_LABEL[l.verificationLevel]}{l.verifiedAt ? ` · verified ${shortDate(l.verifiedAt)}` : ''}</strong>
              <p className="mt-0.5">{LEVEL_DETAIL[l.verificationLevel]} <Link href="/how-we-verify" className="font-bold underline">How we verify</Link></p>
              {confirmedDays != null ? <p className="mt-1 text-muted">Details confirmed by the business {confirmedDays === 0 ? 'today' : `${confirmedDays} days ago`}.</p> : null}
            </div>
          </section>

          <div className="mt-8 flex flex-col gap-8">
            <Facts l={l} />
            {l.amenities.length ? (
              <section>
                <h2 className="font-display text-xl font-extrabold">What’s included</h2>
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
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-extrabold">What travellers paid</h2>
                <Link href={`/safety/prices/add?listing=${l.slug}`} className="text-[14px] font-bold text-brand underline">I paid…</Link>
              </div>
              {l.paid ? (
                <>
                  <p className="mt-1 text-[14px] text-muted">From {l.paid.reports} traveller {l.paid.reports === 1 ? 'report' : 'reports'} in the last 12 months. Compare with the price the business lists.</p>
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
                <p className="mt-1 text-[14px] text-muted">No one has shared what they paid here yet. If you’ve used this business, your price helps the next traveller know the going rate.</p>
              )}
            </section>
            <section>
              <h2 className="font-display text-xl font-extrabold">Location</h2>
              <p className="mt-1 text-[14px] text-muted">{l.locationIsPrivate ? 'Approximate area only.' : 'Pin set by the business and checked by our team.'}</p>
              <div className="mt-3"><ListingMap lat={l.lat} lon={l.lon} label={l.title} /></div>
            </section>
            <section id="experiences" className="scroll-mt-24">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl font-extrabold">Traveller experiences</h2>
                <Stars rating={l.rating} count={l.reviewCount} />
              </div>
              {l.reviewCount > 0 ? (
                <p className="mt-1 text-[14px] text-muted">
                  {l.recommendAnswers > 0 ? <><strong className="text-ink">{Math.round((l.recommendYes / l.recommendAnswers) * 100)}% recommend</strong> · </> : null}
                  {l.reviewCount} {l.reviewCount === 1 ? 'experience' : 'experiences'}
                  {l.contactedCount > 0 ? ` · ${l.contactedCount} from travellers who contacted them through Karibu` : ''}
                  {l.reviewCount < 3 ? ' · an average shows from 3' : ''}
                </p>
              ) : (
                <p className="mt-1 text-[14px] text-muted">No experiences shared yet. Used this business? Your rating and what you paid help the next traveller.</p>
              )}
              <Link href={`/share/experience?listing=${l.slug}`} className="btn-primary mt-3"><Icon name="star" size={18} />Share your experience</Link>
              <div className="mt-4 flex flex-col gap-4">
                {l.reviews.map((r) => <ExperienceCard key={r.id} e={r} vendorName={l.vendorName} />)}
              </div>
            </section>
            <Link href={`/report?listing=${l.id}&title=${encodeURIComponent(l.title)}`} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-muted"><Icon name="flag" size={16} />Report wrong information or a problem</Link>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card flex flex-col gap-4 p-5">
            <div>
              <div className="text-2xl font-extrabold">{price(l.currency, l.priceFrom, l.priceTo)}</div>
              <div className="text-[14px] text-muted">{l.priceUnit} · agree the final price directly with the business</div>
              {l.paid && l.paid.reports >= 2 ? (
                <div className="mt-2 text-[14px]"><Icon name="tag" size={14} className="mr-1 inline text-teal" />Travellers paid {l.paid.currency} {l.paid.minAmount.toLocaleString()}–{l.paid.maxAmount.toLocaleString()} ({l.paid.reports} reports)</div>
              ) : null}
            </div>
            <ContactPanel listing={{ id: l.id, title: l.title, phone: l.phone, email: l.email, dates: l.dates.map((d) => d.startsAt.slice(0, 10)) }} />
            <div className="grid grid-cols-2 gap-2">
              <SaveButton listingId={l.id} title={l.title} variant="button" />
              <AddToTrip listingId={l.id} />
            </div>
            <p className="text-[12px] text-muted">Karibu does not take payments. Never pay a personal mobile money number you can’t verify.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
