'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call, guestFavourites } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { ListingCard } from '@/components/ListingCard';
import { Area, AreaHead, Panel } from '@/components/RailShell';
import { Icon } from '@/components/Icon';
import type { ListingCard as L } from '@/lib/types';

export default function Saved() {
  const { me, favourites } = useSession();
  const [items, setItems] = useState<L[] | null>(null);

  useEffect(() => {
    const ids = me.user ? [...favourites] : guestFavourites();
    if (!ids.length) return setItems([]);
    call<{ results: L[] }>(`/listings?ids=${ids.join(',')}&pageSize=50`).then((r) => setItems(r.results)).catch(() => setItems([]));
  }, [favourites, me.user]);

  return (
    <Area>
      <AreaHead crumbs={[{ label: 'My Karibu', href: '/today' }, { label: 'Saved' }]} title="Saved"
        desc={me.user ? 'Places you’ve kept, on every device you sign in on. Add them to a trip to plan day by day.' : 'Saved on this device only. Sign in to keep them everywhere and add them to trips.'}
        actions={<Link href="/trips" className="btn-outline h-9 min-h-0 text-[13px]"><Icon name="cal" size={15} />Trips</Link>} />
      {items === null ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-soft" />)}</div>
      ) : items.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name="heart" size={20} /></span>
            <div className="flex-1">
              <div className="font-semibold">Nothing saved yet</div>
              <p className="text-[14px] text-muted">Tap the heart on any listing to keep it here.</p>
            </div>
            <Link href="/explore" className="btn-primary">Explore</Link>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => <ListingCard key={l.id} l={l} />)}
        </div>
      )}
    </Area>
  );
}
