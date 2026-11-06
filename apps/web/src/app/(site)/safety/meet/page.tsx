'use client';

import { Page, SideCard } from '@/components/Page';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';

export default function MeetSafely() {
  const [who, setWho] = useState('');
  const [where, setWhere] = useState('');
  const [when, setWhen] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const plan = `My plan: meeting ${who || '[name]'} at ${where || '[place]'}, ${when || '[time]'}.${checkIn ? ` I'll message you by ${checkIn}. If you don't hear from me, call me.` : ''}`;

  async function share(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (navigator.share) await navigator.share({ text: plan });
      else {
        await navigator.clipboard.writeText(plan);
        setMsg('Copied. Paste it to someone you trust.');
      }
    } catch {
      setMsg('Copy the text below and send it to someone you trust.');
    }
  }

  return (
    <Page crumbs={[{ label: 'Travel smart', href: '/safety' }, { label: 'Meet safely' }]} title="Meet safely"
      desc="Meeting someone you know only from online? Tell someone your plan before you go."
      aside={<>
        <SideCard title="Quick rules">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
            <li>Meet in public; don’t go to a private home or hotel room on a first meeting.</li>
            <li>Don’t share banking details or send money to someone you met online.</li>
            <li>Keep your phone charged and share your live location.</li>
            <li>If it feels wrong, leave and go to the nearest police station. Emergency: <b className="text-ink">999</b> or <b className="text-ink">112</b>.</li>
          </ul>
        </SideCard>
        <p className="px-1 text-[12.5px] text-muted">Karibu has no dating features. This page only helps you plan a safe meeting.</p>
      </>}>
      <div className="flex gap-3 rounded-xl bg-danger-soft p-4 text-[14.5px]">
        <Icon name="sos" className="shrink-0 text-danger" />
        <span>Kenyan police have warned that robberies are being set up through dating apps and social media, and that newly arrived foreigners are targeted. Meet in busy public places and tell someone your plan.</span>
      </div>
      <form onSubmit={share} className="card flex flex-col gap-3 p-5">
        <h2 className="section-title">Share my plan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="m-who">Meeting</label><input id="m-who" className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="First name and how you met" /></div>
          <div><label className="label" htmlFor="m-where">Where (a busy public place)</label><input id="m-where" className="input" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Café or restaurant, area" /></div>
          <div><label className="label" htmlFor="m-when">When</label><input id="m-when" className="input" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Fri 7 pm" /></div>
          <div><label className="label" htmlFor="m-check">I’ll check in by</label><input id="m-check" className="input" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} placeholder="9:30 pm" /></div>
        </div>
        <p className="rounded-lg bg-soft p-3 text-[14px]">{plan}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary"><Icon name="share" size={18} />Share with a trusted contact</button>
          <Link href="/explore?category=transport" className="btn-outline"><Icon name="car" size={18} />Find a verified ride home</Link>
        </div>
        {msg ? <p role="status" className="text-[14px] font-semibold">{msg}</p> : null}
      </form>
    </Page>
  );
}
