import Link from 'next/link';

export const metadata = { title: 'How we verify' };

const LEVELS = [
  { level: 1, name: 'Contact verified', checks: ['Phone confirmed by SMS code', 'WhatsApp answered a test message within 24 hours', 'Owner identity matches the business registration'] },
  { level: 2, name: 'Licensed', checks: ['Everything in level 1', 'The licence, permit or insurance this kind of business needs, checked by our team', 'Required for drivers, game drives and safari operators'] },
  { level: 3, name: 'Visited', checks: ['Everything in level 2', 'An in-person visit or test of the service, with notes and photos on file', 'Required for hosts who work from their home'] },
];

export default function HowWeVerify() {
  return (
    <div className="container-k max-w-3xl py-10">
      <h1 className="font-display text-4xl font-extrabold">How we verify</h1>
      <p className="mt-3 text-lg">Every business is checked before it appears. Verification is free, and no business can pay to get or keep a badge.</p>
      <div className="mt-8 grid gap-4">
        {LEVELS.map((l) => (
          <section key={l.level} className="card p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal font-extrabold text-white">{l.level}</span>
              <h2 className="text-xl font-extrabold">{l.name}</h2>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-6">{l.checks.map((c) => <li key={c}>{c}</li>)}</ul>
          </section>
        ))}
      </div>
      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl font-extrabold">Keeping it accurate</h2>
        <p>Verification lasts 12 months. Businesses confirm their details regularly; a listing not confirmed for 90 days drops lower and shows a notice, and at 180 days it is hidden until confirmed.</p>
        <p>Reviews come only from travellers who contacted the business through Karibu. Featured placements are paid, always labelled, and still have to be verified.</p>
        <p>Spot something wrong? <Link className="font-bold text-brand underline" href="/report">Tell us</Link> and we review it within 2 working days.</p>
      </section>
    </div>
  );
}
