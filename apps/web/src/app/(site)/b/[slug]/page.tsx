import { Centered, Page, SideCard } from '@/components/Page';
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
      <Centered crumbs={[{ label: 'Explore', href: '/explore' }, { label: 'Business not verified' }]}>
        <div className="card p-6">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger"><Icon name="sos" /></span>
          <h1 className="mt-4 area-title">Not verified on Karibu</h1>
          <p className="mt-2 text-[16px]">{msg}</p>
          <p className="mt-3 text-muted">If someone sent you this link to prove they’re verified, be careful. Never pay a personal mobile money number you can’t check.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/safety/check" className="btn-primary">Check an operator</Link>
            <Link href="/report?category=scam" className="btn-outline">Report it</Link>
          </div>
        </div>
      </Centered>
    );
  }
  const b = data.business;
  return (
    <Page crumbs={[{ label: 'Explore', href: '/explore' }, { label: b.name }]} eyebrow={b.countryName} title={b.name}
      desc={
        <span className="flex flex-wrap items-center gap-2">
          <VerifiedBadge level={b.verificationLevel} />
          <Stars rating={b.rating} count={b.reviews} />
          {b.recommendAnswers ? <span className="text-[14px] font-semibold text-ink">{Math.round((b.recommendYes / b.recommendAnswers) * 100)}% recommend</span> : null}
        </span>
      }
      aside={<>
        <SideCard title={<span className="flex items-center gap-2 text-teal"><Icon name="shield" size={17} />{LEVEL_LABEL[b.verificationLevel]}</span>}>
          <ul className="flex flex-col gap-1 text-muted">
            <li>Verified {shortDate(b.verifiedAt)}</li>
            <li>On Karibu since {shortDate(b.since)}</li>
            <li>{b.whatsappVerified ? 'WhatsApp confirmed' : 'WhatsApp not confirmed'}</li>
            <li>{b.emailVerified ? 'Email confirmed' : 'Email not confirmed'}</li>
          </ul>
          <Link href="/how-we-verify" className="mt-2 inline-block font-semibold text-brand">How we verify</Link>
        </SideCard>
        <SideCard title="Paying safely" tone="warn">
          <p className="text-muted">Contact {b.name} through a listing to get a Karibu reference code. Karibu never takes payments; agree prices directly and never pay a personal number you can’t check.</p>
        </SideCard>
      </>}>
      {b.about || b.website ? (
        <section className="card p-5">
          {b.about ? <p className="max-w-[68ch] whitespace-pre-line text-[15.5px] leading-relaxed">{b.about}</p> : null}
          {b.website ? <p className="mt-2"><a href={b.website} target="_blank" rel="noopener nofollow" className="font-semibold text-brand hover:underline">{new URL(b.website).hostname}</a></p> : null}
        </section>
      ) : null}
      <section className="flex flex-col gap-4">
        <h2 className="section-title">Listings</h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.listings.map((l) => <ListingCardView key={l.id} l={l} />)}
        </div>
      </section>
    </Page>
  );
}
