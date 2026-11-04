'use client';

import { useEffect, useRef, useState } from 'react';
import { Media } from '@/components/bits';
import { Icon } from '@/components/Icon';
import type { Category } from '@/lib/types';

/** Mosaic of up to five photos with a full-screen viewer, or the category tile when there are no photos yet. */
export function Gallery({ photos, category, title }: { photos: { url: string; alt: string }[]; category: Category; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open == null) dlg.current?.close();
    else if (!dlg.current?.open) dlg.current?.showModal();
  }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (open == null) return;
      if (e.key === 'ArrowRight') setOpen((i) => ((i ?? 0) + 1) % photos.length);
      if (e.key === 'ArrowLeft') setOpen((i) => ((i ?? 0) - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, photos.length]);

  if (!photos.length) {
    return (
      <Media category={category} className="aspect-[16/7] rounded-2xl" iconSize={72}>
        <span className="absolute bottom-3 left-4 text-[12px] font-semibold text-white/90">Photos coming from the business</span>
      </Media>
    );
  }
  const shown = photos.slice(0, 5);
  return (
    <>
      <div className={`grid h-[260px] gap-2 overflow-hidden rounded-2xl sm:h-[400px] ${shown.length >= 3 ? 'grid-cols-4 grid-rows-2' : 'grid-cols-1'}`}>
        {shown.map((p, i) => (
          <button key={p.url} type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${photos.length}: ${p.alt || title}`}
            className={`relative overflow-hidden bg-soft ${shown.length >= 3 ? (i === 0 ? 'col-span-4 row-span-2 sm:col-span-2' : 'hidden sm:block') : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.alt || title} className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]" loading={i ? 'lazy' : 'eager'} />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(0)} className="btn-outline mt-3 h-10"><Icon name="camera" size={16} />See all {photos.length} photos</button>
      <dialog ref={dlg} onClose={() => setOpen(null)} className="m-auto max-h-[92vh] w-[min(1100px,94vw)] rounded-2xl bg-[#0E1015] p-0 text-white backdrop:bg-black/80">
        {open != null ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-3 text-[14px]">
              <span>{open + 1} / {photos.length}{photos[open].alt ? ` · ${photos[open].alt}` : ''}</span>
              <button type="button" onClick={() => setOpen(null)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10" aria-label="Close"><Icon name="x" /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[open].url} alt={photos[open].alt || title} className="max-h-[75vh] w-full object-contain" />
            <div className="flex justify-between p-3">
              <button type="button" className="btn-ghost text-white" onClick={() => setOpen((open - 1 + photos.length) % photos.length)}><Icon name="back" />Previous</button>
              <button type="button" className="btn-ghost text-white" onClick={() => setOpen((open + 1) % photos.length)}>Next<Icon name="back" className="rotate-180" /></button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
