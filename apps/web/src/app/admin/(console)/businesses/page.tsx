'use client';

import { useState } from 'react';
import { Btn, CATEGORY, Card, Empty, ErrorNote, LockedNote, NoAccess, PageHead, ago, api, countryName, fmt, useLoad, useReason, useStaff } from '../../ui';

type Biz = {
  id: string; name: string; slug: string; country: string; level: number; plan: string; suspended: boolean; createdAt: string; reverifyDue: string | null; isSample: boolean | null;
  live: number; inReview: number; enquiries30: number; city: string | null; categories: string | null;
};
type Rec = { id: string; business: string; contact: string | null; city: string | null; why: string | null; createdAt: string };
const LEVEL = ['Not verified', 'Contact verified (L1)', 'Licensed (L2)', 'Visited (L3)'];
const FILTERS = [['all', 'All'], ['live', 'Live'], ['review', 'In review'], ['none', 'Nothing live'], ['suspended', 'Suspended']] as const;

export default function BusinessesPage() {
  const { can, toast } = useStaff();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>('all');
  const allowed = can('businesses.view');
  const { data, err, reload } = useLoad<{ businesses: Biz[] }>(allowed ? `/admin/businesses?status=${status}${q.trim().length > 1 ? `&q=${encodeURIComponent(q.trim())}` : ''}` : null);
  const recs = useLoad<{ recommendations: Rec[] }>(allowed ? '/admin/recommendations' : null);
  const reason = useReason();
  if (!allowed) return <NoAccess />;
  const list = data?.businesses ?? [];

  return (
    <>
      <PageHead crumb="Growth" title="Businesses"
        desc="Find, invite and support businesses. Verification status shows here but is decided only by the verification team."
        actions={<input type="search" className="in" style={{ width: 260 }} placeholder="Search businesses" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search businesses" />} />
      <ErrorNote err={err} />
      {can('businesses.support') && !can('queue.decide') ? <LockedNote>Business support can’t approve, reject or suspend, and a plan never changes verification. This keeps “verification can’t be bought” true inside the team.</LockedNote> : null}
      <div className="tabs" role="tablist">{FILTERS.map(([k, t]) => <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)}>{t}</button>)}</div>
      <Card>
        {!data ? <Empty>Loading…</Empty> : list.length === 0 ? <Empty>No businesses match.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Business</th><th>Verification</th><th>Plan</th><th className="r">Live</th><th className="r">Enquiries (30 d)</th><th className="r">Action</th></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b> {b.isSample ? <span className="chip">Sample</span> : null}<span className="sub">{(b.categories ?? '').split(',').filter(Boolean).map((c) => CATEGORY[c] ?? c).join(', ') || 'No listings yet'}{b.city ? ` · ${b.city}` : ''} · {countryName(b.country)} · joined {ago(b.createdAt)}</span></td>
                    <td>{b.suspended ? <span className="chip bad">Suspended</span> : <span className={`chip ${b.level >= 2 ? 'ok' : b.level === 1 ? 'blue' : ''}`}>{LEVEL[b.level]}</span>}{b.inReview ? <span className="sub">{b.inReview} in review</span> : null}{b.reverifyDue ? <span className="sub">Re-check {new Date(b.reverifyDue) < new Date() ? 'overdue' : `due ${new Date(b.reverifyDue).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}</span> : null}</td>
                    <td style={{ textTransform: 'capitalize' }}>{b.plan}</td>
                    <td className="r num">{b.live}</td>
                    <td className="r num">{fmt(b.enquiries30)}</td>
                    <td className="r">
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        <a className="btn sm ghost" href={`/b/${b.slug}`} target="_blank" rel="noopener">Public page ↗</a>
                        {b.suspended ? (
                          <Btn kind="sm" perm="suspension.confirm" onClick={() => reason.ask({ title: `Restore ${b.name}`, cta: 'Restore', run: async (r) => { await api(`/admin/vendors/${b.id}/suspend`, { body: { suspended: false, reason: r } }); toast('Restored'); reload(); } })}>Restore</Btn>
                        ) : (
                          <Btn kind="sm danger" perm="vendor.suspend" why="Trust and safety, country leads and Owners suspend businesses" onClick={() => reason.ask({ title: `Suspend ${b.name}`, label: 'Why? Suspending a verified business needs a second approval.', cta: 'Suspend', run: async (r) => {
                            const out = await api<{ status?: string }>(`/admin/vendors/${b.id}/suspend`, { body: { suspended: true, reason: r } });
                            toast(out.status === 'awaiting_second_approval' ? 'Sent for second approval' : 'Suspended');
                            reload();
                          } })}>Suspend</Btn>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Recommended by travellers" meta="Businesses people want on Karibu: invite them">
        {!recs.data ? <Empty>Loading…</Empty> : recs.data.recommendations.length === 0 ? <Empty>No recommendations yet.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Business</th><th>Contact</th><th>Why</th><th>When</th></tr></thead>
              <tbody>
                {recs.data.recommendations.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.business}</b>{r.city ? <span className="sub">{r.city}</span> : null}</td>
                    <td className="mono">{r.contact ?? '—'}</td>
                    <td style={{ maxWidth: 380 }}>{r.why ?? '—'}</td>
                    <td className="num">{ago(r.createdAt)}</td>
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
