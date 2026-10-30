'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { shortDate } from '@/lib/format';

type Report = { id: string; category: string; body: string; contact: string | null; subject: string | null; status: string; createdAt: string; listing: string | null; listingId: string | null; vendor: string | null; vendorId: string | null; dueAt: string };
const TABS = ['open', 'triaged', 'actioned', 'dismissed'] as const;

export default function Reports() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('open');
  const [rows, setRows] = useState<Report[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); call<{ reports: Report[] }>(`/admin/reports?status=${tab}`).then((r) => setRows(r.reports)).catch((e) => setErr(e.message)); }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function act(r: Report, status: 'triaged' | 'actioned' | 'dismissed') {
    const resolution = status === 'triaged' ? undefined : prompt('Resolution note (what was done)') ?? undefined;
    await call(`/admin/reports/${r.id}`, { body: { status, resolution } });
    load();
  }
  async function suspend(r: Report) {
    if (!r.listingId) return;
    const reason = `Suspended after report: ${r.category}`;
    await call(`/admin/listings/${r.listingId}/suspend`, { body: { reason } });
    await call(`/admin/reports/${r.id}`, { body: { status: 'actioned', resolution: 'Listing suspended pending investigation' } });
    load();
  }

  return (
    <div className="container-k py-8">
      <Link href="/admin" className="text-[14px] font-bold text-muted">Review queue</Link>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Reports</h1>
      <p className="text-muted">Safety and scam reports are due within 4 hours; everything else within 2 days.</p>
      <div className="mt-4 flex gap-2">{TABS.map((t) => <button key={t} className={`pill ${tab === t ? 'pill-on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {err ? <p className="mt-4 text-danger">{err}</p> : null}
      <div className="mt-6 flex flex-col gap-3">
        {rows === null ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No {tab} reports.</p> : rows.map((r) => {
          const late = tab === 'open' && new Date(r.dueAt) < new Date();
          return (
            <article key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className={`chip ${['safety', 'scam'].includes(r.category) ? 'bg-danger-soft text-danger' : ''}`}>{r.category}</span>
                <span className="text-muted">{shortDate(r.createdAt)}</span>
                {late ? <span className="chip bg-danger text-white">Overdue</span> : null}
              </div>
              <p className="mt-2 whitespace-pre-line">{r.body}</p>
              <p className="mt-2 text-[14px] text-muted">
                {r.listing ? <>About <b>{r.listing}</b> by {r.vendor}. </> : r.subject ? <>About {r.subject}. </> : null}
                {r.contact ? <>Reporter contact: {r.contact}</> : 'Anonymous'}
              </p>
              {tab === 'open' || tab === 'triaged' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tab === 'open' ? <button className="btn-outline h-9" onClick={() => act(r, 'triaged')}>Mark triaged</button> : null}
                  {r.listingId ? <button className="btn-dark h-9" onClick={() => suspend(r)}>Suspend listing</button> : null}
                  <button className="btn-outline h-9" onClick={() => act(r, 'actioned')}>Resolved</button>
                  <button className="btn-ghost h-9" onClick={() => act(r, 'dismissed')}>Dismiss</button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
