'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';
import { ExperienceCard } from '@/components/ExperienceCard';
import { TRAVELLER_TYPE_LABEL, type Experience } from '@/lib/types';

type Props = {
  slug: string;
  vendorName: string;
  rating: number | null;
  count: number;
  recommendYes: number;
  recommendAnswers: number;
  contactedCount: number;
  breakdown: Record<string, number>;
  travellerTypes: { type: string; n: number }[];
  mentions: { word: string; count: number }[];
  initial: Experience[];
  settle: boolean;
};
type Filters = { rating?: number; type?: string; q?: string; sort: 'recent' | 'highest' | 'lowest' | 'helpful' };

/** Summary, rating bars, filters, popular mentions, search, sort, helpful votes and paging, like the best review sites. */
export function ExperiencesPanel(p: Props) {
  const [f, setF] = useState<Filters>({ sort: 'recent' });
  const [items, setItems] = useState<Experience[]>(p.initial);
  const [total, setTotal] = useState(p.count);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const first = useRef(true);
  const who = p.settle ? 'people' : 'travellers';

  async function load(next: Filters, pg = 1) {
    setBusy(true);
    const qs = new URLSearchParams({ sort: next.sort, page: String(pg) });
    if (next.rating) qs.set('rating', String(next.rating));
    if (next.type) qs.set('type', next.type);
    if (next.q) qs.set('q', next.q);
    try {
      const r = await call<{ total: number; experiences: Experience[] }>(`/listings/${p.slug}/experiences?${qs}`);
      setTotal(r.total);
      setItems(pg === 1 ? r.experiences : (x) => [...x, ...r.experiences]);
      setPage(pg);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    load(f);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const filtered = !!(f.rating || f.type || f.q);
  const max = Math.max(1, ...Object.values(p.breakdown));
  const pct = p.recommendAnswers ? Math.round((p.recommendYes / p.recommendAnswers) * 100) : null;

  return (
    <section id="experiences" className="scroll-mt-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold">{p.settle ? 'Experiences' : 'Traveller experiences'}</h2>
        <Link href={`/share/experience?listing=${p.slug}`} className="btn-primary"><Icon name="star" size={18} />Share your experience</Link>
      </div>

      {p.count === 0 ? (
        <p className="mt-3 rounded-2xl bg-soft p-5 text-[15px]">
          No experiences yet. Used this business? Your rating and what you paid help the next person decide, and avoid paying more than they should.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 rounded-2xl border border-line p-5 md:grid-cols-[220px_1fr]">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-extrabold">{p.rating != null ? p.rating.toFixed(1) : '–'}</span>
              <span className="text-muted">/ 5</span>
            </div>
            <div className="mt-1 flex text-star" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`text-xl ${p.rating != null && p.rating >= i - 0.25 ? '' : 'opacity-25'}`}>★</span>)}</div>
            <p className="mt-1 text-[14px] text-muted">{p.count} {p.count === 1 ? 'experience' : 'experiences'}{p.count < 3 ? ' · average shows from 3' : ''}</p>
            {pct != null ? <p className="mt-3 text-[15px]"><strong className="text-teal">{pct}%</strong> would recommend it</p> : null}
            {p.contactedCount ? <p className="mt-1 text-[13px] text-muted">{p.contactedCount} from {who} who contacted them through Karibu</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = p.breakdown[n] ?? 0;
              const on = f.rating === n;
              return (
                <button key={n} type="button" disabled={!c} onClick={() => set({ rating: on ? undefined : n })} aria-pressed={on}
                  className={`grid grid-cols-[80px_1fr_32px] items-center gap-3 rounded-lg px-2 py-1 text-left text-[14px] ${on ? 'bg-brand-soft' : 'hover:bg-soft'} disabled:cursor-default disabled:hover:bg-transparent`}>
                  <span className="font-semibold">{['', 'Terrible', 'Poor', 'Average', 'Very good', 'Excellent'][n]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-soft"><span className="block h-full rounded-full bg-star" style={{ width: `${(c / max) * 100}%` }} /></span>
                  <span className="text-right tabular-nums text-muted">{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {p.count > 0 ? (
        <div className="mt-5 flex flex-col gap-3">
          {p.travellerTypes.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-muted">Who went:</span>
              {p.travellerTypes.map((t) => (
                <button key={t.type} type="button" className={`pill ${f.type === t.type ? 'pill-on' : ''}`} onClick={() => set({ type: f.type === t.type ? undefined : t.type })}>
                  {TRAVELLER_TYPE_LABEL[t.type] ?? t.type} <span className="opacity-70">({t.n})</span>
                </button>
              ))}
            </div>
          ) : null}
          {p.mentions.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-muted">Popular mentions:</span>
              {p.mentions.map((m) => (
                <button key={m.word} type="button" className={`pill ${f.q === m.word ? 'pill-on' : ''}`} onClick={() => { const q = f.q === m.word ? undefined : m.word; setSearch(q ?? ''); set({ q }); }}>
                  {m.word}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: search.trim().length >= 2 ? search.trim() : undefined }); }}>
              <label htmlFor="exp-q" className="sr-only">Search experiences</label>
              <input id="exp-q" className="input h-10" placeholder="Search experiences, e.g. hot water, deposit, on time" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button className="btn-outline h-10"><Icon name="search" size={16} /><span className="sr-only">Search</span></button>
            </form>
            <label htmlFor="exp-sort" className="sr-only">Sort</label>
            <select id="exp-sort" className="input h-10 w-auto py-0" value={f.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
              <option value="recent">Most recent</option>
              <option value="helpful">Most helpful</option>
              <option value="highest">Highest rated</option>
              <option value="lowest">Lowest rated</option>
            </select>
          </div>
          {filtered ? (
            <p className="text-[14px]" role="status">
              {total} {total === 1 ? 'experience matches' : 'experiences match'}.{' '}
              <button type="button" className="font-bold text-brand underline" onClick={() => { setSearch(''); setF({ sort: f.sort }); }}>Clear filters</button>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={`mt-4 flex flex-col gap-4 ${busy ? 'opacity-60' : ''}`}>
        {items.map((e) => <ExperienceCard key={e.id} e={e} vendorName={p.vendorName} helpful />)}
      </div>
      {items.length < total ? (
        <button type="button" className="btn-outline mt-4" disabled={busy} onClick={() => load(f, page + 1)}>{busy ? 'Loading…' : `Show more (${total - items.length})`}</button>
      ) : null}
    </section>
  );
}
