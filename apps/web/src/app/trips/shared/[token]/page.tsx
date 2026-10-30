import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/server-api';
import { shortDate } from '@/lib/format';

export const metadata = { title: 'Shared trip', robots: { index: false } };

type Trip = { title: string; startsOn: string | null; endsOn: string | null; notes: string | null; items: { id: string; day: string | null; timeLabel: string | null; note: string | null; slug: string | null; title: string | null; city: string | null }[] };

export default async function Shared({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let trip: Trip;
  try {
    ({ trip } = await api<{ trip: Trip }>(`/trips/shared/${token}`));
  } catch {
    notFound();
  }
  const days = [...new Set(trip.items.map((i) => i.day))];
  return (
    <div className="container-k max-w-3xl py-10">
      <p className="eyebrow">Shared trip</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold">{trip.title}</h1>
      {trip.startsOn ? <p className="mt-1 text-muted">{shortDate(trip.startsOn)}{trip.endsOn ? ` to ${shortDate(trip.endsOn)}` : ''}</p> : null}
      <div className="mt-6 flex flex-col gap-6">
        {days.map((d) => (
          <section key={d ?? 'none'}>
            <h2 className="eyebrow">{d ? shortDate(d, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Not scheduled yet'}</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {trip.items.filter((i) => i.day === d).map((i) => (
                <li key={i.id} className="card p-3">
                  {i.slug ? <Link className="font-bold hover:underline" href={`/listing/${i.slug}`}>{i.title}</Link> : <span className="font-semibold">{i.note ?? 'Place no longer listed'}</span>}
                  {i.city ? <div className="text-[13px] text-muted">{i.city}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Link href="/signin" className="btn-primary mt-8">Plan your own trip free</Link>
    </div>
  );
}
