'use client';

import { useState } from 'react';
import { call } from '@/lib/client-api';
import { Page, SideCard, Steps } from '@/components/Page';
import { Done } from '@/components/bits';

const crumbs = [{ label: 'Share', href: '/share' }, { label: 'Recommend a business' }];

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
  const aside = (
    <SideCard title="What happens next">
      <Steps items={[<>Our field team <b>contacts the business</b> and invites them to list free.</>, <>They go through the <b>same checks</b> as everyone else before appearing.</>, <>We never tell them who recommended them.</>]} />
    </SideCard>
  );
  return (
    <Page crumbs={crumbs} title="Recommend a business" desc="Had great service from a driver, guide, camp or fundi? Tell us and we’ll invite them to get verified." aside={aside}>
      {sent ? (
        <Done title="Thanks for the tip">Our field team will contact the business and verify it before it can appear on Karibu.</Done>
      ) : (
        <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
          <div><label className="label" htmlFor="b">Business or person</label><input id="b" required className="input" value={f.business} onChange={set('business')} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="c">Their phone or WhatsApp (optional)</label><input id="c" className="input" value={f.contact} onChange={set('contact')} /></div>
            <div><label className="label" htmlFor="ci">Where</label><input id="ci" className="input" value={f.city} onChange={set('city')} placeholder="e.g. Naivasha" /></div>
          </div>
          <div><label className="label" htmlFor="w">Why you recommend them</label><textarea id="w" className="input min-h-[110px] py-2" value={f.why} onChange={set('why')} /></div>
          <button className="btn-primary self-start">Send recommendation</button>
          {err ? <p role="alert" className="text-danger">{err}</p> : null}
        </form>
      )}
    </Page>
  );
}
