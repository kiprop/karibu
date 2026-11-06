import { Page, SideCard, Steps } from '@/components/Page';
import Link from 'next/link';
import { api } from '@/lib/server-api';
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
    <Page crumbs={[{ label: 'Travel smart', href: '/safety' }, { label: 'Emergency card' }]} title={`Emergency card · ${info.country.name}`}
      desc="Save this page: it works offline once you’ve opened it."
      aside={<>
        <SideCard title="Lost your passport?">
          <Steps items={['Report it at the nearest police station and ask for a police abstract with the OB number.', 'Contact your embassy or high commission for an emergency travel document.', 'Tell your airline and where you are staying.']} />
        </SideCard>
        <SideCard title="Need help, not an emergency?">
          <p className="text-muted">Overcharged, scammed or something felt wrong? <Link href="/report" className="font-semibold text-brand">Report it</Link> and our team reviews safety reports within 4 hours.</p>
        </SideCard>
      </>}>
      {info.advisories.map((a) => <p key={a.id} className="rounded-xl bg-amber-soft p-3 text-amber"><strong>Advisory:</strong> {a.message}</p>)}
      <div className="grid gap-3 sm:grid-cols-2">
        {emergency.map((c) => (
          <a key={c.value} href={`tel:${c.value}`} className="rounded-xl bg-danger p-5 text-white hover:brightness-95">
            <div className="text-[13px] font-semibold opacity-90">{c.label}</div>
            <div className="select-all text-5xl font-semibold tracking-tight">{c.value}</div>
          </a>
        ))}
      </div>
      <section className="card">
        <h2 className="section-title border-b border-line/70 px-5 py-3">Embassies and high commissions</h2>
        <ul className="divide-y divide-line/70">
          {embassies.map((c) => (
            <li key={c.label} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span className="min-w-0"><span className="block font-semibold">{c.label}</span><span className="text-[12px] text-muted">Reviewed {shortDate(c.lastReviewedOn)}</span></span>
              <a className="text-[14px] font-semibold text-brand hover:underline" href={c.value} target="_blank" rel="noopener">Official contact page</a>
            </li>
          ))}
          <li className="px-5 py-3 text-[13.5px] text-muted">More embassies are being added. Your own government’s travel advice site lists its embassy in {info.country.name}.</li>
        </ul>
      </section>
      {hospitals.length ? (
        <section className="card">
          <h2 className="section-title border-b border-line/70 px-5 py-3">24-hour hospitals</h2>
          <ul className="divide-y divide-line/70">{hospitals.map((h) => <li key={h.label} className="flex flex-wrap justify-between gap-2 px-5 py-3"><span>{h.label}</span><span className="select-all font-semibold">{h.value}</span></li>)}</ul>
        </section>
      ) : null}
    </Page>
  );
}
