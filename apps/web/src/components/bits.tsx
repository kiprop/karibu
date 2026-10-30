import { CATEGORY_ICON, Icon } from './Icon';
import { LEVEL_LABEL, type Category } from '@/lib/types';

export function Stars({ rating, count, size = 14 }: { rating: number | null; count: number; size?: number }) {
  if (rating == null) {
    return <span className="text-[13px] font-semibold text-muted">{count > 0 ? `${count} review${count === 1 ? '' : 's'}` : 'New on Karibu'}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold" aria-label={`Rated ${rating} out of 5 from ${count} reviews`}>
      <span className="inline-flex text-star" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24" className={rating >= i - 0.25 ? '' : 'opacity-25'} fill="currentColor">
            <path d="M12 2.5l2.9 6.2 6.6.6-5 4.5 1.5 6.6L12 17l-6 3.4 1.5-6.6-5-4.5 6.6-.6z" />
          </svg>
        ))}
      </span>
      {rating.toFixed(1)} <span className="font-semibold text-muted">({count})</span>
    </span>
  );
}

export function VerifiedBadge({ level, onMedia = false }: { level: number; onMedia?: boolean }) {
  if (!level) return null;
  return (
    <span className={`chip ${onMedia ? 'bg-white/95 text-[#0A6B60]' : 'bg-teal-soft text-teal'}`} title="Checked by the Karibu team">
      <Icon name="check" size={12} strokeWidth={3} />
      {LEVEL_LABEL[level] ?? 'Verified'}
    </span>
  );
}

/** Stand-in artwork until vendors upload photos: a colour-coded tile per category. */
export function Media({ category, photoUrl, alt, className = '', iconSize = 44, children }: { category: Category; photoUrl?: string | null; alt?: string; className?: string; iconSize?: number; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden ${photoUrl ? 'bg-soft' : `media-${category}`} ${className}`}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={alt ?? ''} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <>
          <span aria-hidden="true" className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/20" />
          <span aria-hidden="true" className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-white/10" />
          <Icon name={CATEGORY_ICON[category]} size={iconSize} strokeWidth={1.6} className="absolute right-4 top-4 text-white/95" />
        </>
      )}
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/25" />
      {children}
    </div>
  );
}

export function SampleNote() {
  return <span className="chip bg-amber-soft text-amber">Sample listing</span>;
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-6">
      <h3 className="font-display text-xl font-extrabold">{title}</h3>
      {body ? <p className="text-muted">{body}</p> : null}
      {children}
    </div>
  );
}
