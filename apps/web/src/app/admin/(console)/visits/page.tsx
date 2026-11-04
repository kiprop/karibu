'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { Btn, CATEGORY, Card, Empty, ErrorNote, NoAccess, PageHead, api, useLoad, useStaff, when } from '../../ui';

type Visit = {
  id: string; status: string; scheduledFor: string; checklist: Record<string, boolean>; notes: string | null; checkedInAt: string | null; submittedAt: string | null;
  listingId: string; title: string; category: string; isPrivate: boolean; city: string; vendor: string; verifier: string; mine: boolean;
};
const CHECKS: [string, string][] = [
  ['addressMatches', 'Address matches the listing area'],
  ['personMatchesId', 'Owner or host matches the ID on file'],
  ['matchesListing', 'The place matches the listing and photos'],
  ['safeForGuests', 'Safe and suitable for guests'],
];

function VisitForm({ v, onDone }: { v: Visit; onDone: () => void }) {
  const { toast, refresh } = useStaff();
  const [checks, setChecks] = useState<Record<string, boolean>>({ addressMatches: false, personMatchesId: false, matchesListing: false, safeForGuests: false });
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack" style={{ maxWidth: 420 }}>
      {!v.checkedInAt ? (
        <Btn kind="ok" perm="visits.submit" onClick={async () => { try { await api(`/admin/visits/${v.id}/check-in`, { body: {} }); toast('Checked in'); onDone(); } catch (e) { setErr((e as Error).message); } }}>Check in on site</Btn>
      ) : <span className="chip ok">Checked in {when(v.checkedInAt)}</span>}
      {CHECKS.map(([k, t]) => (
        <label key={k} className="row" style={{ gap: 8 }}><input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} /> {t}</label>
      ))}
      <div>
        <label className="f" htmlFor={`n-${v.id}`}>What you saw (required)</label>
        <textarea id={`n-${v.id}`} className="in" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kitchen clean, host Zawadi matches her ID, gate on the main road, parking for 2 cars." />
      </div>
      <Btn kind="primary" perm="visits.submit" disabled={!v.checkedInAt || notes.trim().length < 10} onClick={async () => {
        try { await api(`/admin/visits/${v.id}/submit`, { body: { checklist: checks, notes } }); toast('Visit report sent to the review queue'); refresh(); onDone(); } catch (e) { setErr((e as Error).message); }
      }}>Submit visit report</Btn>
      <p className="footnote" style={{ margin: 0 }}>Untick anything that didn’t check out; the verification team decides. Field verifiers never publish listings.</p>
      {err ? <p className="err">{err}</p> : null}
    </div>
  );
}

export default function VisitsPage() {
  const { can, toast } = useStaff();
  const allowed = can('visits.view', 'visits.submit');
  const { data, err, reload } = useLoad<{ visits: Visit[] }>(allowed ? '/admin/visits' : null);
  const [open, setOpen] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;
  const visits = data?.visits ?? [];
  return (
    <>
      <PageHead crumb="Verification · Level 3" title={can('visits.view') ? 'Field visits' : 'My field visits'}
        desc="A visit proves a place is real and matches its listing. The report goes to the review queue, and a Visited badge still needs a second approval." />
      <ErrorNote err={err} />
      <Card>
        {!data ? <Empty>Loading…</Empty> : visits.length === 0 ? <Empty>No visits booked. {can('visits.assign') ? 'Book one from a listing in the review queue.' : ''}</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>When</th><th>Listing</th><th>Verifier</th><th>Status</th><th className="r" /></tr></thead>
              <tbody>
                {visits.map((v) => (
                  <Fragment key={v.id}>
                    <tr>
                      <td className="num">{when(v.scheduledFor)}</td>
                      <td><b>{v.title}</b><span className="sub">{CATEGORY[v.category] ?? v.category} · {v.city} · {v.vendor}{v.isPrivate ? ' · private home' : ''}</span></td>
                      <td>{v.verifier}</td>
                      <td>{v.status === 'submitted' ? <span className="chip ok">Report sent</span> : v.checkedInAt ? <span className="chip blue">On site</span> : new Date(v.scheduledFor) < new Date() ? <span className="chip warn">Due</span> : <span className="chip">Booked</span>}</td>
                      <td className="r">
                        {v.mine && v.status === 'booked' ? <button className="btn sm primary" onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? 'Close' : 'Open visit'}</button> : null}
                        {!v.mine && v.status === 'booked' ? <Btn kind="sm ghost" perm="visits.assign" onClick={async () => { await api(`/admin/visits/${v.id}/cancel`, { body: {} }); toast('Visit cancelled'); reload(); }}>Cancel</Btn> : null}
                        {v.status === 'submitted' && can('queue.view') ? <Link className="btn sm" href="/admin/queue">Review</Link> : null}
                      </td>
                    </tr>
                    {open === v.id ? <tr><td colSpan={5} style={{ background: 'var(--head)' }}><VisitForm v={v} onDone={() => { reload(); }} /></td></tr> : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
