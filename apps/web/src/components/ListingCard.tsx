import Link from 'next/link';
import type { ListingCard as L } from '@/lib/types';
import { CATEGORY_SINGULAR } from '@/lib/types';
import { price, km } from '@/lib/format';
import { Media, Stars, VerifiedBadge } from './bits';
import { SaveButton } from './SaveButton';

export function ListingCard({ l, compact = false }: { l: L; compact?: boolean }) {
  return (
    <article className={`group relative ${compact ? 'w-[240px] shrink-0 snap-start' : ''}`}>
      <Link href={`/listing/${l.slug}`} className="block focus-visible:outline-none">
        <Media category={l.category} photoUrl={l.photoUrl} alt={l.title} className="aspect-[4/3] rounded-2xl">
          <span className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
            <VerifiedBadge level={l.verificationLevel} onMedia />
          </span>
          {l.isFeatured ? <span className="chip absolute right-3 top-3 bg-star text-[#3A2600]">Featured</span> : null}
        </Media>
        <div className="mt-2.5 flex flex-col gap-0.5">
          <span className="text-[12px] font-bold uppercase tracking-wide text-muted">
            {CATEGORY_SINGULAR[l.category]} · {l.subtype} · {l.city}
          </span>
          <h3 className="text-[16px] font-extrabold leading-snug group-hover:underline">{l.title}</h3>
          <Stars rating={l.rating} count={l.reviewCount} />
          <span className="text-[14px] font-bold">
            {price(l.currency, l.priceFrom, l.priceTo)} <span className="font-medium text-muted">{l.priceUnit}</span>
          </span>
          {l.distanceM != null ? <span className="text-[13px] text-muted">{km(l.distanceM)} away</span> : null}
        </div>
      </Link>
      <SaveButton listingId={l.id} title={l.title} />
    </article>
  );
}
