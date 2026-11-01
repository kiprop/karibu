import { Breadcrumbs } from '@/components/Breadcrumbs';
import Link from 'next/link';
import { api, ApiError } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { Stars, VerifiedBadge } from '@/components/bits';
import { ListingCard as ListingCardView } from '@/components/ListingCard';
import { shortDate } from '@/lib/format';
import { LEVEL_LABEL, type ListingCard } from '@/lib/types';

type Business = {
  name: string; slug: string; about: string | null; website: string | null; country: string; countryName: string; verificationLevel: number;
  verifiedAt: string; since: string; emailVerified: boolean; whatsappVerified: boolean; reviews: number; rating: number | null; recommendAnswers: number; recommendYes: number;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { business } = await api<{ business: Business }>(`/businesses/${slug}`, { revalidate: 0 });
    return { title: `${business.name} · verified on Karibu` };
  } catch {
    return { title: 'Business not verified' };
  }
}

/** A business's public, shareable page. It's live: if verification lapses, the page says so. */
export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data: { business: Business; listings: ListingCard[] };
  try {
    data = await api(`/businesses/${slug}`, { revalidate: 0 });
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'We couldn’t load this business.';
    return (
      <div className="container-k max-w-xl py-10">
        <Breadcrumbs className="mb-6" items={[{ label: 'Explore', href: '/explore' }, { label: 'Business not verified' }]} />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger"><Icon name="sos" /></span>
        <h1 className="mt-4 font-display text-3xl font-extrabold">Not verified on Karibu</h1>
        <p className="mt-2 text-lg">{msg}</p>
        <p className="mt-4 text-muted">If someone sent you this link to prove they’re verified, be careful. Never pay a personal mobile money number you can’t check.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/safety/check" className="btn-primary">Check an operator</Link>
          <Link href="/report?category=scam" className="btn-outline">Report it</Link>
        </div>
      </div>
    );
  }
  const b = data.business;
  return (
    <div className="container-k py-6">
      <Breadcrumbs className="mb-4" items={[{ label: 'Explore', href: '/explore' }, { label: b.countryName, href: `/explore?country=${b.country}` }, { label: b.name }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{b.countryName}</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold">{b.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <VerifiedBadge level={b.verificationLevel} />
            <Stars rating={b.rating} count={b.reviews} />
            {b.recommendAnswers ? <span className="text-[14px] font-bold">{Math.round((b.recommendYes / b.recommendAnswers) * 100)}% recommend</span> : null}
          </div>
        </div>
        <div className="rounded-2xl bg-teal-soft p-4 text-[14px] text-teal">
          <div className="flex items-center gap-2 font-extrabold"><Icon name="shield" size={18} />{LEVEL_LABEL[b.verificationLevel]}</div>
          <div className="mt-1">Verified {shortDate(b.verifiedAt)} · on Karibu since {shortDate(b.since)}</div>
          <div className="mt-1">{b.whatsappVerified ? 'WhatsApp confirmed' : 'WhatsApp not confirmed'} · {b.emailVerified ? 'email confirmed' : 'email not confirmed'}</div>
          <Link href="/how-we-verify" className="mt-1 inline-block font-bold underline">How we verify</Link>
        </div>
      </div>
      {b.about ? <p className="mt-6 max-w-3xl whitespace-pre-line text-lg">{b.about}</p> : null}
      {b.website ? <p className="mt-2"><a href={b.website} target="_blank" rel="noopener nofollow" className="font-bold text-brand underline">{new URL(b.website).hostname}</a></p> : null}
      <h2 className="mt-10 font-display text-2xl font-extrabold">Listings</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.listings.map((l) => <ListingCardView key={l.id} l={l} />)}
      </div>
      <p className="mt-10 text-[14px] text-muted">
        Contact {b.name} through a listing to get a Karibu reference code. Karibu never takes payments; agree prices directly and never pay a personal number you can’t check.
      </p>
    </div>
  );
}
