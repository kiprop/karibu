'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * An image that quietly steps aside if it fails to load, so whatever is drawn underneath shows instead.
 * Also catches images that failed before the page became interactive, which onError alone misses.
 * `children` (a photo credit, say) only shows while the photo is actually showing.
 */
export function Photo({ src, alt, className = '', eager = false, children }: { src: string; alt: string; className?: string; eager?: boolean; children?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const i = ref.current;
    if (i && i.complete && i.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (failed) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src} alt={alt} className={`${className} text-transparent`} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
      {children}
    </>
  );
}
