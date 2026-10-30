'use client';

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
};
const UNITS = ['per night', 'per person', 'per vehicle per day', 'per seat', 'per group', 'per ticket'];
const DEFAULT_UNIT: Record<Category, string> = { stay: 'per night', safari: 'per vehicle per day', transport: 'per group', guide: 'per person', experience: 'per person', event: 'per ticket' };

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

  if (!meta) return <div className="container-k py-12 text-muted">Loading…</div>;
  const cat = v.category;
  const languages = (a.guideLanguages ?? a.languages ?? []).join(', ');

  return (
    <form onSubmit={save} className="container-k flex max-w-3xl flex-col gap-6 py-8">
      <div>
        <Link href="/vendor" className="text-[14px] font-bold text-muted">Back to your business</Link>
        <h1 className="mt-2 font-display text-3xl font-extrabold">{id ? 'Edit listing' : 'New listing'}</h1>
        {id ? <p className="mt-1 text-muted">Changes to a live listing go back to our team for a quick check before travellers see them.</p> : null}
      </div>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 text-lg font-extrabold">What are you listing?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(meta.categories) as Category[]).map((c) => (
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
        <legend className="px-1 text-lg font-extrabold">Describe it</legend>
        <div><label className="label" htmlFor="t">Title</label><input id="t" required minLength={3} maxLength={120} className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={cat === 'safari' ? 'Full-day Mara game drive, private pop-top' : 'Lakeside tented camp at Naivasha'} /></div>
        <div><label className="label" htmlFor="s">One-line summary ({v.summary.length}/200)</label><input id="s" required minLength={10} maxLength={200} className="input" value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></div>
        <div><label className="label" htmlFor="d">Full description</label><textarea id="d" maxLength={5000} className="input min-h-[120px] py-2" value={v.description ?? ''} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 text-lg font-extrabold">Key facts travellers compare</legend>
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
        <legend className="px-1 text-lg font-extrabold">Price</legend>
        <p className="text-[14px] text-muted">Show an honest range in Kenyan shillings. Travellers agree the final price with you directly.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="pf">From (KES)</label><input id="pf" type="number" min={0} className="input" value={v.priceFrom ?? ''} onChange={(e) => setV({ ...v, priceFrom: num(e.target.value) })} /></div>
          <div><label className="label" htmlFor="pt">To (KES)</label><input id="pt" type="number" min={0} className="input" value={v.priceTo ?? ''} onChange={(e) => setV({ ...v, priceTo: num(e.target.value) })} /></div>
          <div><label className="label" htmlFor="pu2">Per</label><select id="pu2" className="input" value={v.priceUnit} onChange={(e) => setV({ ...v, priceUnit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        </div>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 text-lg font-extrabold">Location</legend>
        <p className="text-[14px] text-muted">Defaults to the centre of {city?.name ?? 'the destination'}. Set the exact spot so travellers see the right distance.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div><label className="label" htmlFor="la">Latitude</label><input id="la" type="number" step="0.00001" className="input" value={v.lat ?? city?.lat ?? ''} onChange={(e) => setV({ ...v, lat: num(e.target.value) })} /></div>
          <div><label className="label" htmlFor="lo">Longitude</label><input id="lo" type="number" step="0.00001" className="input" value={v.lon ?? city?.lon ?? ''} onChange={(e) => setV({ ...v, lon: num(e.target.value) })} /></div>
          <button type="button" className="btn-outline self-end" onClick={useMyLocation}>Use where I am</button>
        </div>
        <label className="flex items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={v.locationIsPrivate} onChange={(e) => setV({ ...v, locationIsPrivate: e.target.checked })} />This is my home. Show travellers only the area (needs a visit from our team).</label>
      </fieldset>

      <fieldset className="card flex flex-col gap-3 p-5">
        <legend className="px-1 text-lg font-extrabold">Photos</legend>
        <p className="text-[14px] text-muted">Use your own photos, or ones you have permission to use. Paste image links for now; direct upload is coming.</p>
        {[...v.photos, { url: '', alt: '' }].slice(0, 12).map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr]">
            <input aria-label={`Photo ${i + 1} link`} className="input" value={p.url} placeholder="https://…" onChange={(e) => { const ph = [...v.photos]; ph[i] = { ...p, url: e.target.value }; setV({ ...v, photos: ph }); }} />
            <input aria-label={`Photo ${i + 1} description`} className="input" value={p.alt} placeholder="What it shows" onChange={(e) => { const ph = [...v.photos]; ph[i] = { ...p, alt: e.target.value }; setV({ ...v, photos: ph }); }} />
          </div>
        ))}
      </fieldset>

      {err ? <p role="alert" className="rounded-xl bg-danger-soft p-3 font-semibold text-danger">{err}</p> : null}
      <div className="flex gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Save draft'}</button>
        <Link href="/vendor" className="btn-ghost">Cancel</Link>
      </div>
      <p className="text-[13px] text-muted">After saving, submit the listing for review from your dashboard. We review within 2 working days.</p>
    </form>
  );
}
