'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';
import { Verdict, type FairResult } from '../Verdict';

type City = { slug: string; name: string };
const GROUPS = [
  ['food', 'Food'], ['drink', 'Drink'], ['transport', 'Ride or transport'], ['activity', 'Tour or activity'],
  ['stay', 'Stay'], ['shopping', 'Shopping'], ['other', 'Other'],
] as const;
const FEELS = [['fair', 'Fair'], ['high', 'A bit high'], ['ripoff', 'I was overcharged']] as const;
const today = () => new Date().toISOString().slice(0, 10);

function AddPrice() {
  const sp = useSearchParams();
  const listingSlug = sp.get('listing') ?? '';
  const [cities, setCities] = useState<City[]>([]);
  const [listing, setListing] = useState<{ title: string; city: string; currency: string; category: string } | null>(null);
  const [city, setCity] = useState(sp.get('city') ?? 'nairobi');
  const [items, setItems] = useState<string[]>([]);
  const [f, setF] = useState({
    group: listingSlug ? 'activity' : 'food', item: sp.get('item') ?? '', amount: sp.get('amount') ?? '', unit: '', area: '',
    paidOn: today(), feel: '' as '' | 'fair' | 'high' | 'ripoff', negotiated: false, note: '',
  });
  const [done, setDone] = useState<(FairResult & { amount: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    call<{ cities: City[] }>('/cities?country=KE').then((r) => setCities(r.cities)).catch(() => {});
    if (listingSlug) {
      call<{ listing: any }>(`/listings/${listingSlug}`)
        .then(({ listing: l }) => {
          setListing({ title: l.title, city: l.city, currency: l.currency, category: l.category });
          setCity(l.citySlug);
          set('group', l.category === 'stay' ? 'stay' : l.category === 'transport' ? 'transport' : 'activity');
          if (!sp.get('item')) set('item', l.title.slice(0, 80));
        })
        .catch(() => setErr('That listing isn’t available any more. You can still add a price for the city.'));
    }
  }, [listingSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    call<{ prices: { item: string }[]; community: { item: string }[] }>(`/cities/${city}/prices`)
      .then((b) => setItems([...new Set([...b.prices.map((p) => p.item), ...b.community.map((c) => c.item)])].sort()))
      .catch(() => setItems([]));
  }, [city]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await call<FairResult>('/prices/reports', {
        body: {
          ...(listingSlug && listing ? { listingSlug } : { city }),
          group: f.group, item: f.item, amount: Number(f.amount), unit: f.unit || undefined, area: f.area || undefined,
          paidOn: f.paidOn, feel: f.feel || undefined, negotiated: f.negotiated || undefined, note: f.note || undefined,
        },
      });
      setDone({ ...r, amount: Number(f.amount) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const currency = listing?.currency ?? 'KES';

  if (done) {
    return (
      <div className="container-k flex max-w-2xl flex-col gap-5 py-10">
        <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-teal text-white"><Icon name="check" strokeWidth={3} /></span><h1 className="font-display text-3xl font-extrabold">Thanks, that helps</h1></div>
        <p className="text-muted">Your price is now part of what travellers see for {listing ? listing.title : 'this city'}. Here’s how it compares with what we knew before.</p>
        <Verdict r={done} amount={done.amount} reportHref={f.feel === 'ripoff' ? (listingSlug ? `/report?category=overcharged&subject=${encodeURIComponent(listing?.title ?? '')}` : '/report?category=overcharged') : undefined} />
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => { setDone(null); setF((x) => ({ ...x, item: '', amount: '', unit: '', note: '', feel: '', negotiated: false })); }}>Add another price</button>
          <Link href={`/safety/prices?city=${city}`} className="btn-outline">See prices in {cities.find((c) => c.slug === city)?.name ?? 'this city'}</Link>
          {listingSlug ? <Link href={`/listing/${listingSlug}`} className="btn-ghost">Back to listing</Link> : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="container-k flex max-w-2xl flex-col gap-5 py-10">
      <div>
        <Link href={`/safety/prices?city=${city}`} className="inline-flex items-center gap-1 text-[14px] font-bold text-muted"><Icon name="back" size={16} />Fair prices</Link>
        <h1 className="mt-3 font-display text-3xl font-extrabold">I paid this much</h1>
        <p className="mt-1 text-muted">Tell the next traveller what you really paid. No account needed, and we never show who you are.</p>
      </div>

      {listing ? (
        <div className="rounded-2xl bg-soft p-4"><span className="text-[13px] text-muted">At</span><div className="font-bold">{listing.title}</div><div className="text-[13px] text-muted">{listing.city}</div></div>
      ) : (
        <div>
          <label className="label" htmlFor="city">Where?</label>
          <select id="city" className="input" value={city} onChange={(e) => setCity(e.target.value)}>
            {cities.length ? cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>) : <option value={city}>{city}</option>}
          </select>
        </div>
      )}

      <fieldset>
        <legend className="label mb-2">What kind of thing?</legend>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map(([g, t]) => (
            <label key={g} className={`pill cursor-pointer ${f.group === g ? 'pill-on' : ''}`}>
              <input type="radio" name="group" className="sr-only" checked={f.group === g} onChange={() => set('group', g)} />{t}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="item">What exactly?</label>
        <input id="item" required minLength={2} maxLength={80} list="items" className="input" value={f.item} onChange={(e) => set('item', e.target.value)} placeholder="Plate of ugali with stew" />
        <datalist id="items">{items.map((i) => <option key={i} value={i} />)}</datalist>
        <p className="mt-1 text-[12px] text-muted">Pick a suggestion if it matches, so your price joins the others.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="amt">Amount paid ({currency})</label>
          <input id="amt" required type="number" min={1} inputMode="numeric" className="input" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="unit">Per (optional)</label>
          <input id="unit" maxLength={40} className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="per plate, per person, for 2 km" />
        </div>
        <div>
          <label className="label" htmlFor="paid">When?</label>
          <input id="paid" type="date" max={today()} className="input" value={f.paidOn} onChange={(e) => set('paidOn', e.target.value)} />
        </div>
        {!listing ? (
          <div>
            <label className="label" htmlFor="area">Area or place (optional)</label>
            <input id="area" maxLength={80} className="input" value={f.area} onChange={(e) => set('area', e.target.value)} placeholder="Westlands, Maasai Market" />
          </div>
        ) : null}
      </div>

      <fieldset>
        <legend className="label mb-2">How did it feel? (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {FEELS.map(([v, t]) => (
            <label key={v} className={`pill cursor-pointer ${f.feel === v ? 'pill-on' : ''}`}>
              <input type="radio" name="feel" className="sr-only" checked={f.feel === v} onChange={() => set('feel', f.feel === v ? '' : v)} />{t}
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={f.negotiated} onChange={(e) => set('negotiated', e.target.checked)} />I negotiated this price</label>
      </fieldset>

      <div>
        <label className="label" htmlFor="note">Tip for the next traveller (optional, {280 - f.note.length} left)</label>
        <textarea id="note" maxLength={280} className="input min-h-[80px] py-2" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Opening price was 4,000. Settled at 1,500." />
        <p className="mt-1 text-[12px] text-muted">Please don’t include names, phone numbers or anything personal. Our team removes reports that break this.</p>
      </div>

      {err ? <p role="alert" className="rounded-xl bg-danger-soft p-3 font-semibold text-danger">{err}</p> : null}
      <button className="btn-primary self-start" disabled={busy}>{busy ? 'Sending…' : 'Share my price'}</button>
    </form>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="container-k py-12 text-muted">Loading…</div>}>
      <AddPrice />
    </Suspense>
  );
}
