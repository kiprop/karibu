'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';

export type PhotoItem = { url: string; alt: string; id?: string };

/**
 * Shrinks a phone photo before upload: long edge 2000px, JPEG. A 6 MB camera photo becomes roughly 400 KB,
 * which matters on mobile data, and it drops the location data cameras hide inside photos.
 */
export async function shrinkPhoto(file: File, max = 2000): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Photo manager used by businesses (and by staff adding photos for a business): upload from the phone or
 * computer, describe each photo, pick the cover, remove. The first photo is the cover everywhere.
 */
export function PhotoUploader({ photos, onChange, upload, remove, max = 12, note }: {
  photos: PhotoItem[];
  onChange: (p: PhotoItem[]) => void;
  upload: (blob: Blob) => Promise<PhotoItem>;
  remove?: (p: PhotoItem) => Promise<void>;
  max?: number;
  note?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    const list = [...files].slice(0, Math.max(0, max - photos.length));
    if (list.length < files.length) setErr(`Up to ${max} photos per listing.`);
    let next = [...photos];
    setBusy(list.length);
    for (const f of list) {
      try {
        if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && !/\.(jpe?g|png|webp|heic)$/i.test(f.name)) throw new Error(`${f.name}: use a JPG, PNG or WEBP photo`);
        const p = await upload(await shrinkPhoto(f));
        next = [...next, { ...p, alt: p.alt || '' }];
        onChange(next);
      } catch (e) {
        setErr((e as Error).message);
      }
      setBusy((b) => b - 1);
    }
    if (input.current) input.current.value = '';
  }

  const move = (i: number, to: number) => {
    const p = [...photos];
    const [x] = p.splice(i, 1);
    p.splice(to, 0, x);
    onChange(p);
  };

  return (
    <div className="flex flex-col gap-3">
      {photos.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.url} className="overflow-hidden rounded-lg border border-line bg-panel">
              <div className="relative aspect-[4/3] bg-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt} className="absolute inset-0 h-full w-full object-cover" />
                {i === 0 ? <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">Cover</span> : null}
                <span className="absolute right-2 top-2 flex gap-1">
                  {i > 0 ? <button type="button" onClick={() => move(i, 0)} className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-black/80">Make cover</button> : null}
                  <button type="button" aria-label={`Remove photo ${i + 1}`} className="grid h-6 w-6 place-items-center rounded bg-black/60 text-white hover:bg-black/80"
                    onClick={async () => { try { await remove?.(p); onChange(photos.filter((x) => x !== p)); } catch (e) { setErr((e as Error).message); } }}>
                    <Icon name="x" size={13} />
                  </button>
                </span>
              </div>
              <label className="sr-only" htmlFor={`alt-${i}`}>What photo {i + 1} shows</label>
              <input id={`alt-${i}`} className="w-full border-t border-line bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-muted focus:bg-soft" value={p.alt} maxLength={160}
                placeholder="What it shows, e.g. Tent interior" onChange={(e) => onChange(photos.map((x, n) => (n === i ? { ...x, alt: e.target.value } : x)))} />
            </li>
          ))}
        </ul>
      ) : null}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-soft/50 px-4 py-6 text-center">
        <Icon name="camera" size={24} className="text-muted" />
        <div className="text-[14px]"><b>Add photos</b> from your phone or computer, or drag them here</div>
        <div className="text-[12.5px] text-muted">JPG, PNG or WEBP. {photos.length}/{max} used. Real photos of your place, vehicle or work get far more enquiries.</div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" id="photo-input" onChange={(e) => add(e.target.files)} />
        <label htmlFor="photo-input" className="btn-outline mt-1 cursor-pointer">{busy ? `Uploading ${busy}…` : 'Choose photos'}</label>
      </div>
      {note ? <div className="text-[12.5px] text-muted">{note}</div> : null}
      {err ? <p role="alert" className="text-[13px] font-semibold text-danger">{err}</p> : null}
    </div>
  );
}
