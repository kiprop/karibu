import Link from 'next/link';
import { api } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { shortDate } from '@/lib/format';

export const metadata = { title: 'Fair prices' };

type P = { group: string; item: string; area: string | null; currency: string; low: number; high: number; checkedOn: string; isExample: boolean };

export default async function Prices({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city = 'nairobi' } = await searchParams;
  const { prices } = await api<{ prices: P[] }>(`/cities/${city}/prices`);
  const groups = ['food', 'transport', 'other'].map((g) => ({ g, rows: prices.filter((p) => p.group === g) })).filter((x) => x.rows.length);
  const max = Math.max(1, ...prices.map((p) => p.high));
  const examples = prices.some((p) => p.isExample);
  return (
    <div className="container-k max-w-3xl py-10">
      <Link href="/safety" className="inline-flex items-center gap-1 text-[14px] font-bold text-muted"><Icon name="back" size={16} />Travel smart</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Fair prices in {city[0].toUpperCase() + city.slice(1)}</h1>
      <p className="mt-2 text-muted">What locals typically pay, checked by our team in person. Ask the price before you order or ride; it’s normal and expected.</p>
      {examples ? (
        <p className="mt-4 rounded-xl bg-amber-soft p-3 text-[14px] text-amber"><strong>Example figures, not yet checked.</strong> They will be replaced by the field team’s dated price checks before launch.</p>
      ) : null}
      {groups.map(({ g, rows }) => (
        <section key={g} className="mt-8">
          <h2 className="eyebrow">{g === 'food' ? 'Food and drink' : g === 'transport' ? 'Getting around' : 'Other'}</h2>
          <ul className="mt-2 card divide-y divide-line px-4">
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
      <Link href={`/report?category=overcharged&subject=${encodeURIComponent('Overcharged in ' + city)}`} className="btn-outline mt-8">I paid much more than this</Link>
    </div>
  );
}
