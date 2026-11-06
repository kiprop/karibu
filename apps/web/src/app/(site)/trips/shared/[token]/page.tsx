import { Page, SideCard } from '@/components/Page';
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
    <Page crumbs={[{ label: 'Shared trip' }, { label: trip.title }]} eyebrow="Shared trip" title={trip.title}
      desc={trip.startsOn ? `${shortDate(trip.startsOn)}${trip.endsOn ? ` to ${shortDate(trip.endsOn)}` : ''}` : undefined}
      aside={<SideCard title="Plan your own trip">
        <p className="text-muted">Save verified places, plan by day with a map, and share it like this one. Free.</p>
        <Link href="/today" className="btn-primary mt-3">Start planning</Link>
      </SideCard>}>
      <div className="flex flex-col gap-6">
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
    </Page>
  );
}
