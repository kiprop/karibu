'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { Area, AreaHead, Panel } from '@/components/RailShell';
import { Icon } from '@/components/Icon';

type Trip = { id: string; title: string; startsOn: string | null; endsOn: string | null; itemCount: number; shared: boolean; isOwner: boolean; memberCount: number };
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

export default function TripsPage() {
  const { me } = useSession();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [f, setF] = useState({ title: '', startsOn: '', endsOn: '' });
  const [err, setErr] = useState<string | null>(null);
  const load = () => call<{ trips: Trip[] }>('/me/trips').then((r) => setTrips(r.trips)).catch(() => setTrips([]));
  useEffect(() => {
    if (me.user) load();
  }, [me.user]);

  if (!me.user) {
    return (
      <Area>
        <AreaHead crumbs={[{ label: 'My Karibu', href: '/today' }, { label: 'Trips' }]} title="Trips" desc="Plan by day, see it on a map, share a read-only link, or plan together with family." />
        <Panel><p className="text-[14px]"><Link href="/signin?next=/trips" className="font-semibold text-brand">Sign in</Link> to make trips. Things you saved on this device come with you.</p></Panel>
      </Area>
    );
  }
  return (
    <Area>
      <AreaHead crumbs={[{ label: 'My Karibu', href: '/today' }, { label: 'Trips' }]} title="Trips" desc="Plan by day, see it on a map, share a read-only link, or invite family to plan with you." />
      <Panel title="New trip">
        <form className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            const r = await call<{ trip: { id: string } }>('/me/trips', { body: { title: f.title, startsOn: f.startsOn || undefined, endsOn: f.endsOn || undefined } });
            location.href = `/trips/${r.trip.id}`;
          } catch (x) { setErr((x as Error).message); }
        }}>
          <div><label className="label" htmlFor="t-t">Name</label><input id="t-t" required className="input mt-1" placeholder="Mara and the coast, August" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label className="label" htmlFor="t-s">From</label><input id="t-s" type="date" className="input mt-1" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></div>
          <div><label className="label" htmlFor="t-e">To</label><input id="t-e" type="date" className="input mt-1" min={f.startsOn || undefined} value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></div>
          <button className="btn-primary"><Icon name="plus" size={16} />Create</button>
        </form>
        {err ? <p className="mt-2 text-[14px] text-danger">{err}</p> : null}
      </Panel>
      <Panel title="Your trips" meta={trips ? `${trips.length}` : ''} pad={false}>
        {!trips ? <div className="m-4 h-20 animate-pulse rounded-lg bg-soft" /> : trips.length === 0 ? <p className="p-4 text-[14px] text-muted">No trips yet.</p> : (
          <ul className="divide-y divide-line/70">
            {trips.map((t) => (
              <li key={t.id}>
                <Link href={`/trips/${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-soft/60">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name="cal" size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.title}</span>
                    <span className="block text-[12.5px] text-muted">{[d(t.startsOn) && `${d(t.startsOn)}${t.endsOn ? ` – ${d(t.endsOn)}` : ''}`, `${t.itemCount} item${t.itemCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  {t.memberCount > 0 ? <span className="chip bg-blue-50 text-[#0B5CD5] dark:bg-soft">Planning with {t.memberCount}</span> : null}
                  {!t.isOwner ? <span className="chip bg-soft text-muted">Shared with you</span> : null}
                  {t.shared ? <span className="chip bg-teal-soft text-teal">Read-only link on</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Area>
  );
}
