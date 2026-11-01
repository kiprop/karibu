'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { shortDate } from '@/lib/format';
import { AuthForm } from '@/components/AuthForm';
import { Icon } from '@/components/Icon';

/** Ways to sign in to this one account. Adding the other one lets a business owner use phone or email. */
function SignInMethods() {
  const { me } = useSession();
  const [s, setS] = useState(me.signIn);
  const [adding, setAdding] = useState<'email' | 'phone' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => call<{ signIn: typeof s }>('/me').then((r) => setS(r.signIn)).catch(() => {});
  async function remove(m: 'email' | 'phone') {
    if (!confirm(`Stop signing in with this ${m}?`)) return;
    setErr(null);
    try {
      await call(`/me/sign-in/${m}`, { method: 'DELETE' });
      refresh();
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  if (!s) return null;
  const rows: { m: 'email' | 'phone'; label: string; value: string | null; ok: boolean }[] = [
    { m: 'email', label: 'Email', value: s.email, ok: s.emailVerified },
    { m: 'phone', label: 'Mobile', value: s.phone, ok: s.phoneVerified },
  ];
  return (
    <section className="mt-10 card flex flex-col gap-3 p-5">
      <h2 className="text-lg font-extrabold">How you sign in</h2>
      <p className="text-[14px] text-muted">One account for travel and business. Add both so you can sign in with either.</p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.m} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span>
              <span className="block text-[13px] font-bold text-muted">{r.label}</span>
              {r.value ? <span className="font-semibold">{r.value} {r.ok ? <span className="chip ml-1 bg-teal-soft text-teal"><Icon name="check" size={12} strokeWidth={3} />Confirmed</span> : null}</span> : <span className="text-muted">Not added</span>}
            </span>
            {r.value ? (
              <button className="btn-ghost h-9 text-[14px]" onClick={() => remove(r.m)}>Remove</button>
            ) : (
              <button className="btn-outline h-9 text-[14px]" onClick={() => setAdding(r.m)}>Add {r.m === 'email' ? 'email' : 'mobile'}</button>
            )}
          </li>
        ))}
        {s.google ? <li className="py-3"><span className="block text-[13px] font-bold text-muted">Google</span><span className="font-semibold">Connected</span></li> : null}
      </ul>
      {adding ? (
        <div className="rounded-2xl bg-soft p-4">
          <AuthForm mode="add" only={adding} next="/account" onLinked={() => { setAdding(null); refresh(); }} />
          <button className="mt-2 text-[14px] font-bold text-muted" onClick={() => setAdding(null)}>Cancel</button>
        </div>
      ) : null}
      {err ? <p role="alert" className="text-[14px] text-danger">{err}</p> : null}
    </section>
  );
}

type Enq = { id: string; refCode: string; createdAt: string; slug: string | null; title: string | null; vendorName: string; reviewed: boolean };

function ReviewForm({ e, onDone }: { e: Enq; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!rating) return setErr('Choose a star rating');
    try {
      await call('/reviews', { body: { refCode: e.refCode, rating, body: body || undefined } });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-xl bg-soft p-3">
      <fieldset className="flex items-center gap-1">
        <legend className="label mb-1">Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? 'text-star' : 'text-line'}`}>★</button>
        ))}
      </fieldset>
      <label className="label" htmlFor={`rb-${e.id}`}>What should other travellers know?</label>
      <textarea id={`rb-${e.id}`} className="input min-h-[90px] py-2" maxLength={2000} value={body} onChange={(x) => setBody(x.target.value)} />
      <button className="btn-primary self-start">Post review</button>
      {err ? <p role="alert" className="text-[14px] text-danger">{err}</p> : null}
    </form>
  );
}

export default function Account() {
  const { me } = useSession();
  const [enq, setEnq] = useState<Enq[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState(me.user?.displayName ?? '');
  const [saved, setSaved] = useState(false);
  const load = () => call<{ enquiries: Enq[] }>('/me/enquiries').then((r) => setEnq(r.enquiries)).catch(() => setEnq([]));
  useEffect(() => {
    if (me.user) load();
  }, [me.user]);

  if (!me.user) {
    return (
      <div className="container-k max-w-lg py-12">
        <h1 className="font-display text-3xl font-extrabold">Your account</h1>
        <p className="mt-2 text-muted">Sign in to see the businesses you contacted and leave reviews.</p>
        <Link href="/signin?next=/account" className="btn-primary mt-6">Sign in</Link>
      </div>
    );
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    await call('/me', { method: 'PATCH', body: { displayName: name } });
    setSaved(true);
  }
  async function signOut() {
    await call('/auth/logout', { body: {} });
    location.href = '/';
  }
  async function deleteAccount() {
    if (!confirm('Delete your account? Trips and saved places are removed. Reviews stay, without your name.')) return;
    await call('/me', { method: 'DELETE' });
    location.href = '/';
  }

  return (
    <div className="container-k max-w-3xl py-10">
      <h1 className="font-display text-3xl font-extrabold">Your account</h1>
      <p className="mt-1 text-muted">{me.user.email ?? me.user.phone}</p>

      <section className="mt-8">
        <h2 className="font-display text-xl font-extrabold">Businesses you contacted</h2>
        <p className="mt-1 text-[14px] text-muted">Rate the ones you used. Reviews only come from real enquiries, which keeps them honest.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {enq === null ? <li className="text-muted">Loading…</li> : null}
          {enq?.length === 0 ? <li className="text-muted">None yet. When you message a business from a listing, it appears here.</li> : null}
          {enq?.map((e) => (
            <li key={e.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {e.slug ? <Link href={`/listing/${e.slug}`} className="font-bold hover:underline">{e.title}</Link> : <strong>{e.vendorName}</strong>}
                  <div className="text-[13px] text-muted">{e.vendorName} · ref <span className="font-mono">{e.refCode}</span> · {shortDate(e.createdAt)}</div>
                </div>
                {e.reviewed ? <span className="chip bg-teal-soft text-teal">Shared</span> : e.slug ? <Link className="btn-outline min-h-[38px]" href={`/share/experience?listing=${e.slug}&ref=${e.refCode}`}>Share your experience</Link> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <SignInMethods />

      {me.vendors?.length ? (
        <section className="mt-10 card flex flex-wrap items-center justify-between gap-3 p-5">
          <span><span className="block text-lg font-extrabold">Your business{me.vendors.length > 1 ? 'es' : ''}</span><span className="text-muted">{me.vendors.map((v) => v.name).join(', ')}</span></span>
          <Link href="/vendor" className="btn-dark">Open business tools</Link>
        </section>
      ) : (
        <section className="mt-10 rounded-2xl bg-soft p-5 text-[15px]">
          Run a camp, a 4x4, a tour or a guiding business? <Link href="/vendor" className="font-bold text-brand underline">List it free</Link> from this same account.
        </section>
      )}

      <section className="mt-10 card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-extrabold">Profile</h2>
        <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="dn">Name shown on reviews (first name only)</label>
            <input id="dn" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={80} />
          </div>
          <button className="btn-dark">{saved ? 'Saved' : 'Save'}</button>
        </form>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <button className="btn-outline" onClick={signOut}>Sign out</button>
        <button className="btn-ghost text-danger" onClick={deleteAccount}>Delete my account and data</button>
      </div>
    </div>
  );
}
