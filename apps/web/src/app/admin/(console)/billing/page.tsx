'use client';

import { useState } from 'react';
import { Btn, Card, Empty, ErrorNote, Modal, NoAccess, PageHead, Stat, api, fmt, useLoad, useStaff, when } from '../../ui';

type Billing = {
  plans: { code: string; name: string; monthlyUsd: number; businesses: number }[];
  subscriptions: { id: string; vendorId: string; vendor: string; plan: string; status: string; provider: string; periodEnd: string | null; createdAt: string }[];
  mrrUsd: number;
  earlyAccess: boolean;
};
type Biz = { id: string; name: string; plan: string };

export default function BillingPage() {
  const { can, toast } = useStaff();
  const allowed = can('billing.view');
  const { data, err, reload } = useLoad<Billing>(allowed ? '/admin/billing' : null);
  const [change, setChange] = useState<Biz | null>(null);
  const [q, setQ] = useState('');
  const search = useLoad<{ businesses: Biz[] }>(allowed && q.trim().length > 1 ? `/admin/businesses?q=${encodeURIComponent(q.trim())}` : null);
  const [plan, setPlan] = useState('pro');
  const [why, setWhy] = useState('');
  const [mErr, setMErr] = useState<string | null>(null);
  if (!allowed) return <NoAccess />;
  const paid = data?.plans.filter((p) => p.code !== 'free').reduce((t, p) => t + Number(p.businesses), 0) ?? 0;
  const failed = data?.subscriptions.filter((s) => s.status === 'past_due').length ?? 0;

  return (
    <>
      <PageHead crumb="Finance" title="Plans and billing" desc="Businesses pay Karibu for plans only. Karibu never takes payments between travellers and businesses, and a plan never changes verification." />
      <ErrorNote err={err} />
      {data?.earlyAccess ? <div className="banner"><span><b>Early access is on.</b> Businesses can choose a plan without paying. Monthly recurring revenue below shows what the plans would bring in at list price.</span></div> : null}
      <section className="grid g4">
        <Stat k="Monthly recurring (list price)" v={`$${fmt(data?.mrrUsd)}`} d={`$${fmt((data?.mrrUsd ?? 0) * 12)} a year`} />
        {(data?.plans ?? []).filter((p) => p.code !== 'free').map((p) => <Stat key={p.code} k={p.name} v={fmt(p.businesses)} d={`$${p.monthlyUsd} per month`} />)}
        <Stat k="Failed renewals" v={fmt(failed)} d={`${paid} paying businesses`} alert={failed > 0} />
      </section>
      <Card title="Change a business’s plan" meta="For partner pilots, refunds or fixes. Recorded with a reason.">
        <div className="pad stack">
          <input type="search" className="in" style={{ maxWidth: 360 }} placeholder="Find a business" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a business" />
          {search.data?.businesses.slice(0, 8).map((b) => (
            <div key={b.id} className="row" style={{ justifyContent: 'space-between', maxWidth: 560 }}>
              <span><b>{b.name}</b> <span className="chip" style={{ textTransform: 'capitalize' }}>{b.plan}</span></span>
              <Btn kind="sm" perm="billing.manage" onClick={() => { setChange(b); setPlan(b.plan === 'free' ? 'pro' : 'free'); setWhy(''); setMErr(null); }}>Change plan</Btn>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Subscriptions" meta={data ? `${data.subscriptions.length}` : ''}>
        {!data ? <Empty>Loading…</Empty> : data.subscriptions.length === 0 ? <Empty>No paid subscriptions yet.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Business</th><th>Plan</th><th>Status</th><th>Renews</th><th>Provider</th></tr></thead>
              <tbody>
                {data.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.vendor}</b></td>
                    <td style={{ textTransform: 'capitalize' }}>{s.plan}</td>
                    <td><span className={`chip ${s.status === 'active' ? 'ok' : s.status === 'past_due' ? 'bad' : ''}`}>{s.status.replace('_', ' ')}</span></td>
                    <td className="num">{when(s.periodEnd)}</td>
                    <td>{s.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {change ? (
        <Modal title={`Change plan: ${change.name}`} onClose={() => setChange(null)} footer={<>
          <button className="btn" onClick={() => setChange(null)}>Cancel</button>
          <button className="btn primary" disabled={why.trim().length < 5} onClick={async () => {
            try { await api(`/admin/vendors/${change.id}/plan`, { body: { plan, reason: why } }); toast('Plan changed'); setChange(null); reload(); search.reload(); } catch (e) { setMErr((e as Error).message); }
          }}>Change plan</button>
        </>}>
          <div><label className="f" htmlFor="pl">New plan</label><select id="pl" className="in" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="free">Free</option><option value="pro">Pro</option><option value="featured">Featured</option></select></div>
          <div><label className="f" htmlFor="pw">Reason (recorded)</label><textarea id="pw" className="in" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Charged twice by the payment provider; refunded and kept on Pro." /></div>
          {mErr ? <p className="err">{mErr}</p> : null}
        </Modal>
      ) : null}
    </>
  );
}
