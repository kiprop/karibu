'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { shortDate } from '@/lib/format';

type Row = { id: string; rating: number; recommend: boolean | null; body: string | null; createdAt: string; hiddenReason: string | null; contacted: boolean; listing: string; vendor: string; email: string | null; phone: string | null };
const VIEWS = [['recent', 'Recent'], ['low', '1 to 2 stars'], ['hidden', 'Hidden']] as const;

export default function ExperienceModeration() {
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('recent');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); call<{ reviews: Row[] }>(`/admin/reviews?view=${view}`).then((r) => setRows(r.reviews)).catch((e) => setErr(e.message)); }, [view]);
  useEffect(() => { load(); }, [load]);

  async function toggle(r: Row, hidden: boolean) {
    const reason = hidden ? prompt('Why hide this? (for example: personal details, abusive, not a real experience)') : undefined;
    if (hidden && !reason) return;
    try {
      await call(`/admin/reviews/${r.id}`, { body: { hidden, reason: reason ?? undefined } });
      load();
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div className="container-k py-8">
      <Link href="/admin" className="text-[14px] font-bold text-muted">Review queue</Link>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Traveller experiences</h1>
      <p className="text-muted">Hide posts with personal details, abuse or clear fakes. Don’t hide a post because it’s negative; businesses can reply instead.</p>
      <div className="mt-4 flex gap-2">{VIEWS.map(([v, t]) => <button key={v} className={`pill ${view === v ? 'pill-on' : ''}`} onClick={() => setView(v)}>{t}</button>)}</div>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div className="card mt-6 divide-y divide-line">
        {rows === null ? <p className="p-4 text-muted">Loading…</p> : rows.length === 0 ? <p className="p-4 text-muted">Nothing here.</p> : rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="font-bold">{'★'.repeat(r.rating)}<span className="text-line">{'★'.repeat(5 - r.rating)}</span> · {r.listing} <span className="font-normal text-muted">({r.vendor})</span></div>
              <div className="text-[13px] text-muted">
                {shortDate(r.createdAt)} · {r.recommend === true ? 'recommends' : r.recommend === false ? 'doesn’t recommend' : 'no answer'} · {r.contacted ? 'contacted via Karibu' : 'not via Karibu'} · by {r.email ?? r.phone ?? 'deleted account'}
              </div>
              {r.body ? <p className="mt-1 text-[15px]">{r.body}</p> : null}
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
