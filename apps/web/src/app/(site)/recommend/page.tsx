'use client';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import { useState } from 'react';
import { call } from '@/lib/client-api';

export default function Recommend() {
  const [f, setF] = useState({ business: '', contact: '', city: '', why: '' });
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call('/recommendations', { body: { business: f.business, contact: f.contact || undefined, city: f.city || undefined, why: f.why || undefined } });
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  if (sent) return <div className="container-k max-w-xl py-10" role="status"><Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: 'Recommend a business' }]} /><h1 className="mt-3 font-display text-3xl font-extrabold">Thanks for the tip</h1><p className="mt-2">Our field team will contact the business and verify it before it can appear on Karibu.</p></div>;
  return (
    <form onSubmit={submit} className="container-k flex max-w-xl flex-col gap-4 py-10">
      <Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: 'Recommend a business' }]} />
      <h1 className="font-display text-3xl font-extrabold">Recommend a business</h1>
      <p className="text-muted">Had great service from a driver, guide or camp? Tell us and we’ll invite them to get verified.</p>
      <div><label className="label" htmlFor="b">Business or person</label><input id="b" required className="input" value={f.business} onChange={set('business')} /></div>
      <div><label className="label" htmlFor="c">Their phone or WhatsApp (optional)</label><input id="c" className="input" value={f.contact} onChange={set('contact')} /></div>
      <div><label className="label" htmlFor="ci">Where</label><input id="ci" className="input" value={f.city} onChange={set('city')} placeholder="e.g. Naivasha" /></div>
      <div><label className="label" htmlFor="w">Why you recommend them</label><textarea id="w" className="input min-h-[110px] py-2" value={f.why} onChange={set('why')} /></div>
      <button className="btn-primary self-start">Send recommendation</button>
      {err ? <p role="alert" className="text-danger">{err}</p> : null}
    </form>
  );
}
