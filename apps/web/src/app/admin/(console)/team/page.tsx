'use client';

import { useState } from 'react';
import { Btn, Card, Empty, ErrorNote, Modal, NoAccess, PERM_LABEL, PageHead, ago, api, countryName, useLoad, useReason, useStaff } from '../../ui';

type Member = {
  id: string; email: string; displayName: string; role: string; roleLabel: string; country: string | null; status: string; twoStep: boolean;
  lastLoginAt: string | null; createdAt: string; locked: boolean; recoveryLeft: number; activeSessions: number; invitedBy: string | null;
};
type Team = { team: Member[]; roles: { role: string; label: string; perms: string[] }[] };
const COUNTRIES = ['KE', 'TZ', 'UG', 'RW', 'ET'];
const MATRIX: [string, string[]][] = [
  ['Approve L1 and L2', ['queue.decide']], ['Second approvals', ['level3.approve']], ['Book visits', ['visits.assign']], ['Visit reports', ['visits.submit']],
  ['Act on reports', ['reports.act']], ['Suspend', ['listing.suspend', 'vendor.suspend']], ['Confirm or restore', ['suspension.confirm']], ['Moderate posts and prices', ['reviews.moderate', 'prices.moderate']],
  ['Official content', ['content.edit']], ['Onboard businesses', ['businesses.support']], ['Billing', ['billing.manage']], ['Insights', ['insights.view']], ['Manage staff', ['staff.manage']],
];

function MemberForm({ m, roles, onClose, onDone }: { m: Member | null; roles: Team['roles']; onClose: () => void; onDone: (devLink?: string) => void }) {
  const [f, setF] = useState({ email: m?.email ?? '', displayName: m?.displayName ?? '', role: m?.role ?? 'verification_officer', country: m?.country ?? 'KE' as string | null });
  const [err, setErr] = useState<string | null>(null);
  const role = roles.find((r) => r.role === f.role);
  return (
    <Modal title={m ? `Change ${m.displayName}` : 'Invite a staff member'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={async () => {
        try {
          if (m) { await api(`/staff/team/${m.id}`, { method: 'PATCH', body: { role: f.role, country: f.country } }); onDone(); }
          else { const r = await api<{ devLink?: string }>('/staff/team/invite', { body: f }); onDone(r.devLink); }
        } catch (e) { setErr((e as Error).message); }
      }}>{m ? 'Save' : 'Send invitation'}</button>
    </>}>
      {!m ? (
        <>
          <div><label className="f" htmlFor="tn">Name</label><input id="tn" className="in" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></div>
          <div><label className="f" htmlFor="te">Work email</label><input id="te" className="in" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        </>
      ) : null}
      <div className="row">
        <div style={{ flex: 2 }}><label className="f" htmlFor="tr">Role</label>
          <select id="tr" className="in" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}</select></div>
        <div style={{ flex: 1 }}><label className="f" htmlFor="tc">Country</label>
          <select id="tc" className="in" value={f.country ?? ''} onChange={(e) => setF({ ...f, country: e.target.value || null })}>
            <option value="">All countries</option>{COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select></div>
      </div>
      {role ? <div className="row" style={{ gap: 4 }}>{role.perms.map((p) => <span key={p} className="chip">{PERM_LABEL[p] ?? p}</span>)}</div> : null}
      <p className="footnote" style={{ margin: 0 }}>{m ? 'Changing a role signs the person out so the new permissions apply at once.' : 'They get an email with a link to set a password and an authenticator app. The link works once, for 7 days.'} Give the smallest role that lets them do the job.</p>
      {err ? <p className="err">{err}</p> : null}
    </Modal>
  );
}

export default function TeamPage() {
  const { can, me, toast } = useStaff();
  const allowed = can('staff.manage');
  const { data, err, reload } = useLoad<Team>(allowed ? '/staff/team' : null);
  const [form, setForm] = useState<Member | null | undefined>(undefined);
  const [link, setLink] = useState<string | null>(null);
  const reason = useReason();
  if (!allowed) return <NoAccess />;
  const done = (devLink?: string) => { setForm(undefined); reload(); toast('Saved'); if (devLink) setLink(devLink); };

  return (
    <>
      <PageHead crumb="Admin" title="Team and roles" desc="Staff accounts are separate from traveller and business accounts. Each person gets the smallest role that does the job, scoped to a country."
        actions={<button className="btn primary" onClick={() => setForm(null)}>Invite staff member</button>} />
      <ErrorNote err={err} />
      {link ? <div className="banner ok"><span>Invitation created. Email isn’t configured in this environment, so here’s the link to pass on: <span className="mono" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{link}</span></span></div> : null}
      <Card title="People" meta={data ? `${data.team.filter((m) => m.status === 'active').length} active` : ''}>
        {!data ? <Empty>Loading…</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Person</th><th>Role</th><th>Two-step</th><th>Last sign-in</th><th className="r">Action</th></tr></thead>
              <tbody>
                {data.team.map((m) => (
                  <tr key={m.id} style={{ opacity: m.status === 'disabled' ? 0.55 : 1 }}>
                    <td><b>{m.displayName}</b>{m.id === me.staff.id ? <span className="chip blue" style={{ marginLeft: 6 }}>You</span> : null}<span className="sub mono">{m.email}</span></td>
                    <td>{m.roleLabel}<span className="sub">{countryName(m.country)}</span></td>
                    <td>
                      {m.status === 'invited' ? <span className="chip warn">Invitation sent</span> : m.status === 'disabled' ? <span className="chip">Disabled</span> : m.twoStep ? <span className="chip ok">Authenticator</span> : <span className="chip bad">Not set</span>}
                      {m.locked ? <span className="chip bad" style={{ marginLeft: 4 }}>Locked</span> : null}
                      {m.status === 'active' && m.recoveryLeft <= 2 ? <span className="sub">{m.recoveryLeft} recovery codes left</span> : null}
                    </td>
                    <td className="num">{m.lastLoginAt ? ago(m.lastLoginAt) : 'Never'}{m.activeSessions ? <span className="sub">{m.activeSessions} active now</span> : null}</td>
                    <td className="r">
                      {m.id === me.staff.id ? null : (
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          {m.status !== 'disabled' ? <Btn kind="sm" onClick={() => setForm(m)}>Change role</Btn> : null}
                          <Btn kind="sm ghost" onClick={() => reason.ask({ title: `Reset ${m.displayName}’s sign-in`, label: 'Why? For example: lost phone. They’ll get a new invitation to set everything up again.', cta: 'Reset and send invitation', run: async () => {
                            const r = await api<{ devLink?: string }>(`/staff/team/${m.id}/reset`, { body: {} }); reload(); toast('New invitation sent'); if (r.devLink) setLink(r.devLink);
                          } })}>Reset sign-in</Btn>
                          {m.status === 'active' ? <Btn kind="sm ghost" onClick={() => reason.ask({ title: `Disable ${m.displayName}`, label: 'Why? They are signed out at once and can’t sign in again.', cta: 'Disable', run: async (r) => { await api(`/staff/team/${m.id}`, { method: 'PATCH', body: { status: 'disabled', reason: r } }); reload(); toast('Disabled'); } })}>Disable</Btn> : null}
                          {m.status === 'disabled' && m.twoStep ? <Btn kind="sm ghost" onClick={async () => { await api(`/staff/team/${m.id}`, { method: 'PATCH', body: { status: 'active' } }); reload(); toast('Enabled'); }}>Enable</Btn> : null}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data ? (
        <Card title="What each role can do" meta="● can · ○ can’t">
          <div className="tbl matrix">
            <table>
              <thead><tr><th>Role</th>{MATRIX.map(([k]) => <th key={k} style={{ whiteSpace: 'normal', minWidth: 76 }}>{k}</th>)}</tr></thead>
              <tbody>
                {data.roles.map((r) => (
                  <tr key={r.role}>
                    <td><b>{r.label}</b></td>
                    {MATRIX.map(([k, ps]) => <td key={k}>{ps.some((p) => r.perms.includes(p)) ? <span className="y" aria-label="yes">●</span> : <span className="n" aria-label="no">○</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pad footnote">Verification officers can send a level 3 badge for approval but not give it. Field verifiers only submit visit reports. Nobody can approve their own request.</div>
        </Card>
      ) : null}
      {form !== undefined && data ? <MemberForm m={form} roles={data.roles} onClose={() => setForm(undefined)} onDone={done} /> : null}
      {reason.node}
    </>
  );
}
