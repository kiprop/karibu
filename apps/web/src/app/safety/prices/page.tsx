import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { shortDate } from '@/lib/format';
import { FairCheck } from './FairCheck';

export const metadata = { title: 'Fair prices' };

type Checked = { group: string; item: string; area: string | null; currency: string; low: number; high: number; checkedOn: string; isExample: boolean };
type Community = { item: string; group: string; unit: string | null; currency: string; reports: number; typicalReports: number; p25: number | null; median: number | null; p75: number | null; minAmount: number; maxAmount: number; ripoffShare: number; lastPaid: string; hasExamples: boolean };
type Recent = { id: string; item: string; amount: number; currency: string; unit: string | null; area: string | null; paidOn: string; feel: 'fair' | 'high' | 'ripoff' | null; negotiated: boolean | null; note: string | null; isExample: boolean; listingTitle: string | null; listingSlug: string | null };
type Board = { city: { slug: string; name: string; currency: string }; prices: Checked[]; community: Community[]; recent: Recent[]; minReports: number };
type City = { slug: string; name: string };

const GROUP_LABEL: Record<string, string> = {
  food: 'Food', drink: 'Drinks', transport: 'Getting around', stay: 'Stays', activity: 'Activities', shopping: 'Shopping', other: 'Other',
  home: 'Furniture and home', services: 'Home services', utilities: 'Internet and utilities', grooming: 'Hair and grooming',
};
const FEEL: Record<string, { t: string; cls: string }> = {
  fair: { t: 'Felt fair', cls: 'bg-teal-soft text-teal' },
  high: { t: 'Felt high', cls: 'bg-amber-soft text-amber' },
  ripoff: { t: 'Overcharged', cls: 'bg-danger-soft text-danger' },
};

export default async function Prices({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city = 'nairobi' } = await searchParams;
  let board: Board;
  try {
    board = await api<Board>(`/cities/${encodeURIComponent(city)}/prices`, { revalidate: 0 });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { cities } = await api<{ cities: City[] }>('/cities?country=KE');
  const cur = board.city.currency;
  const groups = ['food', 'transport', 'other'].map((g) => ({ g, rows: board.prices.filter((p) => p.group === g) })).filter((x) => x.rows.length);
  const max = Math.max(1, ...board.prices.map((p) => p.high));
  const items = [...new Set([...board.prices.map((p) => p.item), ...board.community.map((c) => c.item)])].sort();
  const examples = board.prices.some((p) => p.isExample) || board.community.some((c) => c.hasExamples);

  return (
    <div className="container-k max-w-3xl py-10">
      <Link href="/safety" className="inline-flex items-center gap-1 text-[14px] font-bold text-muted"><Icon name="back" size={16} />Travel smart</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold">Fair prices in {board.city.name}</h1>
        <form className="flex items-center gap-2">
          <label htmlFor="city" className="sr-only">City</label>
          <select id="city" name="city" defaultValue={board.city.slug} className="input h-10 w-auto py-0">
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <button className="btn-outline h-10">Go</button>
        </form>
      </div>
      <p className="mt-2 text-muted">
        Know the going rate before you’re quoted a “mzungu price”. We show what our team checked in person and what travellers say they actually paid. Asking the price first is normal and expected.
      </p>
      {examples ? (
        <p className="mt-4 rounded-xl bg-amber-soft p-3 text-[14px] text-amber"><strong>Includes example figures.</strong> Sample prices and reports are here so you can see how this works. They are replaced by real checks and reports before launch.</p>
      ) : null}

      <div className="mt-6"><FairCheck city={board.city.slug} currency={cur} items={items} /></div>

      <Link href={`/safety/prices/add?city=${board.city.slug}`} className="mt-6 flex items-center justify-between gap-4 rounded-[20px] p-5 text-white media-stay">
        <span>
          <strong className="block font-display text-2xl">I paid this much</strong>
          <span className="text-[15px] opacity-95">Share what you paid for a meal, ride, tour or souvenir. It takes 20 seconds, no account needed.</span>
        </span>
        <Icon name="plus" size={30} />
      </Link>

      {groups.length ? <h2 className="mt-10 font-display text-2xl font-extrabold">Checked by our team</h2> : null}
      {groups.map(({ g, rows }) => (
        <section key={g} className="mt-4">
          <h3 className="eyebrow">{g === 'food' ? 'Food and drink' : g === 'transport' ? 'Getting around' : 'Other'}</h3>
          <ul className="card mt-2 divide-y divide-line px-4">
            {rows.map((p) => (
              <li key={p.item} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-3">
                <strong>{p.item}</strong>
                <span className="text-right font-extrabold tabular-nums">{p.currency} {p.low.toLocaleString()}–{p.high.toLocaleString()}</span>
                <span className="text-[12px] text-muted">{p.area ?? ''}{p.area ? ' · ' : ''}checked {shortDate(p.checkedOn)}</span>
                <span />
                <span className="relative col-span-2 h-2 rounded-full bg-soft" aria-hidden="true">
                  <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-teal to-star" style={{ left: `${(p.low / max) * 100}%`, width: `${Math.max(((p.high - p.low) / max) * 100, 2)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2 className="mt-10 font-display text-2xl font-extrabold">What travellers paid</h2>
      <p className="mt-1 text-[14px] text-muted">
        The usual range leaves out prices travellers flagged as overcharging. Ranges need at least {board.minReports} reports; below that we show early reports.
      </p>
      {board.community.length === 0 ? (
        <p className="mt-4 text-muted">No traveller reports here yet. Be the first.</p>
      ) : (
        <ul className="card mt-4 divide-y divide-line px-4">
          {board.community.map((c) => {
            const typical = c.typicalReports >= board.minReports && c.p25 != null && c.p75 != null;
            return (
              <li key={c.item + c.currency} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0">
                  <strong>{c.item}</strong>
                  <span className="block text-[12px] text-muted">
                    {GROUP_LABEL[c.group] ?? c.group}{c.unit ? ` · ${c.unit}` : ''} · {c.reports} {c.reports === 1 ? 'report' : 'reports'} · last {shortDate(c.lastPaid)}
                  </span>
                  {c.ripoffShare >= 0.2 ? (
                    <span className="chip mt-1 bg-danger-soft text-danger">{Math.round(c.ripoffShare * 100)}% reported being overcharged</span>
                  ) : null}
                </span>
                <span className="text-right">
                  {typical ? (
                    <>
                      <span className="block font-extrabold tabular-nums">{c.currency} {c.p25!.toLocaleString()}–{c.p75!.toLocaleString()}</span>
                      <span className="block text-[12px] text-muted">usually · median {c.median!.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      <span className="block font-bold tabular-nums">{c.currency} {c.minAmount.toLocaleString()}{c.maxAmount !== c.minAmount ? `–${c.maxAmount.toLocaleString()}` : ''}</span>
                      <span className="block text-[12px] text-muted">early reports</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {board.recent.length ? (
        <>
          <h2 className="mt-10 font-display text-2xl font-extrabold">Latest reports</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {board.recent.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{r.item}</strong>
                  <span className="font-extrabold tabular-nums">{r.currency} {r.amount.toLocaleString()}{r.unit ? <span className="font-normal text-muted"> {r.unit}</span> : null}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  {r.feel ? <span className={`chip ${FEEL[r.feel].cls}`}>{FEEL[r.feel].t}</span> : null}
                  {r.negotiated ? <span className="chip">Negotiated</span> : null}
                  {r.isExample ? <span className="chip bg-amber-soft text-amber">Example</span> : null}
                  <span>{r.listingSlug ? <Link className="font-bold underline" href={`/listing/${r.listingSlug}`}>{r.listingTitle}</Link> : r.area}{(r.listingSlug || r.area) ? ' · ' : ''}paid {shortDate(r.paidOn)}</span>
                </div>
                {r.note ? <p className="mt-2 text-[15px]">“{r.note}”</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <section className="mt-10 rounded-2xl bg-soft p-5">
        <h2 className="font-display text-xl font-extrabold">Avoiding the mzungu price</h2>
        <ul className="mt-2 list-disc pl-5 leading-relaxed">
          <li>Ask the price before you eat, ride or take the item. Agree it out loud.</li>
          <li>Small notes help. Paying with a large note invites “no change”.</li>
          <li>Prices with a written menu or an app quote are harder to inflate.</li>
          <li>Market sellers expect bargaining. Starting at about half is normal; staying friendly matters more.</li>
          <li>If you were badly overcharged by a business on Karibu, <Link className="font-bold underline" href="/report?category=overcharged">report it</Link>. Repeated reports affect its listing.</li>
        </ul>
      </section>
    </div>
  );
}
