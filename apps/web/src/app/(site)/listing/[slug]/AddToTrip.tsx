'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { Icon } from '@/components/Icon';

type Trip = { id: string; title: string; startsOn: string | null; endsOn: string | null };

export function AddToTrip({ listingId }: { listingId: string }) {
  const { me } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [tripId, setTripId] = useState('');
  const [day, setDay] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && me.user && !trips) call<{ trips: Trip[] }>('/me/trips').then((r) => { setTrips(r.trips); if (r.trips[0]) setTripId(r.trips[0].id); }).catch(() => setTrips([]));
  }, [open, me.user, trips]);

  if (!me.user) {
    return (
      <Link href={`/signin?next=${encodeURIComponent(path)}`} className="btn-outline" title="Sign in free to plan trips">
        <Icon name="cal" size={18} /> Add to trip
      </Link>
    );
  }

  async function add() {
    try {
      let id = tripId;
      if (!id) {
        if (!newTitle.trim()) return setMsg('Name your trip first');
        const t = await call<{ trip: Trip }>('/me/trips', { body: { title: newTitle.trim() } });
        id = t.trip.id;
      }
      await call(`/me/trips/${id}/items`, { body: { listingId, day: day || undefined } });
      setMsg('Added to your trip');
      setTimeout(() => setOpen(false), 900);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const trip = trips?.find((t) => t.id === tripId);
  return (
    <div className="relative">
      <button type="button" className="btn-outline w-full" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="cal" size={18} /> Add to trip
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-2xl border border-line bg-panel p-4 shadow-xl" role="dialog" aria-label="Add to trip">
          {trips === null ? <p className="text-muted">Loading your trips…</p> : (
            <>
              <label className="label" htmlFor="t-trip">Trip</label>
              <select id="t-trip" className="input" value={tripId} onChange={(e) => setTripId(e.target.value)}>
                {trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                <option value="">New trip…</option>
              </select>
              {!tripId ? <input className="input" placeholder="Trip name, e.g. Kenya in August" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="New trip name" /> : null}
              <label className="label" htmlFor="t-day">Day (optional)</label>
              <input id="t-day" type="date" className="input" value={day} min={trip?.startsOn ?? undefined} max={trip?.endsOn ?? undefined} onChange={(e) => setDay(e.target.value)} />
              <button type="button" className="btn-primary" onClick={add}>Add</button>
              {msg ? <p role="status" className="text-[14px] font-semibold">{msg}</p> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
