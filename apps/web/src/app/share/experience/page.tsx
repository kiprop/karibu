'use client';

import { Breadcrumbs } from '@/components/Breadcrumbs';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { AuthForm } from '@/components/AuthForm';
import { Icon } from '@/components/Icon';
import { CATEGORY_SINGULAR, TRAVELLER_TYPE_LABEL, isSettle, type Category } from '@/lib/types';

type L = { id: string; slug: string; title: string; city: string; vendorName: string; category: Category; currency: string; priceUnit: string };
const GROUP_FOR: Record<Category, string> = {
  stay: 'stay', safari: 'activity', transport: 'transport', guide: 'activity', experience: 'activity', event: 'activity',
  home: 'home', furniture: 'home', home_services: 'services', utilities: 'utilities', grooming: 'grooming',
};
const today = () => new Date().toISOString().slice(0, 10);
const STAR_WORDS = ['', 'Poor', 'Not great', 'OK', 'Good', 'Excellent'];

function ShareExperience() {
  const sp = useSearchParams();
  const slug = sp.get('listing') ?? '';
  const ref = sp.get('ref') ?? undefined;
  const { me } = useSession();
  const [l, setL] = useState<L | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [visitedOn, setVisitedOn] = useState(today());
  const [travellerType, setTravellerType] = useState('');
  const [body, setBody] = useState('');
  const [paidItem, setPaidItem] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paidUnit, setPaidUnit] = useState('');
  const [feel, setFeel] = useState<'' | 'fair' | 'high' | 'ripoff'>('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ contacted: boolean; updated: boolean } | null>(null);

  useEffect(() => {
    if (!slug) return setLoadErr('Choose a business to share your experience with.');
    call<{ listing: L }>(`/listings/${slug}`)
      .then((r) => { setL(r.listing); setPaidUnit(r.listing.priceUnit); })
      .catch((e) => setLoadErr((e as Error).message));
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setErr('Choose a star rating');
    if (paidAmount && paidItem.trim().length < 2) return setErr('Say what you paid for, for example “Full-day game drive”');
    setErr(null);
    setBusy(true);
    try {
      const r = await call<{ contacted: boolean; updated: boolean }>('/experiences', {
        body: {
          listingSlug: slug, rating, recommend: recommend ?? undefined, travellerType: travellerType || undefined, body: body || undefined, visitedOn, refCode: ref,
          price: paidAmount ? { group: GROUP_FOR[l!.category], item: paidItem, amount: Number(paidAmount), unit: paidUnit || undefined, feel: feel || undefined } : undefined,
        },
      });
      setDone(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) {
    return (
      <div className="container-k max-w-xl py-10">
        <Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: 'Your experience' }]} />
        <h1 className="mt-3 font-display text-2xl font-extrabold">Share your experience</h1>
        <p className="mt-2 text-muted">{loadErr}</p>
        <Link href="/share#rate" className="btn-primary mt-6">Find a business</Link>
      </div>
    );
  }
  if (!l) return <div className="container-k py-12 text-muted">Loading…</div>;

  const header = (
    <div>
      <Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: l.title, href: `/listing/${l.slug}` }, { label: 'Your experience' }]} />
      <h1 className="mt-3 font-display text-3xl font-extrabold">Share your experience</h1>
      <p className="mt-1 text-muted">{CATEGORY_SINGULAR[l.category]} · {l.city} · {l.vendorName}</p>
    </div>
  );

  if (!me.user) {
    return (
      <div className="container-k flex max-w-xl flex-col gap-5 py-10">
        {header}
        <div className="rounded-2xl bg-soft p-5">
          <h2 className="text-lg font-extrabold">Sign in to rate</h2>
          <p className="mt-1 text-[15px]">Ratings need a free account, so every star has a real traveller behind it. We show only your first name.</p>
          <div className="mt-4"><AuthForm next={`/share/experience?listing=${l.slug}${ref ? `&ref=${ref}` : ''}`} /></div>
        </div>
        <p className="text-[14px]">Only want to share a price? <Link href={`/safety/prices/add?listing=${l.slug}`} className="font-bold text-brand underline">Do that without an account</Link>.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="container-k flex max-w-xl flex-col gap-4 py-10">
        <Breadcrumbs items={[{ label: 'Share', href: '/share' }, { label: l.title, href: `/listing/${l.slug}` }, { label: 'Thanks' }]} />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-teal text-white"><Icon name="check" strokeWidth={3} /></span>
        <h1 className="font-display text-3xl font-extrabold">{done.updated ? 'Your experience is updated' : 'Thanks for sharing'}</h1>
        <p className="text-muted">
          It’s now on {l.title}’s page{done.contacted ? ', marked “Contacted via Karibu” because it matches your enquiry' : ''}. The business can reply, and you can update it any time.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/listing/${l.slug}`} className="btn-primary">See it on the listing</Link>
          <Link href="/share" className="btn-outline">Share something else</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="container-k flex max-w-xl flex-col gap-6 py-10">
      {header}

      <fieldset>
        <legend className="label mb-2">Overall rating</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={rating === n} onClick={() => setRating(n)}
              className={`text-4xl leading-none ${n <= rating ? 'text-star' : 'text-line'}`}>★</button>
          ))}
          <span className="ml-3 font-bold">{STAR_WORDS[rating]}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend className="label mb-2">Would you recommend it to a friend?</legend>
        <div className="flex gap-2">
          {[[true, 'Yes'], [false, 'No']].map(([v, t]) => (
            <label key={String(v)} className={`pill cursor-pointer ${recommend === v ? 'pill-on' : ''}`}>
              <input type="radio" name="rec" className="sr-only" checked={recommend === v} onChange={() => setRecommend(v as boolean)} />{t as string}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label mb-2">Who were you? (helps people like you find your experience)</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(TRAVELLER_TYPE_LABEL).map(([k, t]) => (
            <label key={k} className={`pill cursor-pointer ${travellerType === k ? 'pill-on' : ''}`}>
              <input type="radio" name="tt" className="sr-only" checked={travellerType === k} onChange={() => setTravellerType(travellerType === k ? '' : k)} />{t}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="vd">{isSettle(l.category) ? 'When did you use them?' : 'When did you go?'}</label>
        <input id="vd" type="date" max={today()} className="input" value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)} />
      </div>

      <fieldset className="rounded-2xl border border-line p-4">
        <legend className="px-1 font-extrabold">What did you pay? (optional)</legend>
        <p className="text-[13px] text-muted">The most useful thing you can share. It shows next to the business’s own listed price.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label" htmlFor="pi">For what</label><input id="pi" maxLength={80} className="input" value={paidItem} onChange={(e) => setPaidItem(e.target.value)} placeholder={l.category === 'stay' ? 'Double room with breakfast' : l.category === 'safari' ? 'Full-day game drive, private' : 'Airport transfer'} /></div>
          <div><label className="label" htmlFor="pa">Amount ({l.currency})</label><input id="pa" type="number" min={1} inputMode="numeric" className="input" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></div>
          <div><label className="label" htmlFor="pu">Per</label><input id="pu" maxLength={40} className="input" value={paidUnit} onChange={(e) => setPaidUnit(e.target.value)} /></div>
        </div>
        {paidAmount ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {[['fair', 'Fair price'], ['high', 'A bit high'], ['ripoff', 'I was overcharged']].map(([v, t]) => (
              <label key={v} className={`pill cursor-pointer ${feel === v ? 'pill-on' : ''}`}>
                <input type="radio" name="feel" className="sr-only" checked={feel === v} onChange={() => setFeel(v as typeof feel)} />{t}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <div>
        <label className="label" htmlFor="b">What was it like? (optional, {2000 - body.length} left)</label>
        <textarea id="b" maxLength={2000} className="input min-h-[130px] py-2" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Was it as described? Were they on time? Hot water, vehicle condition, how they treated you, anything the next traveller should know." />
        <p className="mt-1 text-[12px] text-muted">Stick to what happened to you. No names of staff, phone numbers or personal details; our team removes posts that break this.</p>
      </div>

      {err ? <p role="alert" className="rounded-xl bg-danger-soft p-3 font-semibold text-danger">{err}</p> : null}
      <button className="btn-primary self-start" disabled={busy}>{busy ? 'Posting…' : 'Post my experience'}</button>
      <p className="text-[13px] text-muted">Posting as {me.user.displayName?.split(' ')[0] || 'Traveller'}. You can set your first name in <Link href="/account" className="underline">your account</Link>.</p>
    </form>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="container-k py-12 text-muted">Loading…</div>}><ShareExperience /></Suspense>;
}
