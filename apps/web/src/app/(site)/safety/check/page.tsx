'use client';

import { Breadcrumbs } from '@/components/Breadcrumbs';
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
    <div className="container-k max-w-2xl py-10">
      <Breadcrumbs items={[{ label: 'Travel smart', href: '/safety' }, { label: 'Check an operator' }]} />
      <h1 className="mt-3 font-display text-3xl font-extrabold">Check an operator</h1>
      <p className="mt-2 text-muted">About to pay a safari company, hotel agent or guide? Check them first. Works for any business, including ones we don’t list.</p>
      <form onSubmit={check} className="mt-6 flex flex-col gap-2">
        <label htmlFor="op" className="label">Business name, phone number or licence number</label>
        <div className="flex gap-2">
          <input id="op" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Savanna Tours or +254 7…" />
          <button className="btn-dark" disabled={busy}>{busy ? 'Checking…' : 'Check'}</button>
        </div>
      </form>
      {err ? <p role="alert" className="mt-3 text-danger">{err}</p> : null}
      <div aria-live="polite">
        {res && s ? (
          <div className={`mt-6 flex flex-col gap-3 rounded-2xl p-5 ${s.box}`}>
            <h2 className="flex items-center gap-2 text-xl font-extrabold"><Icon name={s.icon} />{s.title}</h2>
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
      <div className="mt-8 flex gap-3 rounded-2xl bg-amber-soft p-4 text-[15px]">
        <Icon name="cash" className="text-amber" />
        <span><strong>Never pay a personal mobile money number</strong> for a booking you can’t verify. Real operators give a business till or paybill number and a written confirmation.</span>
      </div>
    </div>
  );
}
