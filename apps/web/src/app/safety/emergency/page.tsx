import Link from 'next/link';
import { api } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { shortDate } from '@/lib/format';

export const metadata = { title: 'Emergency card' };

type C = { kind: string; label: string; value: string; nationality: string | null; sourceUrl: string | null; lastReviewedOn: string };

export default async function Emergency({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const { country = 'KE' } = await searchParams;
  const info = await api<{ country: { name: string }; contacts: C[]; advisories: { id: string; message: string }[] }>(`/countries/${country}/info`);
  const emergency = info.contacts.filter((c) => c.kind === 'emergency' || c.kind === 'police' || c.kind === 'ambulance');
  const embassies = info.contacts.filter((c) => c.kind === 'embassy');
  const hospitals = info.contacts.filter((c) => c.kind === 'hospital');
  return (
    <div className="container-k max-w-2xl py-10">
      <Link href="/safety" className="inline-flex items-center gap-1 text-[14px] font-bold text-muted"><Icon name="back" size={16} />Travel smart</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Emergency card · {info.country.name}</h1>
      {info.advisories.map((a) => <p key={a.id} className="mt-4 rounded-xl bg-amber-soft p-3 text-amber"><strong>Advisory:</strong> {a.message}</p>)}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {emergency.map((c) => (
          <div key={c.value} className="rounded-2xl bg-danger p-5 text-white">
            <div className="text-[13px] font-bold opacity-90">{c.label}</div>
            <div className="select-all font-display text-5xl font-extrabold">{c.value}</div>
          </div>
        ))}
      </div>
      <section className="card mt-6 p-5">
        <h2 className="text-lg font-extrabold">Lost your passport?</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Report it at the nearest police station and ask for a police abstract with the OB number.</li>
          <li>Contact your embassy or high commission for an emergency travel document.</li>
          <li>Tell your airline and where you are staying.</li>
        </ol>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-extrabold">Embassies and high commissions</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {embassies.map((c) => (
            <li key={c.label} className="card flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="font-semibold">{c.label}</span>
              <a className="font-bold text-brand underline" href={c.value} target="_blank" rel="noopener">Official contact page</a>
              <span className="w-full text-[12px] text-muted">Reviewed {shortDate(c.lastReviewedOn)}</span>
            </li>
          ))}
          <li className="text-[14px] text-muted">More embassies are being added. Your own government’s travel advice site lists its embassy in {info.country.name}.</li>
        </ul>
      </section>
      {hospitals.length ? (
        <section className="mt-6">
          <h2 className="text-lg font-extrabold">24-hour hospitals</h2>
          <ul className="mt-2 flex flex-col gap-2">{hospitals.map((h) => <li key={h.label} className="card p-4">{h.label} · <span className="select-all">{h.value}</span></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
