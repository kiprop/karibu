'use client';

import { useEffect, useState } from 'react';
import { Card, Empty, ErrorNote, NoAccess, PageHead, api, countryName, useStaff, when } from '../../ui';

type Entry = {
  id: number; at: string; staffId: string | null; staffName: string | null; staffRole: string | null; action: string; targetType: string | null;
  targetId: string | null; targetLabel: string | null; reason: string | null; country: string | null; ip: string | null; meta: Record<string, unknown> | null;
};

export default function AuditPage() {
  const { can } = useStaff();
  const allowed = can('audit.view');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (before?: number) => {
    try {
      const r = await api<{ entries: Entry[] }>(`/admin/audit?limit=100${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}${before ? `&before=${before}` : ''}`);
      setRows((x) => (before && x ? [...x, ...r.entries] : r.entries));
      setMore(r.entries.length === 100);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    if (!allowed) return;
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [q, allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!allowed) return <NoAccess />;

  const tone = (a: string) => (/blocked|failed|Suspended|Disabled|Reset/i.test(a) ? 'bad' : /second approval|Approved|Gave/i.test(a) ? 'ok' : '');
  return (
    <>
      <PageHead crumb="Accountability" title="Audit log" desc="Every staff sign-in and decision: who, in which role, what, on what, and why. Entries can’t be edited or deleted, even by Owners."
        actions={<input type="search" className="in" style={{ width: 300 }} placeholder="Filter by person, business or action" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />} />
      <ErrorNote err={err} />
      <Card>
        {!rows ? <Empty>Loading…</Empty> : rows.length === 0 ? <Empty>No entries match.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Reason</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{when(a.at)}</td>
                    <td><b>{a.staffName ?? 'Unknown'}</b><span className="sub">{a.staffRole ? a.staffRole.replace(/_/g, ' ') : a.ip ?? ''}</span></td>
                    <td>{tone(a.action) ? <span className={`chip ${tone(a.action)}`}>{a.action}</span> : a.action}{a.meta && (a.meta as any).solo ? <span className="sub">no second approver available</span> : null}</td>
                    <td style={{ maxWidth: 300 }}>{a.targetLabel ?? '—'}{a.country ? <span className="sub">{countryName(a.country)}</span> : null}</td>
                    <td className="footnote" style={{ maxWidth: 320 }}>{a.reason ?? (a.meta && (a.meta as any).method ? `via ${(a.meta as any).method}` : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {more ? <button className="btn" style={{ alignSelf: 'center' }} onClick={() => rows && load(rows[rows.length - 1].id)}>Show older entries</button> : null}
    </>
  );
}
