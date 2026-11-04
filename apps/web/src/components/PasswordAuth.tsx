'use client';

import { useState } from 'react';
import { call, deviceId, guestFavourites, setGuestFavourites } from '@/lib/client-api';
import { AuthForm } from '@/components/AuthForm';
import { Icon } from '@/components/Icon';

type Mode = 'signin' | 'create' | 'forgot' | 'link';

function PasswordInput({ id, value, onChange, autoComplete, label }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; label: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative mt-1">
        <input id={id} type={show ? 'text' : 'password'} required autoComplete={autoComplete} className="input pr-16" value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-1 my-1 rounded-lg px-3 text-[13px] font-bold text-muted hover:bg-soft" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

/**
 * The usual way in: email or mobile number, and a password. "Keep me signed in" keeps the device signed in for 90 days.
 * New accounts confirm their email or phone with a 6-digit code once. One-time links and SMS codes stay available.
 */
export function PasswordAuth({ next = '/saved', initialMode = 'signin', business = false }: { next?: string; initialMode?: Mode; business?: boolean }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<{ via: 'email' | 'phone'; to: string; dev?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = () => {
    setGuestFavourites([]);
    window.location.replace(next.startsWith('/') ? next : '/saved');
  };
  const switchTo = (m: Mode) => {
    setMode(m);
    setErr(null);
    setSentTo(null);
    setCode('');
  };
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  const signIn = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await call('/auth/password/login', { body: { identifier, password, remember, deviceId: deviceId(), favourites: guestFavourites() } });
      go();
    });
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!sentTo) {
        const r = await call<{ via: 'email' | 'phone'; to: string; devCode?: string }>('/auth/signup/start', { body: { identifier, password, displayName: name || undefined } });
        setSentTo({ via: r.via, to: r.to, dev: r.devCode });
        setBusy(false);
        return;
      }
      await call('/auth/signup/verify', { body: { identifier: sentTo.to, code, remember, deviceId: deviceId(), favourites: guestFavourites() } });
      go();
    });
  };
  const forgot = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (!sentTo) {
        const r = await call<{ via: 'email' | 'phone'; to: string; devCode?: string }>('/auth/password/forgot', { body: { identifier } });
        setSentTo({ via: r.via, to: r.to, dev: r.devCode });
        setBusy(false);
        return;
      }
      await call('/auth/password/reset', { body: { identifier: sentTo.to, code, password, remember } });
      go();
    });
  };

  const idLabel = business ? 'Business mobile number or company email' : 'Email or mobile number';
  const idInput = (
    <div>
      <label htmlFor="pa-id" className="label">{idLabel}</label>
      <input id="pa-id" required autoComplete="username" className="input mt-1" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
        placeholder={business ? '0712 345 678 or bookings@yourcamp.co.ke' : 'you@example.com or 0712 345 678'} disabled={!!sentTo} />
    </div>
  );
  const rememberBox = (
    <label className="flex items-center gap-2 text-[15px]">
      <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--brand))]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      Keep me signed in on this device
    </label>
  );
  const codeBox = sentTo ? (
    <div className="rounded-2xl bg-soft p-4">
      <p className="text-[15px]">We sent a 6-digit code to <strong>{sentTo.to}</strong> by {sentTo.via === 'email' ? 'email' : 'SMS'}.</p>
      <label htmlFor="pa-code" className="label mt-3 block">Code</label>
      <input id="pa-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
        className="input mt-1 text-center font-mono text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
      {sentTo.dev ? <p className="mt-2 rounded-xl bg-amber-soft p-2 text-[13px] text-amber">Development mode: the code is <strong className="font-mono">{sentTo.dev}</strong>.</p> : null}
      <button type="button" className="mt-2 text-[13px] font-bold text-muted" onClick={() => { setSentTo(null); setCode(''); }}>Use a different email or number</button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {mode === 'signin' || mode === 'create' ? (
        <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 gap-1 rounded-full bg-soft p-1">
          {([['signin', 'Sign in'], ['create', 'Create account']] as const).map(([m, t]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)}
              className={`min-h-[40px] rounded-full text-[15px] font-bold ${mode === m ? 'bg-panel shadow-sm' : 'text-muted'}`}>{t}</button>
          ))}
        </div>
      ) : null}

      {mode === 'signin' ? (
        <form onSubmit={signIn} className="flex flex-col gap-3">
          {idInput}
          <PasswordInput id="pa-pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rememberBox}
            <button type="button" className="text-[14px] font-bold text-brand" onClick={() => switchTo('forgot')}>Forgot password?</button>
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      ) : null}

      {mode === 'create' ? (
        <form onSubmit={create} className="flex flex-col gap-3">
          {!sentTo ? (
            <>
              <div>
                <label htmlFor="pa-name" className="label">Your name (optional)</label>
                <input id="pa-name" autoComplete="name" maxLength={80} className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {idInput}
              <PasswordInput id="pa-new" label="Choose a password" value={password} onChange={setPassword} autoComplete="new-password" />
              <p className="-mt-1 text-[13px] text-muted">At least 8 characters. A short phrase of a few words is easy to remember and hard to guess.</p>
            </>
          ) : codeBox}
          {sentTo ? rememberBox : null}
          <button className="btn-primary" disabled={busy}>{busy ? 'One moment…' : sentTo ? 'Confirm and create account' : 'Create account'}</button>
          <p className="text-[13px] text-muted">We send one code to prove the email or number is yours. Things you saved on this device move into your account.</p>
        </form>
      ) : null}

      {mode === 'forgot' ? (
        <form onSubmit={forgot} className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-extrabold">Reset your password</h2>
            <p className="mt-1 text-[15px] text-muted">We’ll send a code to your email or phone. You’ll be signed out on other devices.</p>
          </div>
          {idInput}
          {codeBox}
          {sentTo ? (
            <>
              <PasswordInput id="pa-reset" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
              {rememberBox}
            </>
          ) : null}
          <button className="btn-primary" disabled={busy}>{busy ? 'One moment…' : sentTo ? 'Save new password and sign in' : 'Send me a code'}</button>
          <button type="button" className="self-start text-[14px] font-bold text-muted" onClick={() => switchTo('signin')}>← Back to sign in</button>
        </form>
      ) : null}

      {mode === 'link' ? (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-extrabold">Sign in without a password</h2>
            <p className="mt-1 text-[15px] text-muted">We’ll email you a one-time link, or text you a code.</p>
          </div>
          <AuthForm next={next} defaultMethod={business ? 'phone' : 'email'} />
          <button type="button" className="self-start text-[14px] font-bold text-muted" onClick={() => switchTo('signin')}>← Use a password instead</button>
        </div>
      ) : null}

      {err ? <p role="alert" className="rounded-xl bg-danger-soft p-3 text-[14px] font-semibold text-danger">{err}</p> : null}

      {mode === 'signin' || mode === 'create' ? (
        <button type="button" onClick={() => switchTo('link')} className="flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-[14px] font-bold text-muted hover:bg-soft">
          <Icon name="chat" size={16} /> Email me a link or text me a code instead
        </button>
      ) : null}
    </div>
  );
}
