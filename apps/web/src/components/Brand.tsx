import Link from 'next/link';

/**
 * EI Karibu lockup: the Enkop Intelligence mark next to the Karibu wordmark.
 * The mark is a file (/brand/ei-mark.svg) so the real Enkop logo can be dropped in without code changes.
 */
export function BrandLockup({ size = 'md', href = '/' }: { size?: 'md' | 'lg'; href?: string | null }) {
  const h = size === 'lg' ? 'h-11' : 'h-9';
  const inner = (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ei-mark.svg" alt="" className={`${h} w-auto rounded-[10px]`} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-extrabold tracking-tight ${size === 'lg' ? 'text-[28px]' : 'text-[22px]'}`}>
          <span className="sr-only">EI </span>Karibu
        </span>
        <span className="mt-0.5 hidden text-[10px] font-bold uppercase tracking-[0.14em] text-muted sm:block">by Enkop Intelligence</span>
      </span>
    </span>
  );
  return href ? <Link href={href} aria-label="EI Karibu home">{inner}</Link> : inner;
}
