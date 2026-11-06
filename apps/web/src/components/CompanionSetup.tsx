'use client';

import { useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { TRAVELLER_TYPES, type Profile } from '@/lib/companion';

/** A short form that tells the companion what kind of trip this is. Everything is optional. */
export function CompanionSetup({ initial, onSave, onCancel }: { initial: Profile; onSave: (p: Profile) => Promise<void> | void; onCancel?: () => void }) {
  const [p, setP] = useState<Profile>({ mode: 'visit', ...initial });
  const [cities, setCities] = useState<{ slug: string; name: string; isLive: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Profile, v: unknown) => setP((x) => ({ ...x, [k]: v === '' ? null : v }));
  useEffect(() => {
    call<{ cities: { slug: string; name: string; isLive: boolean }[] }>('/cities?country=KE').then((r) => setCities(r.cities.filter((c) => c.isLive))).catch(() => {});
  }, []);
  const settle = p.mode === 'settle';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (p.arrivingOn && p.leavingOn && p.leavingOn < p.arrivingOn) return setErr('Leaving must be on or after arriving');
        setBusy(true);
        try {
          await onSave(p);
        } catch (x) {
          setErr((x as Error).message);
        }
        setBusy(false);
      }}
    >
      <div role="radiogroup" aria-label="What are you planning?" className="grid grid-cols-2 gap-1 rounded-lg bg-soft p-1">
        {([['visit', 'Visiting'], ['settle', 'Staying long or moving home']] as const).map(([m, t]) => (
          <button key={m} type="button" role="radio" aria-checked={p.mode === m} onClick={() => set('mode', m)}
            className={`min-h-[38px] rounded-md text-[14px] font-semibold ${p.mode === m ? 'bg-panel shadow-sm' : 'text-muted'}`}>{t}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cs-a">{settle ? 'Moving on (optional)' : 'Arriving'}</label>
          <input id="cs-a" type="date" className="input mt-1" value={p.arrivingOn ?? ''} onChange={(e) => set('arrivingOn', e.target.value)} />
        </div>
        {!settle ? (
          <div>
            <label className="label" htmlFor="cs-l">Leaving</label>
            <input id="cs-l" type="date" className="input mt-1" value={p.leavingOn ?? ''} min={p.arrivingOn ?? undefined} onChange={(e) => set('leavingOn', e.target.value)} />
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="cs-c">{settle ? 'Where you’ll live' : 'Where you’ll be based'}</label>
          <select id="cs-c" className="input mt-1" value={p.baseCity ?? ''} onChange={(e) => set('baseCity', e.target.value)}>
            <option value="">Not sure yet</option>
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cs-t">Who’s going</label>
          <select id="cs-t" className="input mt-1" value={p.travellerType ?? ''} onChange={(e) => set('travellerType', e.target.value)}>
            <option value="">Prefer not to say</option>
            {TRAVELLER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cs-b">Budget</label>
          <select id="cs-b" className="input mt-1" value={p.budget ?? ''} onChange={(e) => set('budget', e.target.value)}>
            <option value="">Any</option><option value="budget">Budget</option><option value="mid">Mid-range</option><option value="premium">Premium</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cs-p">Passport (for entry links)</label>
          <select id="cs-p" className="input mt-1" value={p.passportCountry ?? ''} onChange={(e) => set('passportCountry', e.target.value)}>
            <option value="">Prefer not to say</option>
            {[['KE', 'Kenya'], ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['IN', 'India'], ['CN', 'China'], ['ZA', 'South Africa'], ['NG', 'Nigeria'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['RW', 'Rwanda'], ['AU', 'Australia'], ['XX', 'Another country']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {err ? <p role="alert" className="text-[14px] font-semibold text-danger">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {onCancel ? <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button> : null}
      </div>
      <p className="text-[12.5px] text-muted">Used only to tailor what Karibu shows you. Never shared with businesses.</p>
    </form>
  );
}
