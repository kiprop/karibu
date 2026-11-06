'use client';

import { Area, AreaHead } from '@/components/RailShell';
import { SideCard } from '@/components/Page';
import { PhotoUploader } from '@/components/PhotoUploader';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { call } from '@/lib/client-api';
import { AMENITY_LABEL, CATEGORY_SINGULAR, type Category } from '@/lib/types';

type City = { id: number; name: string; slug: string; lat: number; lon: number; isLive: boolean };
type Meta = { categories: Record<Category, string[]>; amenities: string[] };

const AMENITIES_BY_CAT: Record<Category, string[]> = {
  stay: ['hot_water', 'wifi', 'power_backup', 'solar', 'pool', 'breakfast', 'meals_included', 'family_rooms', 'parking', 'wheelchair_access', 'airport_pickup'],
  safari: ['pop_top_roof', 'window_seats', 'vehicle_charging', 'vehicle_fridge', 'park_fees_included', 'meals_included'],
  transport: ['airport_pickup', 'vehicle_charging', 'wheelchair_access'],
  guide: ['family_friendly', 'wheelchair_access'],
  experience: ['family_friendly', 'meals_included', 'wheelchair_access'],
  event: ['family_friendly', 'wheelchair_access'],
  home: ['wifi', 'power_backup', 'backup_water', 'hot_water', 'gated_compound', 'parking', 'pet_friendly', 'pool', 'wheelchair_access'],
  furniture: ['delivery', 'installation', 'card_payment', 'mpesa'],
  home_services: ['card_payment', 'mpesa'],
  utilities: ['installation', 'card_payment', 'mpesa'],
  grooming: ['walk_ins', 'home_visits', 'card_payment', 'mpesa', 'wheelchair_access'],
};
const UNITS = ['per night', 'per person', 'per vehicle per day', 'per seat', 'per group', 'per ticket', 'per month', 'per item', 'per visit', 'per hour', 'per job', 'per service'];
const DEFAULT_UNIT: Record<Category, string> = { stay: 'per night', safari: 'per vehicle per day', transport: 'per group', guide: 'per person', experience: 'per person', event: 'per ticket', home: 'per month', furniture: 'per item', home_services: 'per job', utilities: 'per month', grooming: 'per service' };

export type ListingValues = {
  cityId?: number; category: Category; subtype: string; title: string; summary: string; description?: string;
  lat?: number; lon?: number; locationIsPrivate: boolean; budgetTier?: string; priceFrom?: number; priceTo?: number; priceUnit: string;
  attributes: Record<string, any>; amenities: string[]; photos: { url: string; alt: string }[];
};

function num(v: string) {
  return v === '' ? undefined : Number(v);
}

export function ListingForm({ id, initial }: { id?: string; initial?: ListingValues }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [v, setV] = useState<ListingValues>(
    initial ?? { category: 'stay', subtype: 'tented camp', title: '', summary: '', locationIsPrivate: false, priceUnit: 'per night', attributes: {}, amenities: [], photos: [] },
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = v.attributes;
  const setA = (k: string, val: any) => setV({ ...v, attributes: { ...a, [k]: val === '' || val === undefined || (Array.isArray(val) && !val.length) ? undefined : val } });

  useEffect(() => {
    call<Meta>('/meta').then(setMeta);
    call<{ cities: City[] }>('/cities?country=KE').then((r) => setCities(r.cities));
  }, []);
  const city = useMemo(() => cities.find((c) => c.id === v.cityId), [cities, v.cityId]);

  function setCategory(c: Category) {
    setV({ ...v, category: c, subtype: meta?.categories[c][0] ?? '', attributes: {}, amenities: [], priceUnit: DEFAULT_UNIT[c], budgetTier: c === 'stay' ? v.budgetTier : undefined });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const lat = v.lat ?? city?.lat;
    const lon = v.lon ?? city?.lon;
    const body = {
      ...v,
      lat, lon,
      attributes: Object.fromEntries(Object.entries(a).filter(([, x]) => x !== undefined)),
      photos: v.photos.filter((p) => p.url.trim()),
    };
    try {
      if (id) await call(`/vendor/listings/${id}`, { method: 'PUT', body });
      else await call('/vendor/listings', { body });
      location.href = '/vendor';
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setV({ ...v, lat: Number(p.coords.latitude.toFixed(5)), lon: Number(p.coords.longitude.toFixed(5)) }),
      () => setErr('Could not read your location. Enter it by hand or leave the destination centre.'),
    );
  }

  if (!meta) return <Area><p className="text-muted">Loading…</p></Area>;
  const cat = v.category;
  const languages = (a.guideLanguages ?? a.languages ?? []).join(', ');

  return (
    <Area>
    <AreaHead crumbs={[{ label: 'My business', href: '/vendor' }, { label: 'Listings', href: '/vendor?view=listings' }, { label: id ? 'Edit listing' : 'New listing' }]}
      title={id ? 'Edit listing' : 'New listing'}
      desc={id ? 'Changes to a live listing go back to our team for a quick check before travellers see them.' : 'Save a draft any time. Submit it for review from your listings when it’s ready.'} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <form onSubmit={save} className="flex min-w-0 flex-col gap-5">

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 section-title">What are you listing?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(meta.categories) as Category[]).map((c, i) => (
            <label key={c} className={`pill cursor-pointer ${cat === c ? 'pill-on' : ''}`}>
              <input type="radio" name="cat" className="sr-only" checked={cat === c} onChange={() => setCategory(c)} />
              {CATEGORY_SINGULAR[c]}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="sub">Type</label><select id="sub" className="input" value={v.subtype} onChange={(e) => setV({ ...v, subtype: e.target.value })}>{meta.categories[cat].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></div>
          <div><label className="label" htmlFor="city">Destination</label><select id="city" required className="input" value={v.cityId ?? ''} onChange={(e) => setV({ ...v, cityId: Number(e.target.value), lat: undefined, lon: undefined })}><option value="">Choose</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isLive ? '' : ' (opening soon)'}</option>)}</select></div>
        </div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 section-title">Describe it</legend>
        <div><label className="label" htmlFor="t">Title</label><input id="t" required minLength={3} maxLength={120} className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={cat === 'safari' ? 'Full-day Mara game drive, private pop-top' : 'Lakeside tented camp at Naivasha'} /></div>
        <div><label className="label" htmlFor="s">One-line summary ({v.summary.length}/200)</label><input id="s" required minLength={10} maxLength={200} className="input" value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></div>
        <div><label className="label" htmlFor="d">Full description</label><textarea id="d" maxLength={5000} className="input min-h-[120px] py-2" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 section-title">Photos</legend>
        <PhotoUploader photos={v.photos} onChange={(photos) => setV({ ...v, photos })} max={12}
          upload={async (blob) => { const f = new FormData(); f.append('file', blob, 'photo.jpg'); const r = await call<{ url: string }>('/vendor/photos', { form: f }); return { url: r.url, alt: '' }; }}
          note="Use your own photos, or ones you have permission to use. The first photo is the cover in search results. Photos are saved when you save the listing." />
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 section-title">Key facts travellers compare</legend>
        {cat === 'stay' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="bt">Budget tier</label><select id="bt" required className="input" value={v.budgetTier ?? ''} onChange={(e) => setV({ ...v, budgetTier: e.target.value || undefined })}><option value="">Choose</option><option value="budget">Budget</option><option value="mid">Mid-range</option><option value="premium">Premium</option></select></div>
            <div><label className="label" htmlFor="set">Setting</label><select id="set" className="input" value={a.setting ?? ''} onChange={(e) => setA('setting', e.target.value)}><option value="">Choose</option>{['city', 'bush', 'beach', 'lake', 'mountain'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className="label" htmlFor="hw">Hot water hours</label><input id="hw" className="input" value={a.hotWaterHours ?? ''} onChange={(e) => setA('hotWaterHours', e.target.value)} placeholder="24 hours, or 6am to 10pm" /></div>
            <div><label className="label" htmlFor="wf">Wi-Fi speed (Mbps, measured)</label><input id="wf" type="number" min={0} className="input" value={a.wifiMbps ?? ''} onChange={(e) => setA('wifiMbps', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="ng">Nearest park gate or beach</label><input id="ng" className="input" value={a.nearestGate ?? ''} onChange={(e) => setA('nearestGate', e.target.value)} /></div>
            <div><label className="label" htmlFor="rm">Rooms or tents</label><input id="rm" type="number" min={1} className="input" value={a.rooms ?? ''} onChange={(e) => setA('rooms', num(e.target.value))} /></div>
          </div>
        ) : null}
        {cat === 'safari' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="pk">Park or reserve</label><input id="pk" required className="input" value={a.park ?? ''} onChange={(e) => setA('park', e.target.value)} placeholder="Maasai Mara National Reserve" /></div>
            <div><label className="label" htmlFor="fm">Vehicle use</label><select id="fm" className="input" value={a.format ?? ''} onChange={(e) => setA('format', e.target.value)}><option value="">Choose</option><option value="private">Private</option><option value="shared">Shared</option></select></div>
            <div><label className="label" htmlFor="vh">Vehicle</label><input id="vh" className="input" value={a.vehicle ?? ''} onChange={(e) => setA('vehicle', e.target.value)} placeholder="Pop-top Land Cruiser, 6 seats" /></div>
            <div><label className="label" htmlFor="pu">Pickup</label><input id="pu" className="input" value={a.pickup ?? ''} onChange={(e) => setA('pickup', e.target.value)} /></div>
            <div><label className="label" htmlFor="du">Duration (hours)</label><input id="du" type="number" min={1} className="input" value={a.durationHours ?? ''} onChange={(e) => setA('durationHours', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="gl">Guide languages (comma separated)</label><input id="gl" className="input" defaultValue={languages} onBlur={(e) => setA('guideLanguages', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></div>
          </div>
        ) : null}
        {cat === 'transport' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="tv">Vehicle</label><input id="tv" className="input" value={a.vehicle ?? ''} onChange={(e) => setA('vehicle', e.target.value)} /></div>
            <div><label className="label" htmlFor="ts">Seats</label><input id="ts" type="number" min={1} className="input" value={a.seats ?? ''} onChange={(e) => setA('seats', num(e.target.value))} /></div>
            {v.subtype === 'bush flight desk' ? <div><label className="label" htmlFor="bk">Baggage limit (kg)</label><input id="bk" type="number" min={0} className="input" value={a.baggageKg ?? ''} onChange={(e) => setA('baggageKg', num(e.target.value))} /></div> : null}
          </div>
        ) : null}
        {cat === 'guide' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="gls">Languages (comma separated)</label><input id="gls" className="input" defaultValue={languages} onBlur={(e) => setA('languages', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} /></div>
            <div><label className="label" htmlFor="acc">Accreditation</label><input id="acc" className="input" value={a.accreditation ?? ''} onChange={(e) => setA('accreditation', e.target.value)} /></div>
            <div><label className="label" htmlFor="mg">Maximum group size</label><input id="mg" type="number" min={1} className="input" value={a.maxGroup ?? ''} onChange={(e) => setA('maxGroup', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="gd">Duration (hours)</label><input id="gd" type="number" min={0.5} step={0.5} className="input" value={a.durationHours ?? ''} onChange={(e) => setA('durationHours', num(e.target.value))} /></div>
          </div>
        ) : null}
        {cat === 'experience' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="ed">Duration (hours)</label><input id="ed" type="number" min={0.5} step={0.5} className="input" value={a.durationHours ?? ''} onChange={(e) => setA('durationHours', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="ma">Minimum age</label><input id="ma" type="number" min={0} className="input" value={a.minAge ?? ''} onChange={(e) => setA('minAge', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="fi">Fitness</label><select id="fi" className="input" value={a.fitness ?? ''} onChange={(e) => setA('fitness', e.target.value)}><option value="">Choose</option><option value="easy">Easy</option><option value="moderate">Moderate</option><option value="hard">Hard</option></select></div>
            <label className="flex items-center gap-2 self-end text-[15px]"><input type="checkbox" checked={!!a.permitNeeded} onChange={(e) => setA('permitNeeded', e.target.checked || undefined)} className="h-5 w-5" />A permit is needed</label>
          </div>
        ) : null}
        {cat === 'event' ? <div><label className="label" htmlFor="ve">Venue</label><input id="ve" className="input" value={a.venue ?? ''} onChange={(e) => setA('venue', e.target.value)} /></div> : null}
        {cat === 'home' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="hb">Bedrooms</label><input id="hb" type="number" min={0} className="input" value={a.bedrooms ?? ''} onChange={(e) => setA('bedrooms', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="hba">Bathrooms</label><input id="hba" type="number" min={0} className="input" value={a.bathrooms ?? ''} onChange={(e) => setA('bathrooms', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="hf">Furnishing</label><select id="hf" className="input" value={a.furnished ?? ''} onChange={(e) => setA('furnished', e.target.value)}><option value="">Choose</option><option value="furnished">Furnished</option><option value="semi">Partly furnished</option><option value="unfurnished">Unfurnished</option></select></div>
            <div><label className="label" htmlFor="hn">Neighbourhood</label><input id="hn" className="input" value={a.neighbourhood ?? ''} onChange={(e) => setA('neighbourhood', e.target.value)} /></div>
            <div><label className="label" htmlFor="hl">Minimum lease (months)</label><input id="hl" type="number" min={1} className="input" value={a.minLeaseMonths ?? ''} onChange={(e) => setA('minLeaseMonths', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="hd">Deposit (months of rent)</label><input id="hd" type="number" min={0} step={0.5} className="input" value={a.depositMonths ?? ''} onChange={(e) => setA('depositMonths', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="haf">Available from</label><input id="haf" type="date" className="input" value={a.availableFrom ?? ''} onChange={(e) => setA('availableFrom', e.target.value)} /></div>
            <label className="flex items-center gap-2 self-end text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!a.utilitiesIncluded} onChange={(e) => setA('utilitiesIncluded', e.target.checked || undefined)} />Utilities included in rent</label>
          </div>
        ) : null}
        {cat === 'furniture' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="fs">You sell</label><select id="fs" className="input" value={a.sells ?? ''} onChange={(e) => setA('sells', e.target.value)}><option value="">Choose</option><option value="new">New</option><option value="used">Second-hand</option><option value="both">Both</option></select></div>
            <div><label className="label" htmlFor="fsc">Size of business</label><select id="fsc" className="input" value={a.scale ?? ''} onChange={(e) => setA('scale', e.target.value)}><option value="">Choose</option><option value="workshop">Workshop or fundi</option><option value="shop">Shop</option><option value="chain">Store chain</option></select></div>
            <div><label className="label" htmlFor="flt">Typical lead time (days)</label><input id="flt" type="number" min={0} className="input" value={a.leadTimeDays ?? ''} onChange={(e) => setA('leadTimeDays', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="fw">Warranty (months)</label><input id="fw" type="number" min={0} className="input" value={a.warrantyMonths ?? ''} onChange={(e) => setA('warrantyMonths', num(e.target.value))} /></div>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!a.madeToOrder} onChange={(e) => setA('madeToOrder', e.target.checked || undefined)} />Made to order</label>
          </div>
        ) : null}
        {cat === 'home_services' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="sa">Areas you cover</label><input id="sa" className="input" value={a.serviceArea ?? ''} onChange={(e) => setA('serviceArea', e.target.value)} /></div>
            <div><label className="label" htmlFor="sc">Call-out fee (KES)</label><input id="sc" type="number" min={0} className="input" value={a.calloutFee ?? ''} onChange={(e) => setA('calloutFee', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="sh">Hours</label><input id="sh" className="input" value={a.hours ?? ''} onChange={(e) => setA('hours', e.target.value)} placeholder="Mon to Sat, 8am to 6pm" /></div>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!a.staffVetted} onChange={(e) => setA('staffVetted', e.target.checked || undefined)} />Staff are ID-checked</label>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!a.insured} onChange={(e) => setA('insured', e.target.checked || undefined)} />Insured</label>
            <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!a.sameDay} onChange={(e) => setA('sameDay', e.target.checked || undefined)} />Same-day jobs</label>
          </div>
        ) : null}
        {cat === 'utilities' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="uc">Coverage</label><input id="uc" className="input" value={a.coverage ?? ''} onChange={(e) => setA('coverage', e.target.value)} placeholder="Neighbourhoods or towns you serve" /></div>
            <div><label className="label" htmlFor="ui">Installation time (days)</label><input id="ui" type="number" min={0} className="input" value={a.installDays ?? ''} onChange={(e) => setA('installDays', num(e.target.value))} /></div>
            <div><label className="label" htmlFor="us">Top speed (Mbps)</label><input id="us" type="number" min={0} className="input" value={a.speedMbps ?? ''} onChange={(e) => setA('speedMbps', num(e.target.value))} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="uct">Contract</label><input id="uct" className="input" value={a.contract ?? ''} onChange={(e) => setA('contract', e.target.value)} placeholder="Monthly, no lock-in" /></div>
          </div>
        ) : null}
        {cat === 'grooming' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="sm:col-span-2"><legend className="label mb-2">Hair types you specialise in</legend>
              <div className="flex flex-wrap gap-2">
                {[['afro', 'Afro'], ['curly', 'Curly'], ['straight', 'Straight'], ['all', 'All types']].map(([k, t]) => {
                  const on = (a.hairTypes ?? []).includes(k);
                  return <label key={k} className={`pill cursor-pointer ${on ? 'pill-on' : ''}`}><input type="checkbox" className="sr-only" checked={on} onChange={() => setA('hairTypes', on ? (a.hairTypes ?? []).filter((x: string) => x !== k) : [...(a.hairTypes ?? []), k])} />{t}</label>;
                })}
              </div>
            </fieldset>
            <div><label className="label" htmlFor="gs">Services (comma separated)</label><input id="gs" className="input" defaultValue={(a.services ?? []).join(', ')} onBlur={(e) => setA('services', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></div>
            <div><label className="label" htmlFor="gh">Hours</label><input id="gh" className="input" value={a.hours ?? ''} onChange={(e) => setA('hours', e.target.value)} /></div>
          </div>
        ) : null}
        <fieldset>
          <legend className="label mb-2">Included or available</legend>
          <div className="flex flex-wrap gap-2">
            {AMENITIES_BY_CAT[cat].map((am) => (
              <label key={am} className={`pill cursor-pointer ${v.amenities.includes(am) ? 'pill-on' : ''}`}>
                <input type="checkbox" className="sr-only" checked={v.amenities.includes(am)} onChange={(e) => setV({ ...v, amenities: e.target.checked ? [...v.amenities, am] : v.amenities.filter((x) => x !== am) })} />
                {AMENITY_LABEL[am]}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 section-title">Price</legend>
        <p className="text-[14px] text-muted">Show an honest range in Kenyan shillings. Travellers agree the final price with you directly.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="pf">From (KES)</label><input id="pf" type="number" min={0} className="input" value={v.priceFrom ?? ''} onChange={(e) => setV({ ...v, priceFrom: num(e.target.value) })} /></div>
          <div><label className="label" htmlFor="pt">To (KES)</label><input id="pt" type="number" min={0} className="input" value={v.priceTo ?? ''} onChange={(e) => setV({ ...v, priceTo: num(e.target.value) })} /></div>
          <div><label className="label" htmlFor="pu2">Per</label><select id="pu2" className="input" value={v.priceUnit} onChange={(e) => setV({ ...v, priceUnit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        </div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 section-title">Location</legend>
        <p className="text-[14px] text-muted">Defaults to the centre of {city?.name ?? 'the destination'}. Set the exact spot so travellers see the right distance.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div><label className="label" htmlFor="la">Latitude</label><input id="la" type="number" step="0.00001" className="input" value={v.lat ?? city?.lat ?? ''} onChange={(e) => setV({ ...v, lat: num(e.target.value) })} /></div>
          <div><label className="label" htmlFor="lo">Longitude</label><input id="lo" type="number" step="0.00001" className="input" value={v.lon ?? city?.lon ?? ''} onChange={(e) => setV({ ...v, lon: num(e.target.value) })} /></div>
          <button type="button" className="btn-outline self-end" onClick={useMyLocation}>Use where I am</button>
        </div>
        <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={v.locationIsPrivate} onChange={(e) => setV({ ...v, locationIsPrivate: e.target.checked })} />This is my home. Show travellers only the area (needs a visit from our team).</label>
      </fieldset>

      {err ? <p role="alert" className="rounded-xl bg-danger-soft p-3 font-semibold text-danger">{err}</p> : null}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Save draft'}</button>
        <Link href="/vendor" className="btn-ghost">Cancel</Link>
      </div>
      <p className="text-[13px] text-muted">After saving, submit the listing for review from your dashboard. We review within 2 working days.</p>
    </form>
    <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
      <SideCard title="What travellers look at first">
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
          <li><b className="text-ink">Real photos.</b> Rooms, bathrooms, vehicles, the view. No stock pictures.</li>
          <li><b className="text-ink">An honest price</b> with what it includes.</li>
          <li><b className="text-ink">Key facts</b> they can compare: hot water hours, Wi-Fi speed, pop-top roof.</li>
        </ul>
      </SideCard>
      <SideCard title="Review">
        <p className="text-muted">Our team checks every new listing and every change within 2 working days. Verification is free.</p>
      </SideCard>
    </aside>
    </div>
    </Area>
  );
}
