import { Page, SideCard } from '@/components/Page';
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

export default async function Prices({ searchParams }: { searchParams: Promise<{ city?: string; item?: string; amount?: string }> }) {
  const { city = 'nairobi', item: qItem, amount: qAmount } = await searchParams;
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
    <Page crumbs={[{ label: 'Travel smart', href: '/safety' }, { label: 'Fair prices' }]} title={`Fair prices in ${board.city.name}`}
      desc="Know the going rate before you’re quoted a “mzungu price”. We show what our team checked in person and what travellers say they actually paid. Asking the price first is normal and expected."
      actions={
        <form className="flex items-center gap-2">
          <label htmlFor="city" className="sr-only">City</label>
          <select id="city" name="city" defaultValue={board.city.slug} className="input h-10 w-auto py-0">
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <button className="btn-outline h-10">Go</button>
        </form>
      }
      aside={<>
        <Link href={`/safety/prices/add?city=${board.city.slug}`} className="group flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/50 p-4 hover:border-brand">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-white"><Icon name="plus" size={20} /></span>
          <span className="min-w-0">
            <strong className="block text-[15px] group-hover:underline">I paid this much</strong>
            <span className="text-[13px] text-muted">A meal, ride, tour or souvenir. 20 seconds, no account needed.</span>
          </span>
        </Link>
        <SideCard title="Avoiding the mzungu price">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
            <li>Ask the price before you eat, ride or take the item. Agree it out loud.</li>
            <li>Small notes help. A large note invites “no change”.</li>
            <li>A written menu or an app quote is harder to inflate.</li>
            <li>Market sellers expect bargaining. Starting at about half is normal; staying friendly matters more.</li>
            <li>Badly overcharged by a business on Karibu? <Link className="font-semibold text-brand" href="/report?category=overcharged">Report it</Link>.</li>
          </ul>
        </SideCard>
      </>}>
      {examples ? (
        <p className="rounded-xl bg-amber-soft p-3 text-[14px] text-amber"><strong>Includes example figures.</strong> Sample prices and reports are here so you can see how this works. They are replaced by real checks and reports before launch.</p>
      ) : null}

      <div id="check" className="scroll-mt-20"><FairCheck city={board.city.slug} currency={cur} items={items} initialItem={qItem?.slice(0, 80)} initialAmount={qAmount?.replace(/\D/g, '').slice(0, 9)} /></div>

      {groups.length ? <h2 className="section-title -mb-3">Checked by our team</h2> : null}
      {groups.map(({ g, rows }) => (
        <section key={g}>
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

      <div className="-mb-2">
      <h2 className="section-title">What travellers paid</h2>
      <p className="mt-1 text-[14px] text-muted">
        The usual range leaves out prices travellers flagged as overcharging. Ranges need at least {board.minReports} reports; below that we show early reports.
      </p>
      </div>
      {board.community.length === 0 ? (
        <p className="text-muted">No traveller reports here yet. Be the first.</p>
      ) : (
        <ul className="card divide-y divide-line px-4">
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
          <h2 className="section-title -mb-3">Latest reports</h2>
          <ul className="flex flex-col gap-3">
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

    </Page>
  );
}
