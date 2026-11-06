'use client';

import Link from 'next/link';
import { Area, AreaHead, Panel } from '@/components/RailShell';
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
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="section-title">How you sign in</h2>
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

/** Set a password (accounts that only used links or codes) or change it. Changing it signs out other devices. */
function PasswordSection() {
  const { me } = useSession();
  const has = !!me.signIn?.hasPassword;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await call('/me/password', { body: { current: has ? current : undefined, password: pw } });
      setMsg({ ok: true, t: has ? 'Password changed. Other devices are signed out.' : 'Password set. You can now sign in with it.' });
      setOpen(false);
      setCurrent('');
      setPw('');
    } catch (x) {
      setMsg({ ok: false, t: (x as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function endOthers() {
    await call('/me/sessions/end-others', { body: {} });
    setMsg({ ok: true, t: 'Signed out on every other device.' });
  }
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Password</h2>
          <p className="text-[14px] text-muted">
            {has ? `Set${me.signIn?.passwordChangedAt ? ` ${shortDate(me.signIn.passwordChangedAt)}` : ''}. Sign in with your email or mobile number and this password.` : 'You sign in with one-time links or codes. Add a password to sign in faster.'}
          </p>
        </div>
        {!open ? <button className="btn-outline h-9 text-[14px]" onClick={() => setOpen(true)}>{has ? 'Change password' : 'Set a password'}</button> : null}
      </div>
      {open ? (
        <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl bg-soft p-4">
          {has ? (
            <div>
              <label className="label" htmlFor="pw-cur">Current password</label>
              <input id="pw-cur" type="password" autoComplete="current-password" required className="input mt-1" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" autoComplete="new-password" required minLength={8} className="input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} />
            <p className="mt-1 text-[13px] text-muted">At least 8 characters. A short phrase of a few words works well.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary h-10" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
            <button type="button" className="btn-ghost h-10" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : null}
      <button className="self-start text-[14px] font-bold text-muted hover:text-ink" onClick={endOthers}>Sign out on all other devices</button>
      {msg ? <p role="status" className={`text-[14px] font-semibold ${msg.ok ? 'text-teal' : 'text-danger'}`}>{msg.t}</p> : null}
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

  const crumbs = [{ label: 'My Karibu', href: '/today' }, { label: 'Account' }];
  if (!me.user) {
    return (
      <Area>
        <AreaHead crumbs={crumbs} title="Your account" desc="Sign in to see the businesses you contacted, share your experiences and keep your trips on every device." />
        <Panel><Link href="/signin?next=/account" className="btn-primary">Sign in or create an account</Link></Panel>
      </Area>
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
    <Area>
      <AreaHead crumbs={crumbs} title="Your account" desc={me.user.email ?? me.user.phone ?? undefined} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Businesses you contacted" meta="Reviews only come from real enquiries">
            <ul className="flex flex-col gap-3">
              {enq === null ? <li className="text-muted">Loading…</li> : null}
              {enq?.length === 0 ? <li className="text-[14px] text-muted">None yet. When you message a business from a listing, it appears here so you can rate it.</li> : null}
              {enq?.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                  <div className="min-w-0">
                    {e.slug ? <Link href={`/listing/${e.slug}`} className="font-semibold hover:underline">{e.title}</Link> : <strong>{e.vendorName}</strong>}
                    <div className="text-[13px] text-muted">{e.vendorName} · ref <span className="font-mono">{e.refCode}</span> · {shortDate(e.createdAt)}</div>
                  </div>
                  {e.reviewed ? <span className="chip bg-teal-soft text-teal">Shared</span> : e.slug ? <Link className="btn-outline h-9 min-h-0 text-[13px]" href={`/share/experience?listing=${e.slug}&ref=${e.refCode}`}>Share your experience</Link> : null}
                </li>
              ))}
            </ul>
          </Panel>
          <SignInMethods />
          <PasswordSection />
        </div>
        <div className="flex flex-col gap-5">
          <Panel title="Profile">
            <form onSubmit={saveName} className="flex flex-col gap-2">
              <label className="label" htmlFor="dn">Name shown on reviews (first name only)</label>
              <input id="dn" className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={80} />
              <button className="btn-dark self-start">{saved ? 'Saved' : 'Save'}</button>
            </form>
          </Panel>
          {me.vendors?.length ? (
            <Panel title={`Your business${me.vendors.length > 1 ? 'es' : ''}`}>
              <p className="text-[14px] text-muted">{me.vendors.map((v) => v.name).join(', ')}</p>
              <Link href="/vendor" className="btn-dark mt-3">Open the business console</Link>
            </Panel>
          ) : (
            <Panel title="Run a business?">
              <p className="text-[14px] text-muted">A camp, a 4x4, a tour, a salon or a workshop: list it free from this same account.</p>
              <Link href="/vendor" className="btn-outline mt-3">List your business</Link>
            </Panel>
          )}
          <Panel title="Sign out and privacy">
            <div className="flex flex-col items-start gap-2">
              <button className="btn-outline" onClick={signOut}>Sign out</button>
              <button className="btn-ghost px-0 text-danger" onClick={deleteAccount}>Delete my account and data</button>
            </div>
          </Panel>
        </div>
      </div>
    </Area>
  );
}
