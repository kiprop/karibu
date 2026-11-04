'use client';

import { Breadcrumbs } from '@/components/Breadcrumbs';
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

  if (sent) {
    return (
      <div className="container-k max-w-xl py-10" role="status">
        <Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: 'Report a problem' }]} />
        <h1 className="mt-3 font-display text-3xl font-extrabold">Thank you</h1>
        <p className="mt-2">Our team reviews safety and scam reports within 4 hours, and other reports within 2 working days.</p>
        <p className="mt-2 text-muted">In an emergency, call 999 or 112 first.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="container-k flex max-w-xl flex-col gap-4 py-10">
      <Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: 'Report a problem' }]} />
      <h1 className="font-display text-3xl font-extrabold">Report a problem</h1>
      {title ? <p className="text-muted">About: <strong className="text-ink">{title}</strong></p> : (
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
      <p className="text-[13px] text-muted">Safety reports are reviewed within 4 hours. In an emergency, call 999 or 112 first.</p>
      <button className="btn-primary self-start">Send report</button>
      {err ? <p role="alert" className="text-danger">{err}</p> : null}
    </form>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ReportForm />
    </Suspense>
  );
}
