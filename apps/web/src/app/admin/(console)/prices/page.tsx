'use client';

import { useState } from 'react';
import { Btn, Card, Empty, ErrorNote, NoAccess, PageHead, ago, api, fmt, useLoad, useReason, useStaff } from '../../ui';

type P = {
  id: string; item: string; amount: number; currency: string; unit: string | null; area: string | null; paidOn: string; feel: string | null; note: string | null; isExample: boolean;
  hiddenReason: string | null; createdAt: string; city: string; listing: string | null; median: number | null; reports: number | null; signedIn: boolean;
};
const VIEWS = [['outliers', 'Outliers'], ['recent', 'Recent'], ['hidden', 'Hidden']] as const;
const FEEL: Record<string, [string, string]> = { fair: ['Fair', 'ok'], high: ['A bit high', 'warn'], ripoff: ['Overcharged', 'bad'] };

export default function PricesPage() {
  const { can, toast } = useStaff();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('outliers');
  const allowed = can('prices.moderate');
  const { data, err, reload } = useLoad<{ reports: P[] }>(allowed ? `/admin/price-reports?view=${view}` : null);
  const reason = useReason();
  if (!allowed) return <NoAccess />;
  return (
    <>
      <PageHead crumb="Fair prices" title="Price reports"
        desc="“I paid this much” reports from travellers. Outliers are over double, or under half, the usual price. Overcharge reports stay out of the usual range but warn others."
        actions={<div className="seg" role="group" aria-label="Show">{VIEWS.map(([k, t]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{t}</button>)}</div>} />
      <ErrorNote err={err} />
      <Card>
        {!data ? <Empty>Loading…</Empty> : data.reports.length === 0 ? <Empty>{view === 'outliers' ? 'No outliers right now.' : 'Nothing here.'}</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Report</th><th className="r">Paid</th><th className="r">Usual</th><th>Signals</th><th className="r">Action</th></tr></thead>
              <tbody>
                {data.reports.map((r) => {
                  const ratio = r.median ? r.amount / r.median : null;
                  return (
                    <tr key={r.id}>
                      <td style={{ maxWidth: 420 }}><b>{r.item}</b><span className="sub">{r.listing ?? r.area ?? ''}{r.listing || r.area ? ' · ' : ''}{r.city} · paid {ago(r.paidOn)}</span>{r.note ? <span className="sub">“{r.note}”</span> : null}</td>
                      <td className="r num">{r.currency} {fmt(r.amount)}{r.unit ? <span className="sub">{r.unit}</span> : null}</td>
                      <td className="r num">{r.median ? `${r.currency} ${fmt(r.median)}` : '—'}{r.reports ? <span className="sub">{r.reports} reports</span> : null}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          {ratio && (ratio >= 2 || ratio <= 0.5) ? <span className={`chip ${ratio >= 2 ? 'bad' : 'warn'}`}>{ratio.toFixed(1)}× usual</span> : null}
                          {r.feel ? <span className={`chip ${FEEL[r.feel][1]}`}>{FEEL[r.feel][0]}</span> : null}
                          {r.isExample ? <span className="chip">Example data</span> : null}
                          {r.signedIn ? <span className="chip">Signed in</span> : <span className="chip">Guest</span>}
                          {r.hiddenReason ? <span className="chip">Hidden: {r.hiddenReason}</span> : null}
                        </div>
                      </td>
                      <td className="r">
                        {view === 'hidden' ? (
                          <Btn kind="sm" perm="prices.moderate" onClick={async () => { await api(`/admin/price-reports/${r.id}`, { body: { hidden: false } }); toast('Restored'); reload(); }}>Restore</Btn>
                        ) : (
                          <Btn kind="sm" perm="prices.moderate" onClick={() => reason.ask({ title: 'Hide this price', label: 'Why? For example: likely typo, wrong currency, personal details.', min: 3, cta: 'Hide', run: async (txt) => { await api(`/admin/price-reports/${r.id}`, { body: { hidden: true, reason: txt } }); toast('Hidden'); reload(); } })}>Hide</Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {reason.node}
    </>
  );
}
