'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call, guestFavourites } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { ListingCard } from '@/components/ListingCard';
import { Empty } from '@/components/bits';
import { Icon } from '@/components/Icon';
import type { ListingCard as L } from '@/lib/types';

type Trip = { id: string; title: string; startsOn: string | null; endsOn: string | null; itemCount: number; shared: boolean };

export default function Saved() {
  const { me, favourites } = useSession();
  const [items, setItems] = useState<L[] | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ids = me.user ? [...favourites] : guestFavourites();
    if (!ids.length) return setItems([]);
    call<{ results: L[] }>(`/listings?ids=${ids.join(',')}&pageSize=50`).then((r) => setItems(r.results)).catch(() => setItems([]));
  }, [favourites, me.user]);

  useEffect(() => {
    if (me.user) call<{ trips: Trip[] }>('/me/trips').then((r) => setTrips(r.trips)).catch(() => setTrips([]));
  }, [me.user]);

  async function createTrip(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const r = await call<{ trip: { id: string } }>('/me/trips', { body: { title, startsOn: startsOn || undefined, endsOn: endsOn || undefined } });
      window.location.href = `/trips/${r.trip.id}`;
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="container-k py-8">
      <h1 className="font-display text-3xl font-extrabold">Saved and trips</h1>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-extrabold">Your trips</h2>
        </div>
        {!me.user ? (
          <div className="card mt-3 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <Icon name="cal" size={28} className="text-brand" />
            <div className="flex-1">
              <strong>Plan day by day, with a map</strong>
              <p className="text-muted">Create a free account to build trips, share them with travel companions and keep them on every device. Your saved places come with you.</p>
            </div>
            <Link href="/signin?next=/saved" className="btn-primary">Sign in free</Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-3 sm:grid-cols-2">
              {trips === null ? <p className="text-muted">Loading…</p> : null}
              {trips?.length === 0 ? <p className="text-muted">No trips yet. Create one to start planning.</p> : null}
              {trips?.map((t) => (
                <Link key={t.id} href={`/trips/${t.id}`} className="card flex flex-col gap-1 p-4 hover:border-ink">
                  <strong className="text-lg">{t.title}</strong>
                  <span className="text-[14px] text-muted">{t.startsOn ? `${t.startsOn}${t.endsOn ? ` to ${t.endsOn}` : ''}` : 'No dates yet'} · {t.itemCount} item{t.itemCount === 1 ? '' : 's'}{t.shared ? ' · shared' : ''}</span>
                </Link>
              ))}
            </div>
            <form onSubmit={createTrip} className="card flex flex-col gap-2 p-4" aria-label="New trip">
              <strong>New trip</strong>
              <label className="label" htmlFor="nt-title">Name</label>
              <input id="nt-title" required className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kenya in August" />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="nt-s">Start</label><input id="nt-s" type="date" className="input" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></div>
                <div><label className="label" htmlFor="nt-e">End</label><input id="nt-e" type="date" className="input" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} /></div>
              </div>
              <button className="btn-primary mt-1">Create trip</button>
              {err ? <p role="alert" className="text-[14px] text-danger">{err}</p> : null}
            </form>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-extrabold">Saved places</h2>
        {!me.user ? <p className="mt-1 text-[14px] text-muted">Saved on this device only. Sign in to keep them everywhere.</p> : null}
        <div className="mt-4">
          {items === null ? <p className="text-muted">Loading…</p> : items.length === 0 ? (
            <Empty title="Nothing saved yet" body="Tap the heart on any listing to keep it here.">
              <Link href="/explore" className="btn-primary mt-2">Explore listings</Link>
            </Empty>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((l) => <ListingCard key={l.id} l={l} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
