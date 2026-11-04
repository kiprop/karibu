'use client';

import { useState } from 'react';
import { call, deviceId, guestFavourites, setGuestFavourites } from '@/lib/client-api';
import { Icon } from '@/components/Icon';

type Method = 'email' | 'phone';

/**
 * One form for every way in. mode="signin" signs in (or creates the account the first time);
 * mode="add" adds a verified email or phone to the account that is already signed in.
 */
export function AuthForm({
  mode = 'signin',
  next = '/saved',
  defaultMethod = 'email',
  only,
  emailLabel = 'Email',
  emailPlaceholder = 'you@example.com',
  onLinked,
}: {
  mode?: 'signin' | 'add';
  next?: string;
  defaultMethod?: Method;
  only?: Method;
  emailLabel?: string;
  emailPlaceholder?: string;
  onLinked?: () => void;
}) {
  const [method, setMethod] = useState<Method>(only ?? defaultMethod);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+254');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'enter' | 'sent'>('enter');
  const [dev, setDev] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const add = mode === 'add';
  const cleanPhone = () => phone.replace(/[\s-]/g, '');

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (method === 'email') {
        const r = await call<{ devLink?: string }>('/auth/email/start', { body: { email, next, add: add || undefined } });
        setDev(r.devLink ?? null);
      } else {
        const r = await call<{ devCode?: string }>('/auth/phone/start', { body: { phone: cleanPhone(), add: add || undefined } });
        setDev(r.devCode ?? null);
      }
      setStep('sent');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await call('/auth/phone/verify', { body: { phone: cleanPhone(), code, deviceId: deviceId(), favourites: add ? undefined : guestFavourites() } });
      if (add) {
        onLinked?.();
        reset();
        return;
      }
      setGuestFavourites([]);
      // Full reload so the header and session pick up the new cookie.
      window.location.replace(next.startsWith('/') ? next : '/saved');
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  function reset() {
    setStep('enter');
    setCode('');
    setDev(null);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {!only && step === 'enter' ? (
        <div role="tablist" aria-label="How to sign in" className="grid grid-cols-2 gap-1 rounded-full bg-soft p-1">
          {(['email', 'phone'] as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => { setMethod(m); setErr(null); }}
              className={`flex min-h-[40px] items-center justify-center gap-2 rounded-full text-[15px] font-bold ${method === m ? 'bg-panel shadow-sm' : 'text-muted'}`}
            >
              <Icon name={m === 'email' ? 'chat' : 'phone'} size={16} />
              {m === 'email' ? 'Email' : 'Phone'}
            </button>
          ))}
        </div>
      ) : null}

      {step === 'enter' ? (
        <form onSubmit={start} className="flex flex-col gap-3">
          {method === 'email' ? (
            <>
              <label htmlFor="af-email" className="label">{emailLabel}</label>
              <input id="af-email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={emailPlaceholder} />
              <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : add ? 'Send a confirmation link' : 'Email me a sign-in link'}</button>
            </>
          ) : (
            <>
              <label htmlFor="af-phone" className="label">Mobile number (international format)</label>
              <input id="af-phone" type="tel" inputMode="tel" autoComplete="tel" required className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Text me a code'}</button>
            </>
          )}
          <p className="text-[13px] text-muted">{add ? 'Once confirmed, you can sign in with either.' : 'Works once. Things you saved on this device move into your account.'}</p>
        </form>
      ) : method === 'email' ? (
        <div className="rounded-2xl border border-line bg-panel p-5" role="status">
          <Icon name="check" className="text-teal" size={26} />
          <h2 className="mt-1 text-lg font-extrabold">Check your email</h2>
          <p className="mt-1">We sent a link to <strong>{email}</strong>. It works once and expires in 20 minutes.</p>
          {dev ? (
            <p className="mt-3 rounded-xl bg-amber-soft p-3 text-[14px] text-amber">
              Development mode: <a className="font-bold underline" href={dev}>open the link</a>. Real emails are sent once an email provider is configured.
            </p>
          ) : null}
          <button type="button" className="mt-3 text-[14px] font-bold text-muted" onClick={reset}>Use a different email</button>
        </div>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <label htmlFor="af-code" className="label">6-digit code sent to {cleanPhone()}</label>
          <input id="af-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="input text-center font-mono text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          {dev ? <p className="rounded-xl bg-amber-soft p-3 text-[14px] text-amber">Development mode: your code is <strong className="font-mono">{dev}</strong>. Real SMS is sent once a provider is configured.</p> : null}
          <button className="btn-primary" disabled={busy}>{busy ? 'Checking…' : add ? 'Confirm number' : 'Sign in'}</button>
          <button type="button" className="text-[14px] font-bold text-muted" onClick={reset}>Use a different number</button>
        </form>
      )}
      {err ? <p role="alert" className="rounded-xl bg-danger-soft p-3 text-[14px] font-semibold text-danger">{err}</p> : null}
    </div>
  );
}
