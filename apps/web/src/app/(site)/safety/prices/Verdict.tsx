import Link from 'next/link';
import { Icon } from '@/components/Icon';

export type FairResult = {
  verdict: 'low' | 'fair' | 'high' | 'very_high' | 'unknown';
  typicalLow: number | null;
  typicalHigh: number | null;
  times: number | null;
  currency: string;
  amount?: number;
  checked: { item: string; low: number; high: number } | null;
  community: { item: string; reports: number; typicalReports: number; median: number } | null;
  minReports: number;
};

const STYLE = {
  low: { cls: 'bg-teal-soft text-teal', title: 'Good deal', icon: 'check' },
  fair: { cls: 'bg-teal-soft text-teal', title: 'That’s a fair price', icon: 'check' },
  high: { cls: 'bg-amber-soft text-amber', title: 'A bit above the usual', icon: 'tag' },
  very_high: { cls: 'bg-danger-soft text-danger', title: 'Much higher than usual', icon: 'flag' },
  unknown: { cls: 'bg-soft text-ink', title: 'Not enough prices yet', icon: 'tag' },
} as const;

/** Plain-language result of comparing a price with checked prices and what other travellers paid. */
export function Verdict({ r, amount, reportHref }: { r: FairResult; amount: number; reportHref?: string }) {
  const s = STYLE[r.verdict];
  const n = (x: number) => `${r.currency} ${x.toLocaleString()}`;
  const range = r.typicalLow != null && r.typicalHigh != null ? `${n(r.typicalLow)}–${r.typicalHigh.toLocaleString()}` : null;
  return (
    <div className={`rounded-2xl p-4 ${s.cls}`} role="status">
      <div className="flex items-center gap-2 section-title"><Icon name={s.icon} size={20} />{s.title}</div>
      {r.verdict === 'unknown' ? (
        <p className="mt-1 text-[15px] text-ink">We don’t have enough checked prices or traveller reports for that item here yet. Ask a local what they pay, and add yours so the next traveller knows.</p>
      ) : (
        <div className="mt-1 text-[15px] text-ink">
          <p>
            {n(amount)} compared with a usual {range}.
            {r.verdict === 'very_high' || r.verdict === 'high' ? ` That’s about ${r.times}× the top of the usual range.` : ''}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Based on {[r.checked ? 'our team’s price check' : null, r.community && r.community.typicalReports >= r.minReports ? `${r.community.typicalReports} traveller reports` : null].filter(Boolean).join(' and ')}
            {r.checked && r.checked.item ? ` for “${r.checked.item}”` : r.community ? ` for “${r.community.item}”` : ''}.
          </p>
          {r.verdict === 'high' || r.verdict === 'very_high' ? (
            <ul className="mt-2 list-disc pl-5 text-[14px]">
              <li>It’s normal to ask the price first and to negotiate, politely.</li>
              <li>Ask what’s included. A higher price can be fair if it covers more.</li>
              {reportHref ? <li><Link className="font-bold underline" href={reportHref}>Report a business that overcharged you</Link></li> : null}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
