import Link from 'next/link';
import { Page } from '@/components/Page';

export const metadata = { title: 'How we verify' };

const LEVELS = [
  { level: 1, name: 'Contact verified', checks: ['Phone confirmed by SMS code', 'WhatsApp answered a test message within 24 hours', 'Owner identity matches the business registration'] },
  { level: 2, name: 'Licensed', checks: ['Everything in level 1', 'The licence, permit or insurance this kind of business needs, checked by our team', 'Required for drivers, game drives and safari operators'] },
  { level: 3, name: 'Visited', checks: ['Everything in level 2', 'An in-person visit or test of the service, with notes and photos on file', 'Required for hosts who work from their home'] },
];

export default function HowWeVerify() {
  return (
    <Page crumbs={[{ label: 'Travel smart', href: '/safety' }, { label: 'How we verify' }]} title="How we verify"
      desc="Every business is checked before it appears. Verification is free, and no business can pay to get or keep a badge.">
      <div className="grid gap-4 md:grid-cols-3">
        {LEVELS.map((l) => (
          <section key={l.level} className="card flex flex-col p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-teal text-[14px] font-semibold text-white">{l.level}</span>
              <h2 className="section-title">{l.name}</h2>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-[14px] text-muted">{l.checks.map((c) => <li key={c} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />{c}</li>)}</ul>
          </section>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5 text-[14.5px] leading-relaxed">
          <h2 className="section-title">Keeping it accurate</h2>
          <p className="mt-2 text-muted">Verification lasts 12 months. Businesses confirm their details regularly. A listing not confirmed for 90 days drops lower and shows a notice, and at 180 days it is hidden until confirmed.</p>
        </section>
        <section className="card p-5 text-[14.5px] leading-relaxed">
          <h2 className="section-title">Reviews and featured places</h2>
          <p className="mt-2 text-muted">Reviews come only from travellers who contacted the business through Karibu. Featured placements are paid, always labelled, and still have to be verified.</p>
          <p className="mt-2 text-muted">Spot something wrong? <Link className="font-semibold text-brand underline" href="/report">Tell us</Link> and we review it within 2 working days.</p>
        </section>
      </div>
    </Page>
  );
}
