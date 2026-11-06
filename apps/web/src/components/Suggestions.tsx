'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call, guestFavourites } from '@/lib/client-api';
import { localProfile, profileQuery } from '@/lib/companion';
import { useSession } from './Session';
import { Icon } from './Icon';
import { Media } from './bits';
import type { Category } from '@/lib/types';

type S = { listing: { id: string; slug: string; title: string; category: Category; subtype: string; city: string; priceFrom: number | null; currency: string; priceUnit: string | null; verificationLevel: number; photoUrl: string | null; isSample: boolean }; reason: string; kind: string };
const KIND_ICON: Record<string, string> = { saved: 'heart', together: 'people', season: 'cal', people: 'star', plan: 'check', checked: 'shield' };

/** "For you": suggestions that always say why they're shown. Never paid placement. */
export function Suggestions({ title = 'For you', limit = 6, compact = false }: { title?: string; limit?: number; compact?: boolean }) {
  const { me } = useSession();
  const [items, setItems] = useState<S[] | null>(null);
  useEffect(() => {
    const qs = new URLSearchParams(me.user ? '' : profileQuery(localProfile()));
    if (!me.user) {
      const saved = guestFavourites();
      if (saved.length) qs.set('saved', saved.join(','));
    }
    qs.set('limit', String(limit));
    call<{ suggestions: S[] }>(`/suggestions?${qs}`).then((r) => setItems(r.suggestions)).catch(() => setItems([]));
  }, [me.user, limit]);
  if (items && !items.length) return null;
  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={compact ? 'text-[14px] font-semibold' : 'text-[22px] font-semibold tracking-tight'}>{title}</h2>
        <span className="text-[12px] text-muted">Each one says why. No paid placement.</span>
      </div>
      <div className={`mt-3 grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {(items ?? Array.from({ length: Math.min(limit, 3) })).map((s, i) =>
          s ? (
            <Link key={s.listing.id} href={`/listing/${s.listing.slug}`} className="group flex min-w-0 gap-3 rounded-xl border border-line bg-panel p-2.5 hover:border-muted/40">
              <Media category={s.listing.category} photoUrl={s.listing.photoUrl} className="h-20 w-24 shrink-0 rounded-lg" iconSize={24} />
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-1.5 text-[12px] font-medium text-brand"><Icon name={KIND_ICON[s.kind] ?? 'star'} size={13} className="mt-0.5 shrink-0" /><span className="line-clamp-2">{s.reason}</span></span>
                <span className="mt-1 block truncate text-[14px] font-semibold group-hover:underline">{s.listing.title}</span>
                <span className="block truncate text-[12.5px] text-muted">{s.listing.subtype} · {s.listing.city}{s.listing.priceFrom ? ` · from ${s.listing.currency} ${s.listing.priceFrom.toLocaleString()}` : ''}</span>
              </span>
            </Link>
          ) : (
            <div key={i} className="h-[104px] animate-pulse rounded-xl bg-soft" />
          ),
        )}
      </div>
    </section>
  );
}
