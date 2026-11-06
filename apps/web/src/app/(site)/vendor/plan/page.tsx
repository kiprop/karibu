'use client';

import { Page } from '@/components/Page';
import { Area, AreaHead } from '@/components/RailShell';
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

  const title = 'Plans for businesses';
  const desc = 'Verification is free on every plan and can’t be bought. Paid plans add listings, tools and labelled visibility. Karibu never takes commission or handles traveller payments.';
  const Frame = ({ children }: { children: React.ReactNode }) => me.vendors?.length ? (
    <Area><AreaHead crumbs={[{ label: 'My business', href: '/vendor' }, { label: 'Plans' }]} title={title} desc={desc} />{children}</Area>
  ) : (
    <Page crumbs={[{ label: 'For businesses', href: '/vendor' }, { label: 'Plans' }]} title={title} desc={desc}>{children}</Page>
  );

  return (
    <Frame>
      {early ? <p className="inline-flex self-start rounded-lg bg-teal-soft px-3 py-2 text-[14px] font-semibold text-teal">All plans are free during early access.</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <section key={p.code} className={`card flex flex-col gap-3 p-6 ${p.code === 'pro' ? 'border-brand ring-1 ring-brand' : ''}`}>
            {p.code === 'pro' ? <span className="chip self-start bg-brand-soft text-brand">Most popular</span> : null}
            <h2 className="text-[22px] font-semibold tracking-tight">{p.name}</h2>
            <div><span className="text-4xl font-semibold tracking-tight">${p.monthlyUsd}</span> <span className="text-muted">{p.monthlyUsd ? 'per month' : 'forever'}</span></div>
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
      {msg ? <p role="status" className="font-semibold">{msg}</p> : null}
      <p className="text-[14px] text-muted">Local currency prices are set per country. Payments for plans go through a licensed payment provider by card or mobile money.</p>
    </Frame>
  );
}
