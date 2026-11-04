'use client';

import { useState } from 'react';
import { Btn, Card, Empty, ErrorNote, NoAccess, PageHead, ago, api, useLoad, useReason, useStaff } from '../../ui';

type Review = {
  id: string; rating: number; recommend: boolean | null; body: string | null; createdAt: string; hiddenReason: string | null; contacted: boolean;
  travellerType: string | null; listing: string; listingSlug: string; vendor: string; personalDetails: boolean;
};
const VIEWS = [['flagged', 'Flagged'], ['recent', 'Recent'], ['low', '1–2 stars'], ['hidden', 'Hidden']] as const;
const TYPE: Record<string, string> = { solo: 'Solo', couple: 'Couple', family: 'Family', friends: 'Friends', business: 'Business', long_stay: 'Long stay', moving_home: 'Moving home' };

export default function ExperiencesPage() {
  const { can, toast } = useStaff();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('flagged');
  const allowed = can('reviews.moderate');
  const { data, err, reload } = useLoad<{ reviews: Review[] }>(allowed ? `/admin/reviews?view=${view}` : null);
  const reason = useReason();
  if (!allowed) return <NoAccess />;
  return (
    <>
      <PageHead crumb="Trust and safety" title="Experiences"
        desc="Hide personal details, abuse and clear fakes. Never hide an experience for being negative; the business can reply publicly."
        actions={<div className="seg" role="group" aria-label="Show">{VIEWS.map(([k, t]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{t}</button>)}</div>} />
      <ErrorNote err={err} />
      <Card>
        {!data ? <Empty>Loading…</Empty> : data.reviews.length === 0 ? <Empty>{view === 'flagged' ? 'Nothing flagged. Flags appear for phone numbers or emails in the text, and for bursts of posts about one listing.' : 'Nothing here.'}</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Experience</th><th>Signals</th><th className="r">Action</th></tr></thead>
              <tbody>
                {data.reviews.map((r) => (
                  <tr key={r.id}>
                    <td style={{ maxWidth: 560 }}>
                      <b><span style={{ color: '#E8A010' }}>{'★'.repeat(r.rating)}</span><span className="muted">{'★'.repeat(5 - r.rating)}</span> {r.listing}</b>
                      <span className="sub">{r.vendor} · {ago(r.createdAt)}</span>
                      {r.body ? <span style={{ display: 'block', marginTop: 4 }}>{r.body}</span> : null}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {r.personalDetails ? <span className="chip bad">Personal details in text</span> : null}
                        {r.contacted ? <span className="chip ok">Contacted via Karibu</span> : null}
                        {r.travellerType ? <span className="chip">{TYPE[r.travellerType] ?? r.travellerType}</span> : null}
                        {r.recommend === false ? <span className="chip warn">Doesn’t recommend</span> : null}
                        {r.hiddenReason ? <span className="chip">Hidden: {r.hiddenReason}</span> : null}
                      </div>
                    </td>
                    <td className="r">
                      {view === 'hidden' ? (
                        <Btn kind="sm" perm="reviews.moderate" onClick={async () => { await api(`/admin/reviews/${r.id}`, { body: { hidden: false } }); toast('Restored'); reload(); }}>Restore</Btn>
                      ) : (
                        <Btn kind="sm danger" perm="reviews.moderate" onClick={() => reason.ask({ title: 'Hide this experience', label: 'Why? For example: personal details, abuse, fake, not a real visit.', min: 3, cta: 'Hide', run: async (txt) => { await api(`/admin/reviews/${r.id}`, { body: { hidden: true, reason: txt } }); toast('Hidden'); reload(); } })}>Hide</Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {reason.node}
    </>
  );
}
