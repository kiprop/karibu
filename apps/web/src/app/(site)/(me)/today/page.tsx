'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { loadProfile, localChecklist, profileQuery, saveProfile, type Profile } from '@/lib/companion';
import { useSession } from '@/components/Session';
import { AreaHead, Panel } from '@/components/RailShell';
import { CompanionSetup } from '@/components/CompanionSetup';
import { Suggestions } from '@/components/Suggestions';
import { Icon } from '@/components/Icon';

type Step = { key: string; group: string; title: string; why: string; action?: { label: string; href: string; external?: boolean }; done: boolean };
type C = {
  today: string; phase: 'planning' | 'arriving_soon' | 'here' | 'home_again' | 'moving_soon' | 'settling'; daysToGo: number | null;
  city: { name: string; slug: string } | null;
  plan: { today: { id: string; timeLabel: string | null; note: string | null; slug: string | null; title: string | null; city: string | null; whatsapp: string | null; trip: string; tripId: string }[]; next: { day: string; timeLabel: string | null; note: string | null; slug: string | null; title: string | null; trip: string; tripId: string }[] };
  advisories: { id: string; message: string; city: string | null }[];
  howWasIt: { enquiryId: string; ref: string; contactedAt: string; slug: string; title: string; vendor: string }[];
  seasons: { note: string; kind: string; city: string | null }[];
  emergency: { kind: string; label: string; value: string }[];
  fairPrices: { item: string; low: number; high: number; currency: string; city: string }[];
  checklist: { title: string; steps: Step[]; saved: boolean };
};

const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function headline(c: C, p: Profile) {
  const where = c.city?.name ?? 'Kenya';
  switch (c.phase) {
    case 'arriving_soon': return { t: c.daysToGo === 0 ? `Welcome to ${where}` : `${c.daysToGo} day${c.daysToGo === 1 ? '' : 's'} to go`, s: 'Here’s what to sort out before you land, and what to know when you do.' };
    case 'planning': return { t: c.daysToGo ? `Your trip starts in ${c.daysToGo} days` : 'Plan your trip', s: 'Save places, build a day-by-day plan, and we’ll remind you what to do before you fly.' };
    case 'here': {
      const n = p.arrivingOn ? Math.floor((Date.parse(c.today) - Date.parse(p.arrivingOn)) / 864e5) + 1 : null;
      return { t: n ? `Day ${n} in ${where}` : `In ${where}`, s: 'Your plan for today, fair prices, and help if you need it.' };
    }
    case 'home_again': return { t: 'Welcome home', s: 'Tell the next traveller how it went. Your experiences and prices help them most.' };
    case 'moving_soon': return { t: c.daysToGo ? `Moving in ${c.daysToGo} days` : 'Moving home', s: 'Your first-month plan: get connected, find a home, set it up, settle in.' };
    default: return { t: `Settling into ${where}`, s: 'Your first-month plan, with verified homes and services for each step.' };
  }
}

export default function TodayPage() {
  const { me } = useSession();
  const signedIn = !!me.user;
  const [p, setP] = useState<Profile | null>(null);
  const [c, setC] = useState<C | null>(null);
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState({ item: 'Airport taxi to Westlands', amount: '' });

  const load = useCallback(async (prof: Profile) => {
    const r = await call<C>(`/companion?${signedIn ? '' : profileQuery(prof)}`);
    if (!signedIn) {
      const done = new Set(localChecklist());
      r.checklist.steps = r.checklist.steps.map((s) => ({ ...s, done: done.has(s.key) }));
    }
    setC(r);
  }, [signedIn]);

  useEffect(() => {
    loadProfile(signedIn).then((prof) => {
      setP(prof);
      setEditing(!prof.mode && !prof.arrivingOn);
      load(prof);
    });
  }, [signedIn, load]);

  if (!p || !c) return <div className="p-6"><div className="h-8 w-64 animate-pulse rounded bg-soft" /><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="h-40 animate-pulse rounded-xl bg-soft" /><div className="h-40 animate-pulse rounded-xl bg-soft" /></div></div>;
  const h = headline(c, p);
  const steps = c.checklist.steps;
  const done = steps.filter((s) => s.done).length;
  const nextSteps = steps.filter((s) => !s.done).slice(0, 3);
  const dial = (v: string) => v.replace(/\s/g, '');

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      <AreaHead crumb={`Today · ${day(c.today)}`} title={h.t} desc={h.s}
        actions={!editing ? <button className="btn-outline h-9 min-h-0 text-[13px]" onClick={() => setEditing(true)}><Icon name="cal" size={15} />{p.arrivingOn || p.mode ? 'Edit trip details' : 'Add trip details'}</button> : null} />

      {editing ? (
        <Panel title="Tell your companion about this trip" meta="Takes 20 seconds">
          <CompanionSetup initial={p} onCancel={p.mode || p.arrivingOn ? () => setEditing(false) : undefined}
            onSave={async (np) => { await saveProfile(signedIn, np); setP(np); setEditing(false); await load(np); }} />
        </Panel>
      ) : null}

      {c.advisories.map((a) => (
        <div key={a.id} role="status" className="flex gap-2.5 rounded-xl border border-line border-l-[3px] border-l-amber bg-panel p-3 text-[14px]">
          <Icon name="flag" size={16} className="mt-0.5 shrink-0 text-amber" /><span><b>Advisory{a.city ? ` · ${a.city}` : ''}:</b> {a.message}</span>
        </div>
      ))}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Quick help">
        {[
          ['chat', 'Ask Karibu', 'Prices, scams, entry, places', '/ask'],
          ['tag', 'Is this price fair?', 'Check a quote in seconds', '/safety/prices'],
          ['shield', 'Check an operator', 'Before you pay a deposit', '/safety/check'],
          ['sos', 'Emergency card', 'Works offline', '/safety/emergency'],
        ].map(([icon, t, s, href]) => (
          <Link key={t} href={href} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3 hover:border-muted/40">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={icon} size={18} /></span>
            <span><span className="block text-[14px] font-semibold">{t}</span><span className="block text-[12.5px] text-muted">{s}</span></span>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {c.phase === 'here' || c.plan.today.length || c.plan.next.length ? (
            <Panel title="Your plan" meta={signedIn ? <Link className="text-brand" href="/trips">All trips</Link> : 'Sign in to plan by day'} pad={false}>
              {!signedIn ? (
                <div className="p-4 text-[14px]"><Link href="/signin?next=/today" className="font-semibold text-brand">Sign in</Link> to build a day-by-day plan and see it here each morning.</div>
              ) : c.plan.today.length === 0 && c.plan.next.length === 0 ? (
                <div className="p-4 text-[14px] text-muted">Nothing planned yet. Add places to a trip from any listing.</div>
              ) : (
                <ul className="divide-y divide-line/70">
                  {c.plan.today.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="w-16 shrink-0 text-[12px] font-semibold text-brand">{i.timeLabel ?? 'Today'}</span>
                      <span className="min-w-0 flex-1">
                        {i.slug ? <Link href={`/listing/${i.slug}`} className="font-semibold hover:underline">{i.title}</Link> : <span className="font-semibold">{i.note}</span>}
                        <span className="block text-[12.5px] text-muted">{[i.city, i.trip].filter(Boolean).join(' · ')}</span>
                      </span>
                      {i.whatsapp ? <a className="btn-outline h-8 min-h-0 px-3 text-[12.5px]" href={`https://wa.me/${i.whatsapp.replace('+', '')}`} target="_blank" rel="noopener">WhatsApp</a> : null}
                    </li>
                  ))}
                  {c.plan.next.map((i, n) => (
                    <li key={n} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                      <span className="w-16 shrink-0 text-[12px] text-muted">{day(i.day)}</span>
                      <span className="min-w-0 flex-1 truncate">{i.slug ? <Link href={`/listing/${i.slug}`} className="hover:underline">{i.title}</Link> : i.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {c.howWasIt.length ? (
            <Panel title="How was it?" meta="Your experience helps the next traveller">
              <div className="flex flex-col gap-2">
                {c.howWasIt.map((h2) => (
                  <div key={h2.enquiryId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2.5">
                    <span className="text-[14px]">You messaged <b>{h2.title}</b> <span className="text-muted">({h2.ref})</span></span>
                    <Link href={`/share/experience?listing=${h2.slug}`} className="btn-primary h-8 min-h-0 px-3 text-[13px]">Share how it went</Link>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel title={c.checklist.title} meta={`${done} of ${steps.length} done`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-teal" style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} /></div>
            <ul className="mt-3 flex flex-col gap-2">
              {nextSteps.map((s) => (
                <li key={s.key} className="flex items-start gap-2.5 text-[14px]">
                  <span className="mt-1 h-4 w-4 shrink-0 rounded border border-line" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="font-medium">{s.title}</span><span className="block text-[12.5px] text-muted">{s.why}</span></span>
                  {s.action ? <a href={s.action.href} target={s.action.external ? '_blank' : undefined} rel={s.action.external ? 'noopener' : undefined} className="shrink-0 text-[13px] font-semibold text-brand">{s.action.label}</a> : null}
                </li>
              ))}
              {nextSteps.length === 0 ? <li className="text-[14px] text-teal">All done. Enjoy Kenya.</li> : null}
            </ul>
            <Link href="/plan" className="mt-3 inline-block text-[13px] font-semibold text-brand">Open the full plan →</Link>
          </Panel>

          <Suggestions title="Suggested for you" compact limit={6} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Is this price fair?" meta="Before you agree a price">
            <form action="/safety/prices" className="flex flex-col gap-2" onSubmit={(e) => {
              e.preventDefault();
              location.href = `/safety/prices?city=${c.city?.slug ?? 'nairobi'}&item=${encodeURIComponent(quote.item)}&amount=${quote.amount}#check`;
            }}>
              <input className="input" aria-label="What is it?" value={quote.item} onChange={(e) => setQuote({ ...quote, item: e.target.value })} />
              <div className="flex gap-2">
                <input className="input" aria-label="Price in KES" inputMode="numeric" placeholder="Price in KES" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value.replace(/\D/g, '') })} />
                <button className="btn-primary shrink-0" disabled={!quote.amount}>Check</button>
              </div>
            </form>
            {c.fairPrices.map((f) => (
              <p key={f.item} className="mt-2 text-[13px] text-muted">{f.item}, {f.city}: usually <b className="text-ink">{f.currency} {f.low.toLocaleString()}–{f.high.toLocaleString()}</b></p>
            ))}
          </Panel>

          {c.seasons.length ? (
            <Panel title="For your dates" meta="Typical patterns">
              <ul className="flex flex-col gap-2.5">
                {c.seasons.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px]">
                    <Icon name={s.kind === 'weather' ? 'mtn' : s.kind === 'busy' ? 'people' : 'binoculars'} size={16} className="mt-0.5 shrink-0 text-brand" />
                    <span>{s.city ? <b>{s.city}: </b> : null}{s.note}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Emergency" meta={<Link href="/safety/emergency" className="text-brand">Full card</Link>}>
            <ul className="grid grid-cols-2 gap-2">
              {c.emergency.map((e) => (
                <li key={e.label}><a href={`tel:${dial(e.value)}`} className="flex flex-col rounded-lg bg-danger-soft px-3 py-2 text-danger"><span className="text-[20px] font-bold tabular-nums">{e.value}</span><span className="text-[12px]">{e.label}</span></a></li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
