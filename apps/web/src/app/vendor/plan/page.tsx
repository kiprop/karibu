'use client';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { Icon } from '@/components/Icon';

type Plan = { code: 'free' | 'pro' | 'featured'; name: string; monthlyUsd: number; maxListings: number; features: string[] };

export default function Plans() {
  const { me } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [early, setEarly] = useState(true);
  const [current, setCurrent] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    call<{ plans: Plan[]; earlyAccess: boolean }>('/plans').then((r) => { setPlans(r.plans); setEarly(r.earlyAccess); });
    if (me.vendors?.length) call<{ vendor: { plan: { code: string } } }>('/vendor/me').then((r) => setCurrent(r.vendor.plan.code)).catch(() => {});
  }, [me.vendors]);

  async function choose(code: string) {
    setMsg(null);
    try {
      const r = await call<{ plan?: string; checkoutUrl?: string; earlyAccess?: boolean }>('/vendor/subscription', { body: { plan: code } });
      if (r.checkoutUrl) location.href = r.checkoutUrl;
      else {
        setCurrent(r.plan ?? code);
        setMsg(r.earlyAccess ? 'Done. Paid plans are free during early access.' : 'Plan updated.');
      }
    } catch (x) {
      setMsg((x as Error).message);
    }
  }

  return (
    <div className="container-k py-10">
      <Breadcrumbs items={[{ label: me.vendors?.length ? 'My business' : 'For businesses', href: '/vendor' }, { label: 'Plans' }]} />
      <h1 className="mt-3 font-display text-4xl font-extrabold">Plans for businesses</h1>
      <p className="mt-2 max-w-2xl text-muted">Verification is free on every plan and can’t be bought. Paid plans add listings, tools and labelled visibility. Karibu never takes commission or handles traveller payments.</p>
      {early ? <p className="mt-4 inline-flex rounded-xl bg-teal-soft px-3 py-2 font-semibold text-teal">All plans are free during early access.</p> : null}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <section key={p.code} className={`card flex flex-col gap-3 p-6 ${p.code === 'pro' ? 'border-2 border-brand' : ''}`}>
            {p.code === 'pro' ? <span className="chip self-start bg-brand-soft text-brand">Most popular</span> : null}
            <h2 className="font-display text-2xl font-extrabold">{p.name}</h2>
            <div><span className="text-4xl font-extrabold">${p.monthlyUsd}</span> <span className="text-muted">{p.monthlyUsd ? 'per month' : 'forever'}</span></div>
            <ul className="flex flex-col gap-1.5 text-[15px]">
              {p.features.map((f) => <li key={f} className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 text-teal" strokeWidth={3} />{f}</li>)}
            </ul>
            <div className="mt-auto pt-3">
              {me.vendors?.length ? (
                current === p.code ? <span className="btn-outline w-full cursor-default">Current plan</span> : <button className="btn-primary w-full" onClick={() => choose(p.code)}>Choose {p.name}</button>
              ) : (
                <Link href={me.user ? '/vendor' : '/signin?for=business&next=/vendor'} className="btn-primary w-full">Get started</Link>
              )}
            </div>
          </section>
        ))}
      </div>
      {msg ? <p role="status" className="mt-6 font-semibold">{msg}</p> : null}
      <p className="mt-8 text-[14px] text-muted">Local currency prices are set per country. Payments for plans go through a licensed payment provider by card or mobile money.</p>
    </div>
  );
}
