'use client';

import Link from 'next/link';
import { Area, AreaHead } from '@/components/RailShell';
import dynamic from 'next/dynamic';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';
import { shortDate } from '@/lib/format';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), { ssr: false, loading: () => <div className="h-[360px] animate-pulse rounded-2xl bg-soft" /> });

type Item = { id: string; day: string | null; timeLabel: string | null; note: string | null; listingId: string | null; slug: string | null; title: string | null; city: string | null; lat: number | null; lon: number | null; available: boolean; whatsapp: string | null };
type Trip = { id: string; title: string; startsOn: string | null; endsOn: string | null; notes: string | null; shareToken: string | null; items: Item[]; isOwner: boolean; editToken: string | null; people: { id: string; name: string; owner: boolean }[] | null };

function daysBetween(a: string, b: string) {
  const out: string[] = [];
  const d = new Date(a + 'T12:00:00Z');
  const end = new Date(b + 'T12:00:00Z');
  while (d <= end && out.length < 60) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [note, setNote] = useState('');
  const [noteDay, setNoteDay] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => call<{ trip: Trip }>(`/me/trips/${id}`).then((r) => setTrip(r.trip)).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => (trip?.startsOn && trip.endsOn ? daysBetween(trip.startsOn, trip.endsOn) : []), [trip]);
  const groups = useMemo(() => {
    if (!trip) return [];
    const keys = [...new Set([...days, ...trip.items.map((i) => i.day).filter(Boolean)] as string[])].sort();
    const g = keys.map((d) => ({ day: d as string | null, items: trip.items.filter((i) => i.day === d) }));
    g.push({ day: null, items: trip.items.filter((i) => !i.day) });
    return g;
  }, [trip, days]);
  const points = useMemo(
    () => (trip?.items ?? []).filter((i) => i.lat != null && i.lon != null).map((i) => ({ id: i.id, lat: i.lat!, lon: i.lon!, label: i.title ?? 'Stop', href: i.slug ? `/listing/${i.slug}` : undefined, sub: i.day ? shortDate(i.day, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Unscheduled' })),
    [trip],
  );

  const crumbs = [{ label: 'My Karibu', href: '/today' }, { label: 'Trips', href: '/trips' }, { label: trip?.title ?? 'Trip' }];
  if (error) return <Area><AreaHead crumbs={crumbs} title="Trip not available" desc={error} actions={<Link href="/trips" className="btn-primary">Back to trips</Link>} /></Area>;
  if (!trip) return <Area><AreaHead crumbs={crumbs} title="Loading trip…" /></Area>;

  async function patch(body: object) {
    await call(`/me/trips/${id}`, { method: 'PATCH', body }).catch((e) => setError(e.message));
    load();
  }
  async function moveItem(itemId: string, day: string) {
    await call(`/me/trips/${id}/items/${itemId}`, { method: 'PATCH', body: { day: day || null } });
    load();
  }
  async function removeItem(itemId: string) {
    await call(`/me/trips/${id}/items/${itemId}`, { method: 'DELETE' });
    load();
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await call(`/me/trips/${id}/items`, { body: { note: note.trim(), day: noteDay || undefined } });
    setNote('');
    load();
  }
  async function toggleShare() {
    const r = await call<{ shareToken: string | null }>(`/me/trips/${id}/share`, { body: { enabled: !trip!.shareToken } });
    setTrip({ ...trip!, shareToken: r.shareToken });
  }
  async function toggleInvite() {
    const r = await call<{ editToken: string | null }>(`/me/trips/${id}/invite`, { body: { enabled: !trip!.editToken } });
    setTrip({ ...trip!, editToken: r.editToken });
    load();
  }
  async function copyInvite() {
    const url = `${location.origin}/trips/join/${trip!.editToken}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }
  async function copyLink() {
    const url = `${location.origin}/trips/shared/${trip!.shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copy this link', url);
    }
  }
  async function deleteTrip() {
    if (!confirm('Delete this trip? Saved places are not affected.')) return;
    await call(`/me/trips/${id}`, { method: 'DELETE' });
    location.href = '/trips';
  }

  return (
    <Area>
      <AreaHead crumbs={crumbs} title={trip.title}
        desc={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="tr-s">Start date</label>
            <input id="tr-s" type="date" className="input min-h-[36px] w-auto text-[14px]" defaultValue={trip.startsOn ?? ''} onBlur={(e) => e.target.value !== (trip.startsOn ?? '') && patch({ startsOn: e.target.value || null })} />
            <span>to</span>
            <label className="sr-only" htmlFor="tr-e">End date</label>
            <input id="tr-e" type="date" className="input min-h-[36px] w-auto text-[14px]" defaultValue={trip.endsOn ?? ''} onBlur={(e) => e.target.value !== (trip.endsOn ?? '') && patch({ endsOn: e.target.value || null })} />
          </span>
        }
        actions={<>
          {trip.isOwner ? <button className="btn-outline h-9 min-h-0 text-[13px]" onClick={toggleShare}><Icon name="share" size={16} />{trip.shareToken ? 'Stop sharing' : 'Share read-only link'}</button> : null}
          {trip.shareToken && trip.isOwner ? <button className="btn-dark h-9 min-h-0 text-[13px]" onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button> : null}
          <Link href="/explore" className="btn-primary h-9 min-h-0 text-[13px]"><Icon name="plus" size={16} />Add places</Link>
        </>} />

      <section aria-label="Plan together" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <Icon name="people" size={18} className="text-brand" />
        <span className="min-w-0 flex-1 text-[14px]">
          <b>Plan together.</b>{' '}
          {(trip.people?.length ?? 1) > 1
            ? <>Planning with {trip.people!.filter((x) => !x.owner).map((x) => x.name).join(', ')}{trip.isOwner ? '' : `, made by ${trip.people!.find((x) => x.owner)?.name}`}.</>
            : trip.isOwner ? 'Invite family or friends to add places and notes. Useful when relatives plan a visit home together.' : null}
        </span>
        {trip.isOwner ? (
          <>
            <button className="btn-outline h-9 min-h-0 text-[13px]" onClick={toggleInvite}>{trip.editToken ? 'Turn off invite link' : 'Get invite link'}</button>
            {trip.editToken ? <button className="btn-dark h-9 min-h-0 text-[13px]" onClick={copyInvite}>{inviteCopied ? 'Copied' : 'Copy invite link'}</button> : null}
          </>
        ) : null}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.day ?? 'none'} aria-label={g.day ? shortDate(g.day) : 'Unscheduled'}>
              <h2 className="eyebrow">{g.day ? shortDate(g.day, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Not scheduled yet'}</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {g.items.length === 0 ? <li className="rounded-xl border border-dashed border-line px-4 py-3 text-[14px] text-muted">Nothing planned</li> : null}
                {g.items.map((i) => (
                  <li key={i.id} className="card flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      {i.title ? (
                        <Link href={`/listing/${i.slug}`} className="font-bold hover:underline">{i.title}</Link>
                      ) : (
                        <span className="font-semibold">{i.note}</span>
                      )}
                      <div className="text-[13px] text-muted">
                        {i.city ?? 'Note'}
                        {i.title && i.note ? ` · ${i.note}` : ''}
                        {i.title && !i.available ? ' · no longer verified' : ''}
                      </div>
                    </div>
                    <label className="sr-only" htmlFor={`d-${i.id}`}>Move to day</label>
                    <select id={`d-${i.id}`} className="input min-h-[36px] w-auto text-[13px]" value={i.day ?? ''} onChange={(e) => moveItem(i.id, e.target.value)}>
                      <option value="">Unscheduled</option>
                      {(days.length ? days : groups.map((x) => x.day).filter(Boolean) as string[]).map((d) => <option key={d} value={d}>{shortDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
                    </select>
                    <button className="btn-ghost min-h-[36px] px-2" aria-label={`Remove ${i.title ?? 'note'}`} onClick={() => removeItem(i.id)}><Icon name="trash" size={18} /></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <form onSubmit={addNote} className="card flex flex-wrap items-end gap-2 p-3" aria-label="Add a note">
            <div className="min-w-[200px] flex-1">
              <label className="label" htmlFor="n-text">Add a note</label>
              <input id="n-text" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Flight lands 6:40 am, rest day…" />
            </div>
            <div>
              <label className="label" htmlFor="n-day">Day</label>
              <select id="n-day" className="input" value={noteDay} onChange={(e) => setNoteDay(e.target.value)}>
                <option value="">Unscheduled</option>
                {days.map((d) => <option key={d} value={d}>{shortDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
              </select>
            </div>
            <button className="btn-dark">Add</button>
          </form>
          {trip.isOwner ? <button onClick={deleteTrip} className="self-start text-[14px] font-bold text-danger">Delete trip</button> : null}
        </div>
        <div className="xl:sticky xl:top-20">
          {points.length ? <MapView points={points} height={420} route /> : <div className="card p-6 text-muted">Places you add appear on the map.</div>}
        </div>
      </div>
    </Area>
  );
}
