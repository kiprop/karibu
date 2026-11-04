'use client';

import { useState } from 'react';
import { Btn, Card, Empty, ErrorNote, NoAccess, PageHead, ago, api, useLoad, useReason, useStaff, when } from '../../ui';

type Report = {
  id: string; category: string; body: string; contact: string | null; subject: string | null; status: string; resolution: string | null; createdAt: string; resolvedAt: string | null;
  listing: string | null; listingId: string | null; listingStatus: string | null; vendor: string | null; vendorId: string | null; vendorSuspended: boolean | null; dueAt: string;
};
type Watch = { id: string; name: string; phone: string | null; reason: string; createdAt: string; addedBy: string | null };
const CAT: Record<string, string> = { safety: 'Safety', scam: 'Scam', overcharged: 'Overcharged', wrong_info: 'Wrong information', other: 'Other' };

function Sla({ due }: { due: string }) {
  const ms = new Date(due).getTime() - Date.now();
  const h = Math.abs(ms) / 3600e3;
  const t = h < 1 ? `${Math.round(h * 60)} m` : h < 48 ? `${Math.floor(h)} h ${Math.round((h % 1) * 60)} m` : `${Math.round(h / 24)} d`;
  return <span className={`sla ${ms < 0 ? 'bad' : h < 2 ? 'warn' : ''}`}>{ms < 0 ? `Overdue ${t}` : `Due in ${t}`}</span>;
}

export default function ReportsPage() {
  const { can, toast, refresh } = useStaff();
  const [status, setStatus] = useState<'open' | 'triaged' | 'actioned' | 'dismissed'>('open');
  const allowed = can('reports.view');
  const { data, err, reload } = useLoad<{ reports: Report[] }>(allowed ? `/admin/reports?status=${status}` : null);
  const watch = useLoad<{ watchlist: Watch[] }>(allowed ? '/admin/watchlist' : null);
  const reason = useReason();
  const [w, setW] = useState({ name: '', phone: '', reason: '' });
  const [wErr, setWErr] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;

  const done = (t: string) => { toast(t); reload(); refresh(); };
  const resolve = (r: Report, to: 'triaged' | 'actioned' | 'dismissed') =>
    reason.ask({
      title: { triaged: 'Mark as being handled', actioned: 'Mark as actioned', dismissed: 'Dismiss report' }[to],
      label: to === 'triaged' ? 'What are you doing about it? (optional)' : 'What happened? (recorded)', min: to === 'triaged' ? 0 : 5, cta: 'Save',
      run: async (txt) => { await api(`/admin/reports/${r.id}`, { body: { status: to, resolution: txt || undefined } }); done('Report updated'); },
    });

  return (
    <>
      <PageHead crumb="Trust and safety" title="Reports and safety"
        desc="Scams and safety: within 4 hours. Everything else: within 2 days. Taking a listing down is immediate; a country lead then confirms or reverses it."
        actions={<div className="seg" role="group" aria-label="Status">{(['open', 'triaged', 'actioned', 'dismissed'] as const).map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'triaged' ? 'Being handled' : s[0].toUpperCase() + s.slice(1)}</button>)}</div>} />
      <ErrorNote err={err} />
      <Card className="todo">
        {!data ? <Empty>Loading…</Empty> : data.reports.length === 0 ? <Empty>No {status === 'open' ? 'open ' : ''}reports.</Empty> : (
          <ul>
            {data.reports.map((r) => {
              const urgent = r.category === 'safety' || r.category === 'scam';
              const overdue = new Date(r.dueAt) < new Date();
              return (
                <li key={r.id}>
                  <span className={`stripe ${urgent ? (overdue ? 'bad' : 'warn') : 'ok'}`} />
                  <span>
                    <span className="row" style={{ gap: 6 }}><span className={`chip ${urgent ? 'bad' : ''}`}>{CAT[r.category] ?? r.category}</span><span className="t">{r.listing ?? r.subject ?? 'No business named'}</span></span>
                    <span className="s" style={{ marginTop: 4, color: 'var(--ink)' }}>{r.body}</span>
                    <span className="s">{ago(r.createdAt)}{r.vendor ? ` · ${r.vendor}` : ''}{r.contact ? ` · contact: ${r.contact}` : ''}{r.listingStatus === 'suspended' ? ' · listing suspended' : ''}{r.resolution ? ` · ${r.resolution}` : ''}{r.resolvedAt ? ` · closed ${when(r.resolvedAt)}` : ''}</span>
                  </span>
                  <span className="row" style={{ justifyContent: 'flex-end', maxWidth: 360 }}>
                    {status === 'open' || status === 'triaged' ? <Sla due={r.dueAt} /> : null}
                    {r.listingId && r.listingStatus === 'live' ? (
                      <Btn kind="sm danger" perm="listing.suspend" onClick={() => reason.ask({ title: `Take down “${r.listing}”`, cta: 'Take down now', run: async (txt) => {
                        const out = await api<{ needsConfirm: boolean }>(`/admin/listings/${r.listingId}/suspend`, { body: { reason: txt } });
                        done(out.needsConfirm ? 'Listing taken down. A country lead will confirm.' : 'Listing taken down');
                      } })}>Take down listing</Btn>
                    ) : null}
                    {r.vendorId && !r.vendorSuspended ? (
                      <Btn kind="sm" perm="vendor.suspend" onClick={() => reason.ask({ title: `Suspend ${r.vendor}`, label: 'Why? A verified business needs a second approval.', cta: 'Suspend business', run: async (txt) => {
                        const out = await api<{ status?: string }>(`/admin/vendors/${r.vendorId}/suspend`, { body: { suspended: true, reason: txt } });
                        done(out.status === 'awaiting_second_approval' ? 'Sent for second approval' : 'Business suspended');
                      } })}>Suspend business</Btn>
                    ) : null}
                    {!r.listingId && r.subject ? <Btn kind="sm" perm="reports.act" onClick={() => { setW({ name: r.subject ?? '', phone: '', reason: r.body.slice(0, 200) }); document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth' }); }}>Add to watchlist</Btn> : null}
                    {status === 'open' ? <Btn kind="sm" perm="reports.act" onClick={() => resolve(r, 'triaged')}>Handling it</Btn> : null}
                    {status === 'open' || status === 'triaged' ? (
                      <>
                        <Btn kind="sm primary" perm="reports.act" onClick={() => resolve(r, 'actioned')}>Actioned</Btn>
                        <Btn kind="sm ghost" perm="reports.act" onClick={() => resolve(r, 'dismissed')}>Dismiss</Btn>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={<span id="watch">Operator watchlist</span>} meta="Travellers see these in “Check an operator”">
        {can('reports.act') ? (
          <form className="pad row" style={{ alignItems: 'flex-end', borderBottom: '1px solid var(--line2)' }} onSubmit={async (e) => {
            e.preventDefault();
            setWErr(null);
            try {
              await api('/admin/watchlist', { body: { name: w.name, phone: w.phone || undefined, reason: w.reason } });
              setW({ name: '', phone: '', reason: '' });
              toast('Added to the watchlist');
              watch.reload();
            } catch (x) { setWErr((x as Error).message); }
          }}>
            <div style={{ flex: '1 1 180px' }}><label className="f" htmlFor="wn">Name used</label><input id="wn" className="in" required value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></div>
            <div style={{ flex: '1 1 150px' }}><label className="f" htmlFor="wp">Phone (optional)</label><input id="wp" className="in" placeholder="+2547…" value={w.phone} onChange={(e) => setW({ ...w, phone: e.target.value })} /></div>
            <div style={{ flex: '3 1 260px' }}><label className="f" htmlFor="wr">Why (travellers see this)</label><input id="wr" className="in" required value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })} /></div>
            <button className="btn primary">Add</button>
            {wErr ? <p className="err" style={{ flexBasis: '100%' }}>{wErr}</p> : null}
          </form>
        ) : null}
        <div className="tbl">
          <table>
            <thead><tr><th>Name or number</th><th>Why</th><th>Added</th><th className="r" /></tr></thead>
            <tbody>
              {(watch.data?.watchlist ?? []).map((x) => (
                <tr key={x.id}>
                  <td><b>{x.name}</b>{x.phone ? <span className="sub mono">{x.phone}</span> : null}</td>
                  <td>{x.reason}</td>
                  <td className="num">{ago(x.createdAt)}{x.addedBy ? <span className="sub">{x.addedBy}</span> : null}</td>
                  <td className="r"><Btn kind="sm ghost" perm="reports.act" onClick={() => reason.ask({ title: `Remove ${x.name} from the watchlist`, cta: 'Remove', run: async () => { await api(`/admin/watchlist/${x.id}`, { method: 'DELETE' }); toast('Removed'); watch.reload(); } })}>Remove</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {reason.node}
    </>
  );
}
