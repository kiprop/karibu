'use client';

import { useState } from 'react';
import { Card, PageHead, api, countryName, useStaff } from '../../ui';

export default function SecurityPage() {
  const { me, toast, refresh } = useStaff();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [cErr, setCErr] = useState<string | null>(null);

  return (
    <>
      <PageHead crumb="Your account" title="Password and two-step check" desc={`${me.staff.displayName} · ${me.staff.email} · ${me.staff.roleLabel}, ${countryName(me.staff.country)}`} />
      <section className="grid g11">
        <Card title="Change password" meta="Signs out your other devices" pad>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            setPwErr(null);
            try { await api('/staff/me/password', { body: { current: cur, password: pw } }); setCur(''); setPw(''); toast('Password changed'); } catch (x) { setPwErr((x as Error).message); }
          }}>
            <input type="email" value={me.staff.email} autoComplete="username" readOnly hidden />
            <div><label className="f" htmlFor="cur">Current password</label><input id="cur" className="in" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></div>
            <div><label className="f" htmlFor="new">New password</label><input id="new" className="in" type="password" autoComplete="new-password" minLength={12} required value={pw} onChange={(e) => setPw(e.target.value)} />
              <p className="footnote" style={{ margin: '4px 0 0' }}>At least 12 characters.</p></div>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Change password</button>
            {pwErr ? <p className="err">{pwErr}</p> : null}
          </form>
        </Card>
        <Card title="Recovery codes" meta={`${me.counts.recoveryLeft ?? 0} left`} pad>
          {codes ? (
            <div className="stack">
              <p style={{ margin: 0 }}>Your new codes. The old ones no longer work. Save these somewhere safe now; you won’t see them again.</p>
              <div className="codes">{codes.map((c) => <span key={c}>{c}</span>)}</div>
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => navigator.clipboard?.writeText(codes.join('\n')).catch(() => {})}>Copy codes</button>
            </div>
          ) : (
            <form className="stack" onSubmit={async (e) => {
              e.preventDefault();
              setCErr(null);
              try { const r = await api<{ recoveryCodes: string[] }>('/staff/me/recovery-codes', { body: { code } }); setCodes(r.recoveryCodes); setCode(''); refresh(); } catch (x) { setCErr((x as Error).message); }
            }}>
              <p style={{ margin: 0 }} className="muted">Each recovery code signs you in once if you lose your phone. Making new ones cancels the old ones.</p>
              <div><label className="f" htmlFor="code">Code from your authenticator app</label><input id="code" className="in otp" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
              <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={code.length !== 6}>Make new recovery codes</button>
              {cErr ? <p className="err">{cErr}</p> : null}
            </form>
          )}
        </Card>
      </section>
      <div className="banner"><span>Lost your phone and your recovery codes? Ask another Owner to reset your sign-in from Team and roles. If you’re the only Owner, run the reset command on the server (see DEPLOY.md).</span></div>
    </>
  );
}
