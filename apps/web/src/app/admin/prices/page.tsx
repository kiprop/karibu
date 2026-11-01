'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { shortDate } from '@/lib/format';

type Row = {
  id: string; item: string; amount: number; currency: string; unit: string | null; area: string | null; paidOn: string; feel: string | null;
  note: string | null; isExample: boolean; hiddenReason: string | null; createdAt: string; city: string; listing: string | null; median: number | null; reports: number | null; signedIn: boolean;
};
const VIEWS = [['outliers', 'Outliers'], ['recent', 'Recent'], ['hidden', 'Hidden']] as const;

export default function PriceModeration() {
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('outliers');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); call<{ reports: Row[] }>(`/admin/price-reports?view=${view}`).then((r) => setRows(r.reports)).catch((e) => setErr(e.message)); }, [view]);
  useEffect(() => { load(); }, [load]);

  async function toggle(r: Row, hidden: boolean) {
    const reason = hidden ? prompt('Why hide this? (for example: outlier, personal details, spam)') : undefined;
    if (hidden && !reason) return;
    try {
      await call(`/admin/price-reports/${r.id}`, { body: { hidden, reason: reason ?? undefined } });
      load();
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="container-k py-8">
      <Link href="/admin" className="text-[14px] font-bold text-muted">Review queue</Link>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Price reports</h1>
      <p className="text-muted">Outliers are reports more than double, or less than half, the usual price for that item. Hide spam, mistakes and notes with personal details.</p>
      <div className="mt-4 flex gap-2">{VIEWS.map(([v, t]) => <button key={v} className={`pill ${view === v ? 'pill-on' : ''}`} onClick={() => setView(v)}>{t}</button>)}</div>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div className="card mt-6 divide-y divide-line">
        {rows === null ? <p className="p-4 text-muted">Loading…</p> : rows.length === 0 ? <p className="p-4 text-muted">Nothing here.</p> : rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-bold">{r.item} <span className="font-extrabold tabular-nums">{r.currency} {r.amount.toLocaleString()}</span>{r.unit ? <span className="text-muted"> {r.unit}</span> : null}</div>
              <div className="text-[13px] text-muted">
                {r.city}{r.listing ? ` · ${r.listing}` : r.area ? ` · ${r.area}` : ''} · paid {shortDate(r.paidOn)} · {r.signedIn ? 'signed in' : 'guest'}
                {r.median ? ` · usual median ${r.median.toLocaleString()} from ${r.reports}` : ''}
                {r.feel ? ` · felt ${r.feel}` : ''}{r.isExample ? ' · example' : ''}
              </div>
              {r.note ? <p className="mt-1 text-[15px]">“{r.note}”</p> : null}
              {r.hiddenReason ? <p className="mt-1 text-[13px] text-danger">Hidden: {r.hiddenReason}</p> : null}
            </div>
            {view === 'hidden'
              ? <button className="btn-outline h-9" onClick={() => toggle(r, false)}>Restore</button>
              : <button className="btn-ghost h-9 text-danger" onClick={() => toggle(r, true)}>Hide</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
