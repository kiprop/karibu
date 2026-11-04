'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, countryName } from '../../ui';

type Invite = { email: string; displayName: string; roleLabel: string; country: string | null };

/** First visit from an invitation: choose a password, link an authenticator app, save recovery codes. */
function Accept() {
  const token = useSearchParams().get('token') ?? '';
  const [inv, setInv] = useState<Invite | null>(null);
  const [step, setStep] = useState<'password' | 'app' | 'codes'>('password');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [enrol, setEnrol] = useState<{ challenge: string; qrSvg: string; secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Join the staff console · Karibu staff';
    if (!token) return setErr('This link is missing its invitation code.');
    api<Invite>(`/staff/invite?token=${encodeURIComponent(token)}`).then(setInv).catch((e) => setErr(e.message));
  }, [token]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="lbox">
        <div className="mark"><img src="/brand/ei-logo.png" alt="" /><span>EI Karibu</span><span className="tag">Staff</span></div>
        <div className="lcard stack">
          {!inv ? (
            <>
              <h1>Staff invitation</h1>
              <p className="muted" style={{ margin: 0 }}>{err ?? 'Checking your invitation…'}</p>
            </>
          ) : step === 'password' ? (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); if (pw !== pw2) return setErr('The two passwords don’t match'); run(async () => {
              const r = await api<{ challenge: string; enrol: { qrSvg: string; secret: string; uri: string } }>('/staff/invite/accept', { body: { token, password: pw } });
              setEnrol({ challenge: r.challenge, ...r.enrol });
              setStep('app');
            }); }}>
              <div>
                <div className="crumb">Step 1 of 3</div>
                <h1>Welcome, {inv.displayName}</h1>
                <p className="muted" style={{ margin: 0 }}>You’re joining as <b>{inv.roleLabel}</b> · {countryName(inv.country)}. Your sign-in email is <b>{inv.email}</b>.</p>
              </div>
              <input type="email" value={inv.email} autoComplete="username" readOnly hidden />
              <div>
                <label className="f" htmlFor="pw">Choose a password</label>
                <input id="pw" className="in" type="password" autoComplete="new-password" required minLength={12} value={pw} onChange={(e) => setPw(e.target.value)} />
                <p className="footnote" style={{ margin: '4px 0 0' }}>At least 12 characters. A phrase of four or five words is strong and easy to type.</p>
              </div>
              <div>
                <label className="f" htmlFor="pw2">Type it again</label>
                <input id="pw2" className="in" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </div>
              <button className="btn primary wide" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
              {err ? <p className="err" role="alert">{err}</p> : null}
            </form>
          ) : step === 'app' && enrol ? (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => {
              const r = await api<{ recoveryCodes: string[] }>('/staff/auth/enrol', { body: { challenge: enrol.challenge, code } });
              setCodes(r.recoveryCodes);
              setStep('codes');
            }); }}>
              <div>
                <div className="crumb">Step 2 of 3</div>
                <h1>Link your authenticator app</h1>
                <p className="muted" style={{ margin: 0 }}>Open Google Authenticator, Microsoft Authenticator or 1Password on your phone, add an account, and scan this code.</p>
              </div>
              <div className="qr" dangerouslySetInnerHTML={{ __html: enrol.qrSvg }} />
              <details>
                <summary className="small muted" style={{ cursor: 'pointer' }}>Can’t scan? Enter this key instead</summary>
                <p className="mono" style={{ userSelect: 'all', wordBreak: 'break-all', margin: '6px 0 0' }}>{enrol.secret}</p>
              </details>
              <div>
                <label className="f" htmlFor="code">Then enter the 6-digit code it shows</label>
                <input id="code" className="in otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <button className="btn primary wide" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Confirm'}</button>
              {err ? <p className="err" role="alert">{err}</p> : null}
            </form>
          ) : (
            <div className="stack">
              <div>
                <div className="crumb">Step 3 of 3</div>
                <h1>Save your recovery codes</h1>
                <p className="muted" style={{ margin: 0 }}>If you lose your phone, each code lets you sign in once. Keep them somewhere safe, like a password manager. You won’t see them again.</p>
              </div>
              <div className="codes">{codes.map((c) => <span key={c}>{c}</span>)}</div>
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(codes.join('\n')).catch(() => {})}>Copy codes</button>
              <label className="row small"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I’ve saved my recovery codes</label>
              <button className="btn primary wide" disabled={!saved} onClick={() => location.replace('/admin')}>Open the staff console</button>
            </div>
          )}
        </div>
        <p className="fine">Your password and authenticator are only for the staff console. They’re separate from any traveller or business account.</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Accept />
    </Suspense>
  );
}
