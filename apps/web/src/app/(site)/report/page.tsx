'use client';

import Link from 'next/link';
import { Page as KPage, SideCard, Steps } from '@/components/Page';
import { Done } from '@/components/bits';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { call } from '@/lib/client-api';

const CATS = [
  ['safety', 'Safety concern'],
  ['scam', 'Possible scam'],
  ['overcharged', 'Overcharged'],
  ['wrong_info', 'Wrong information'],
  ['other', 'Something else'],
] as const;

function ReportForm() {
  const sp = useSearchParams();
  const listingId = sp.get('listing') ?? undefined;
  const title = sp.get('title');
  const [category, setCategory] = useState<string>(sp.get('category') ?? 'wrong_info');
  const [subject, setSubject] = useState(sp.get('subject') ?? '');
  const [body, setBody] = useState('');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await call('/reports', { body: { listingId, subject: listingId ? undefined : subject, category, body, contact: contact || undefined } });
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  const aside = (
    <>
      <SideCard title="In an emergency" tone="warn">
        <p className="text-muted">Call <b className="text-ink">999</b> or <b className="text-ink">112</b> first. Karibu is not an emergency service.</p>
        <Link href="/safety/emergency" className="mt-2 inline-block font-semibold text-brand">Emergency card</Link>
      </SideCard>
      <SideCard title="What happens next">
        <Steps items={[<>Safety and scam reports are reviewed <b>within 4 hours</b>.</>, <>Other reports <b>within 2 working days</b>.</>, <>If we confirm a problem, the listing can be <b>suspended</b> while we check.</>]} />
      </SideCard>
    </>
  );
  return (
    <KPage crumbs={[{ label: 'Share', href: '/share' }, { label: 'Report a problem' }]} title="Report a problem"
      desc={title ? <>About: <strong className="text-ink">{title}</strong></> : 'Overcharging, a fake operator, a safety issue or wrong information. Your report goes straight to our trust and safety team.'} aside={aside}>
      {sent ? (
        <Done title="Thank you">Our team reviews safety and scam reports within 4 hours, and other reports within 2 working days.</Done>
      ) : (
        <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
          {title ? null : (
            <div><label className="label" htmlFor="r-subj">Which business?</label><input id="r-subj" required className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Business name or phone number" /></div>
          )}
          <fieldset>
            <legend className="label mb-2">What happened?</legend>
            <div className="flex flex-wrap gap-2">
              {CATS.map(([v, l]) => (
                <label key={v} className={`pill cursor-pointer ${category === v ? 'pill-on' : ''}`}>
                  <input type="radio" name="cat" value={v} checked={category === v} onChange={() => setCategory(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div><label className="label" htmlFor="r-body">Tell us more</label><textarea id="r-body" required minLength={5} className="input min-h-[140px] py-2" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, when, and who was involved" /></div>
          <div><label className="label" htmlFor="r-contact">How can we reach you? (optional)</label><input id="r-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or WhatsApp number" /></div>
          <button className="btn-primary self-start">Send report</button>
          {err ? <p role="alert" className="text-danger">{err}</p> : null}
        </form>
      )}
    </KPage>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ReportForm />
    </Suspense>
  );
}
