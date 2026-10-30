'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';

function SignInForm() {
  const sp = useSearchParams();
  const next = sp.get('next') ?? '/saved';
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      const r = await call<{ devLink?: string }>('/auth/email/start', { body: { email, next: next.startsWith('/') ? next : '/saved' } });
      setDevLink(r.devLink ?? null);
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('idle');
    }
  }

  return (
    <div className="container-k max-w-lg py-12">
      <h1 className="font-display text-3xl font-extrabold">Sign in to Karibu</h1>
      <p className="mt-2 text-muted">Free for travellers. Keep your saved places and trips on every device, plan day by day, and review businesses you contacted.</p>
      <p className="mt-1 text-muted">Everything else works without an account.</p>
      {state === 'sent' ? (
        <div className="card mt-6 flex flex-col gap-2 p-5" role="status">
          <Icon name="check" className="text-teal" size={28} />
          <h2 className="text-xl font-extrabold">Check your email</h2>
          <p>We sent a sign-in link to <strong>{email}</strong>. It works once and expires in 20 minutes.</p>
          {devLink ? (
            <p className="mt-2 rounded-xl bg-amber-soft p-3 text-[14px] text-amber">
              Development mode: <a className="font-bold underline" href={devLink}>open the sign-in link</a>. Real emails are sent once an email provider is configured.
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <button className="btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}</button>
          {error ? <p role="alert" className="text-[14px] font-semibold text-danger">{error}</p> : null}
          <p className="text-[13px] text-muted">No password needed. Things you saved on this device move into your account.</p>
        </form>
      )}
      <div className="mt-8 border-t border-line pt-6 text-[14px]">
        Run a camp, a 4x4 or a tour? <Link href="/vendor/signin" className="font-bold text-brand">Business sign-in with your phone</Link>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
