'use client';

import { Page, SideCard } from '@/components/Page';
import Link from 'next/link';
import { useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';
import { LEVEL_LABEL } from '@/lib/types';
import { shortDate } from '@/lib/format';

type Result = {
  result: 'watchlist' | 'verified' | 'listed_unverified' | 'not_found';
  watchlist: { name: string; reason: string } | null;
  matches: { name: string; slug: string; level: number; verifiedAt: string | null; suspended: boolean; current: boolean; hasPublicListings: boolean }[];
};

const STYLE = {
  verified: { box: 'bg-teal-soft', icon: 'shield', title: 'Verified by Karibu' },
  listed_unverified: { box: 'bg-amber-soft', icon: 'clock', title: 'Known to us, not yet verified' },
  not_found: { box: 'bg-danger-soft', icon: 'sos', title: 'Not found on Karibu' },
  watchlist: { box: 'bg-danger-soft', icon: 'sos', title: 'On our scam watchlist' },
} as const;

export default function CheckOperator() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function check(e?: React.FormEvent, q = query) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      setRes(await call<Result>(`/operators/check?query=${encodeURIComponent(q.trim())}`));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = res ? STYLE[res.result] : null;
  return (
    <Page crumbs={[{ label: 'Travel smart', href: '/safety' }, { label: 'Check an operator' }]} title="Check an operator"
      desc="About to pay a safari company, hotel agent or guide? Check them first. Works for any business, including ones we don’t list."
      aside={<>
        <SideCard title="Never pay a personal number" tone="warn">
          <p className="text-muted">Don’t send mobile money to a personal number for a booking you can’t verify. Real operators give a business till or paybill number and a written confirmation.</p>
        </SideCard>
        <SideCard title="Signs of a scam">
          <ul className="flex list-disc flex-col gap-1 pl-4 text-muted">
            <li>A price far below everyone else’s</li>
            <li>Pressure to pay a deposit today</li>
            <li>No licence number, or one that doesn’t match the name</li>
            <li>Only reachable on WhatsApp, with no business address</li>
          </ul>
          <Link href="/safety/prices" className="mt-2 inline-block font-semibold text-brand">Check what others paid</Link>
        </SideCard>
      </>}>
      <form onSubmit={check} className="card flex flex-col gap-2 p-5">
        <label htmlFor="op" className="label">Business name, phone number or licence number</label>
        <div className="flex gap-2">
          <input id="op" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Savanna Tours or +254 7…" />
          <button className="btn-dark" disabled={busy}>{busy ? 'Checking…' : 'Check'}</button>
        </div>
      </form>
      {err ? <p role="alert" className="text-danger">{err}</p> : null}
      <div aria-live="polite">
        {res && s ? (
          <div className={`flex flex-col gap-3 rounded-xl p-5 ${s.box}`}>
            <h2 className="section-title flex items-center gap-2"><Icon name={s.icon} />{s.title}</h2>
            {res.result === 'watchlist' && res.watchlist ? <p><strong>{res.watchlist.name}:</strong> {res.watchlist.reason}</p> : null}
            {res.result === 'verified' ? (
              <ul className="flex flex-col gap-2">
                {res.matches.filter((m) => m.level >= 1).map((m) => (
                  <li key={m.slug}><strong>{m.name}</strong> · {LEVEL_LABEL[m.level]}{m.verifiedAt ? `, verified ${shortDate(m.verifiedAt)}` : ''}{m.hasPublicListings ? <> · <Link className="font-bold underline" href={`/explore?q=${encodeURIComponent(m.name)}`}>see listings</Link></> : null}</li>
                ))}
                <li className="text-[14px]">Check the name and number match exactly; scammers copy real business names.</li>
              </ul>
            ) : null}
            {res.result === 'listed_unverified' ? <p>We know of this business but haven’t finished checking it. Wait for verification or choose a verified alternative.</p> : null}
            {res.result === 'not_found' ? <p>No verified business matches this. That doesn’t prove it’s a scam, but don’t pay until you can confirm a tourism licence and a business payment account in the company’s name.</p> : null}
            {res.result !== 'verified' ? <Link href={`/report?subject=${encodeURIComponent(query)}&category=scam`} className="btn-outline self-start">Report this business</Link> : null}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
