import Link from 'next/link';

/**
 * EI Karibu lockup: the Enkop Intelligence logo next to the Karibu wordmark.
 * ei-logo.png is the original; ei-logo-dark.png is the same file with the near-black recoloured for dark mode.
 */
export function BrandLockup({ size = 'md', href = '/' }: { size?: 'md' | 'lg'; href?: string | null }) {
  const h = size === 'lg' ? 'h-11' : 'h-9';
  const inner = (
    <span className="flex items-center gap-2.5">
      <picture className="shrink-0">
        <source srcSet="/brand/ei-logo-dark.png" media="(prefers-color-scheme: dark)" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ei-logo.png" alt="" width={512} height={512} className={`${h} w-auto`} />
      </picture>
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
