import Link from 'next/link';
import type { Experience } from '@/lib/types';
import { shortDate } from '@/lib/format';
import { Icon } from './Icon';
import { HelpfulButton } from './HelpfulButton';
import { TRAVELLER_TYPE_LABEL } from '@/lib/types';

/** One traveller experience. Used on listing pages, business pages and the Share feed. */
export function ExperienceCard({ e, vendorName, showListing = false, helpful = false }: { e: Experience; vendorName?: string; showListing?: boolean; helpful?: boolean }) {
  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <strong>{e.author}</strong>
          {e.contacted ? (
            <span className="chip bg-teal-soft text-teal" title="This traveller contacted the business through Karibu">
              <Icon name="check" size={12} strokeWidth={3} />Contacted via Karibu
            </span>
          ) : null}
        </span>
        <span className="text-[13px] text-muted">
          {e.travellerType ? `${TRAVELLER_TYPE_LABEL[e.travellerType] ?? e.travellerType} · ` : ''}{e.visitedOn ? `Visited ${shortDate(e.visitedOn)}` : shortDate(e.createdAt)}
        </span>
      </div>
      {showListing && e.listingSlug ? (
        <Link href={`/listing/${e.listingSlug}`} className="mt-1 block text-[14px] font-bold text-brand underline">
          {e.listingTitle}{e.city ? ` · ${e.city}` : ''}
        </Link>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex text-[15px] leading-none text-star" role="img" aria-label={`${e.rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= e.rating ? '' : 'opacity-25'}>★</span>)}
        </span>
        {e.recommend === true ? <span className="chip bg-teal-soft text-teal">Recommends</span> : null}
        {e.recommend === false ? <span className="chip bg-danger-soft text-danger">Doesn’t recommend</span> : null}
        {e.paid ? (
          <span className="chip">
            <Icon name="tag" size={12} />Paid {e.paid.currency} {e.paid.amount.toLocaleString()}{e.paid.unit ? ` ${e.paid.unit}` : ''} for {e.paid.item}
          </span>
        ) : null}
      </div>
      {e.body ? <p className="mt-2 whitespace-pre-line">{e.body}</p> : null}
      {e.vendorReply ? (
        <p className="mt-3 rounded-xl bg-soft p-3 text-[14px]"><strong>Reply from {vendorName ?? 'the business'}:</strong> {e.vendorReply}</p>
      ) : null}
      {helpful ? <div className="mt-3"><HelpfulButton id={e.id} count={e.helpful ?? 0} /></div> : null}
    </article>
  );
}
