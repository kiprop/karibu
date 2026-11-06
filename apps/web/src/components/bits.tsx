import { Icon } from './Icon';
import { Scene } from './Scene';
import { Photo } from './Photo';
import { PLACE_PHOTOS, placePhotoPage, placePhotoUrl } from '@/lib/places';
import { LEVEL_LABEL, type Category } from '@/lib/types';

export function Stars({ rating, count, size = 14 }: { rating: number | null; count: number; size?: number }) {
  if (rating == null) {
    return <span className="text-[13px] font-semibold text-muted">{count > 0 ? `${count} experience${count === 1 ? '' : 's'}` : 'New on Karibu'}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold" aria-label={`Rated ${rating} out of 5 from ${count} ${count === 1 ? 'experience' : 'experiences'}`}>
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

/** A listing's picture: the business's own photo, or a drawn scene for its category until they add one. */
export function Media({ category, photoUrl, alt, className = '', eager = false, children }: { category: Category; photoUrl?: string | null; alt?: string; className?: string; iconSize?: number; eager?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-soft ${className}`}>
      <Scene category={category} className="absolute inset-0 h-full w-full" />
      {photoUrl ? <Photo src={photoUrl} alt={alt ?? ''} eager={eager} className="absolute inset-0 h-full w-full object-cover" /> : null}
      {children ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" /> : null}
      {children}
    </div>
  );
}

/** A destination photo with its credit, or the drawn scene when we don't have one for that place. */
export function PlaceImage({ slug, fallback = 'safari', className = '', credit = true, eager = false, width = 1280 }: { slug?: string | null; fallback?: Category; className?: string; credit?: boolean; eager?: boolean; width?: number }) {
  const p = slug ? PLACE_PHOTOS[slug] : undefined;
  return (
    <div className={`relative overflow-hidden bg-soft ${className}`}>
      <Scene category={fallback} className="absolute inset-0 h-full w-full" />
      {p ? (
        <Photo src={placePhotoUrl(p, width)} alt={p.alt} eager={eager} className="absolute inset-0 h-full w-full object-cover">
          {credit ? (
            <a href={placePhotoPage(p)} target="_blank" rel="noopener" className="absolute bottom-1.5 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10.5px] text-white/90 hover:bg-black/70">
              Photo: {p.author}, {p.licence}
            </a>
          ) : null}
        </Photo>
      ) : null}
    </div>
  );
}

export function SampleNote() {
  return <span className="chip bg-amber-soft text-amber">Sample listing</span>;
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-6">
      <h3 className="section-title">{title}</h3>
      {body ? <p className="text-muted">{body}</p> : null}
      {children}
    </div>
  );
}

/** The confirmation shown in place of a form once it's sent: same look on every form. */
export function Done({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="card flex gap-4 p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal text-white"><Icon name="check" size={20} strokeWidth={3} /></span>
      <div className="flex min-w-0 flex-col gap-1.5 text-[14.5px]">
        <h2 className="section-title">{title}</h2>
        <div className="text-muted [&_a]:font-semibold [&_a]:text-brand">{children}</div>
      </div>
    </div>
  );
}
