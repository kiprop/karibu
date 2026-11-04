'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Btn, Card, Empty, ErrorNote, NoAccess, PageHead, ago, api, countryName, useLoad, useReason, useStaff, when } from '../../ui';

type Approval = {
  id: string; kind: 'level3' | 'suspend_vendor' | 'confirm_suspension'; targetId: string; targetLabel: string; country: string | null; reason: string | null; status: string;
  requestedAt: string; requestedBy: string; requestedRole: string; mine: boolean; decidedBy: string | null; decidedAt: string | null; decisionNote: string | null; solo: boolean | null;
};
const KIND: Record<string, { label: string; what: string; perm: string }> = {
  level3: { label: 'Visited (level 3) badge', what: 'Approving publishes the listing with a Visited badge.', perm: 'level3.approve' },
  suspend_vendor: { label: 'Suspend a verified business', what: 'Approving hides every listing from this business.', perm: 'suspension.confirm' },
  confirm_suspension: { label: 'Confirm an emergency suspension', what: 'The listing is already hidden. Approving keeps it hidden; declining puts it back.', perm: 'suspension.confirm' },
};

export default function ApprovalsPage() {
  const { can, toast, refresh } = useStaff();
  const [status, setStatus] = useState<'pending' | 'approved' | 'declined'>('pending');
  const allowed = can('level3.approve', 'suspension.confirm', 'level3.request', 'vendor.suspend', 'listing.suspend');
  const { data, err, reload } = useLoad<{ approvals: Approval[] }>(allowed ? `/admin/approvals?status=${status}` : null);
  const reason = useReason();
  if (!allowed) return <NoAccess />;

  async function decide(a: Approval, decision: 'approve' | 'decline', note?: string) {
    await api(`/admin/approvals/${a.id}`, { body: { decision, note } });
    toast(decision === 'approve' ? 'Second approval given' : 'Declined');
    reload();
    refresh();
  }

  return (
    <>
      <PageHead crumb="Two-person rule" title="Second approvals"
        desc="Decisions that change trust the most need a second person: Visited badges, suspending a verified business, and emergency listing suspensions. Nobody can approve their own request."
        actions={<div className="seg" role="group" aria-label="Show">{(['pending', 'approved', 'declined'] as const).map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>} />
      <ErrorNote err={err} />
      <Card>
        {!data ? <Empty>Loading…</Empty> : data.approvals.length === 0 ? <Empty>{status === 'pending' ? 'Nothing waiting for a second approval.' : 'Nothing here yet.'}</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Decision</th><th>Asked by</th><th>Reason</th><th className="r">{status === 'pending' ? 'Action' : 'Decided'}</th></tr></thead>
              <tbody>
                {data.approvals.map((a) => (
                  <tr key={a.id}>
                    <td><b>{KIND[a.kind].label}</b><span className="sub">{a.kind === 'suspend_vendor' ? a.targetLabel : <Link href="/admin/queue">{a.targetLabel}</Link>} · {countryName(a.country)}</span><span className="sub">{KIND[a.kind].what}</span></td>
                    <td>{a.requestedBy}<span className="sub">{ago(a.requestedAt)}</span></td>
                    <td style={{ maxWidth: 320 }}>{a.reason ?? <span className="muted">—</span>}</td>
                    <td className="r">
                      {status === 'pending' ? (
                        a.mine ? <span className="chip">Your request · needs someone else</span> : (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <Btn kind="primary sm" perm={KIND[a.kind].perm} onClick={() => decide(a, 'approve')}>Approve</Btn>
                            <Btn kind="sm" perm={KIND[a.kind].perm} onClick={() => reason.ask({ title: 'Decline this request', label: 'Why? The person who asked will see this.', cta: 'Decline', run: (r) => decide(a, 'decline', r) })}>Decline</Btn>
                          </span>
                        )
                      ) : (
                        <span className="small">{a.decidedBy}{a.solo ? ' (solo: no second approver)' : ''}<span className="sub">{when(a.decidedAt)}{a.decisionNote ? ` · ${a.decisionNote}` : ''}</span></span>
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
