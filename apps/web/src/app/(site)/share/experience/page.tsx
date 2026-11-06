'use client';

import { Page as KPage, SideCard } from '@/components/Page';
import { Done, Media } from '@/components/bits';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { AuthForm } from '@/components/AuthForm';
import { Icon } from '@/components/Icon';
import { CATEGORY_SINGULAR, TRAVELLER_TYPE_LABEL, isSettle, type Category } from '@/lib/types';

type L = { id: string; slug: string; title: string; city: string; vendorName: string; category: Category; currency: string; priceUnit: string; photos?: { url: string }[] };
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

  const base = [{ label: 'Share', href: '/share' }];
  if (loadErr) {
    return (
      <KPage crumbs={[...base, { label: 'Your experience' }]} title="Share your experience" desc={loadErr}>
        <div><Link href="/share#rate" className="btn-primary">Find a business</Link></div>
      </KPage>
    );
  }
  if (!l) return <KPage crumbs={[...base, { label: 'Your experience' }]} title="Share your experience"><p className="text-muted">Loading…</p></KPage>;

  const crumbs = [...base, { label: l.title, href: `/listing/${l.slug}` }, { label: 'Your experience' }];
  const aside = (
    <>
      <Link href={`/listing/${l.slug}`} className="card group flex flex-col overflow-hidden">
        <Media category={l.category} photoUrl={l.photos?.[0]?.url} alt={l.title} className="aspect-[16/9]" />
        <span className="p-4">
          <strong className="block group-hover:underline">{l.title}</strong>
          <span className="text-[13px] text-muted">{CATEGORY_SINGULAR[l.category]} · {l.city} · {l.vendorName}</span>
        </span>
      </Link>
      <SideCard title="What makes it useful">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
          <li><b className="text-ink">What you paid</b>: it shows next to the business’s own price.</li>
          <li>Was it as described? On time? Hot water, vehicle condition?</li>
          <li>How you were treated, and anything the next traveller should know.</li>
        </ul>
      </SideCard>
    </>
  );

  if (!me.user) {
    return (
      <KPage crumbs={crumbs} title="Share your experience" desc="Ratings need a free account, so every star has a real traveller behind it. We show only your first name." aside={aside}>
        <div className="card p-5">
          <AuthForm next={`/share/experience?listing=${l.slug}${ref ? `&ref=${ref}` : ''}`} />
        </div>
        <p className="text-[14px]">Only want to share a price? <Link href={`/safety/prices/add?listing=${l.slug}`} className="font-semibold text-brand underline">Do that without an account</Link>.</p>
      </KPage>
    );
  }

  if (done) {
    return (
      <KPage crumbs={crumbs} title={done.updated ? 'Your experience is updated' : 'Thanks for sharing'} aside={aside}>
        <Done title="It’s on the listing">
          It’s now on {l.title}’s page{done.contacted ? ', marked “Contacted via Karibu” because it matches your enquiry' : ''}. The business can reply, and you can update it any time.
        </Done>
        <div className="flex flex-wrap gap-3">
          <Link href={`/listing/${l.slug}`} className="btn-primary">See it on the listing</Link>
          <Link href="/share" className="btn-outline">Share something else</Link>
        </div>
      </KPage>
    );
  }

  return (
    <KPage crumbs={crumbs} title="Share your experience" desc={`${CATEGORY_SINGULAR[l.category]} · ${l.city} · ${l.vendorName}`} aside={aside}>
    <form onSubmit={submit} className="card flex flex-col gap-6 p-5">
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

      <fieldset className="rounded-lg border border-line p-4">
        <legend className="px-1 font-semibold">What did you pay? (optional)</legend>
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
    </KPage>
  );
}

export default function Page() {
  return <Suspense fallback={null}><ShareExperience /></Suspense>;
}
