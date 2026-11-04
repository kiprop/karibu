'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '../../ui';

function Login() {
  const sp = useSearchParams();
  const next = (() => {
    const n = sp.get('next');
    return n && n.startsWith('/admin') && !n.startsWith('/admin/login') ? n : '/admin';
  })();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Karibu staff';
    // Already signed in? Go straight in.
    api<{ staff: unknown }>('/staff/me').then((r) => r.staff && location.replace(next)).catch(() => {});
  }, [next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (step === 'password') {
        const r = await api<{ challenge: string }>('/staff/auth/login', { body: { email, password } });
        setChallenge(r.challenge);
        setPassword('');
        setStep('code');
      } else {
        await api('/staff/auth/code', { body: { challenge, code } });
        location.replace(next);
        return;
      }
    } catch (x) {
      setErr((x as Error).message);
      if ((x as Error).message.includes('expired')) setStep('password');
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="lbox">
        <div className="mark"><img src="/brand/ei-logo.png" alt="" /><span>EI Karibu</span><span className="tag">Staff</span></div>
        <form className="lcard stack" onSubmit={submit}>
          {sp.get('expired') ? <div className="banner warn"><span>Your session ended. Please sign in again.</span></div> : null}
          {step === 'password' ? (
            <>
              <div>
                <h1>Sign in to the staff console</h1>
                <p className="muted" style={{ margin: 0 }}>For Karibu staff only. Travellers and businesses sign in on the main site.</p>
              </div>
              <div>
                <label className="f" htmlFor="em">Work email</label>
                <input id="em" className="in" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="f" htmlFor="pw">Password</label>
                <input id="pw" className="in" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button className="btn primary wide" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            </>
          ) : (
            <>
              <div>
                <button type="button" className="btn ghost sm" style={{ padding: '0 4px' }} onClick={() => { setStep('password'); setCode(''); setErr(null); }}>← {email}</button>
                <h1 style={{ marginTop: 6 }}>Two-step check</h1>
                <p className="muted" style={{ margin: 0 }}>
                  {recovery ? 'Enter one of the recovery codes you saved when you set up your account. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}
                </p>
              </div>
              {recovery ? (
                <input className="in mono" aria-label="Recovery code" autoComplete="off" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="abcd-efgh" />
              ) : (
                <input className="in otp" aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              )}
              <button className="btn primary wide" disabled={busy}>{busy ? 'Checking…' : 'Verify and sign in'}</button>
              <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setRecovery((r) => !r); setCode(''); }}>
                {recovery ? 'Use my authenticator app' : 'Lost your phone? Use a recovery code'}
              </button>
            </>
          )}
          {err ? <p className="err" role="alert">{err}</p> : null}
        </form>
        <p className="fine">Staff accounts are invited by an Owner; there’s no sign-up here. Every sign-in is recorded. Sessions end after 30 minutes without activity.</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
