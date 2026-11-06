'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { Icon } from '@/components/Icon';

/** Someone shared an invite link to plan a trip together. */
export default function JoinTrip({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { me } = useSession();
  const [trip, setTrip] = useState<{ title: string; ownerName: string; startsOn: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    call<{ trip: { title: string; ownerName: string; startsOn: string | null } }>(`/trips/join/${token}`).then((r) => setTrip(r.trip)).catch((e) => setErr(e.message));
  }, [token]);
  async function join() {
    try {
      const r = await call<{ tripId: string }>(`/trips/join/${token}`, { body: {} });
      location.href = `/trips/${r.tripId}`;
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="container-k flex max-w-lg flex-col gap-4 py-14">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="people" size={24} /></span>
      {err ? <p className="text-danger">{err}</p> : !trip ? <p className="text-muted">Opening the invitation…</p> : (
        <>
          <h1 className="font-display text-3xl font-extrabold">Plan “{trip.title}” together</h1>
          <p className="text-muted">{trip.ownerName} invited you to add places, days and notes to this trip. You’ll both see every change.</p>
          {me.user ? (
            <button className="btn-primary self-start" onClick={join}>Join the trip</button>
          ) : (
            <Link href={`/signin?next=${encodeURIComponent(`/trips/join/${token}`)}`} className="btn-primary self-start">Sign in to join</Link>
          )}
        </>
      )}
    </div>
  );
}
