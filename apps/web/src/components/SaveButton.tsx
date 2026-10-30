'use client';

import { useState } from 'react';
import { useSession } from './Session';
import { Icon } from './Icon';

export function SaveButton({ listingId, title, variant = 'round' }: { listingId: string; title: string; variant?: 'round' | 'button' }) {
  const { favourites, toggleFavourite, me } = useSession();
  const [note, setNote] = useState<string | null>(null);
  const saved = favourites.has(listingId);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const on = await toggleFavourite(listingId);
    setNote(on ? (me.user ? 'Saved' : 'Saved on this device') : 'Removed');
    setTimeout(() => setNote(null), 1800);
  }

  if (variant === 'button') {
    return (
      <button type="button" onClick={onClick} aria-pressed={saved} className="btn-outline">
        <Icon name="heart" size={18} filled={saved} className={saved ? 'text-[#E8364B]' : ''} />
        {saved ? 'Saved' : 'Save'}
        <span className="sr-only" aria-live="polite">{note}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#14171F] shadow-sm"
    >
      <Icon name="heart" size={18} filled={saved} className={saved ? 'text-[#E8364B]' : ''} />
      <span className="sr-only" aria-live="polite">{note}</span>
    </button>
  );
}
