'use client';

import { useState } from 'react';
import { call } from '@/lib/client-api';

export default function VendorSignIn() {
  const [phone, setPhone] = useState('+254');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await call<{ devCode?: string }>('/auth/phone/start', { body: { phone: phone.replace(/\s/g, '') } });
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await call('/auth/phone/verify', { body: { phone: phone.replace(/\s/g, ''), code } });
      location.href = '/vendor';
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="container-k max-w-md py-12">
      <p className="eyebrow text-brand">Karibu for businesses</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold">Sign in with your phone</h1>
      <p className="mt-2 text-muted">Use the number you run your business on. We’ll send a 6-digit code by SMS.</p>
      {step === 'phone' ? (
        <form onSubmit={send} className="mt-6 flex flex-col gap-3">
          <label htmlFor="ph" className="label">Phone number (international format)</label>
          <input id="ph" type="tel" inputMode="tel" autoComplete="tel" required className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 flex flex-col gap-3">
          <label htmlFor="code" className="label">Code sent to {phone}</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="input text-center font-mono text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          {devCode ? <p className="rounded-xl bg-amber-soft p-3 text-[14px] text-amber">Development mode: your code is <strong className="font-mono">{devCode}</strong>. Real SMS is sent once a provider is configured.</p> : null}
          <button className="btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="text-[14px] font-bold text-muted" onClick={() => setStep('phone')}>Use a different number</button>
        </form>
      )}
      {err ? <p role="alert" className="mt-3 text-danger">{err}</p> : null}
    </div>
  );
}
