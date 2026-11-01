'use client';

import { useState } from 'react';
import { Icon } from './Icon';

const TABS = [
  { key: 'all', label: 'Search all', icon: 'search', placeholder: 'Places, businesses, parks or neighbourhoods', hidden: {} },
  { key: 'stay', label: 'Stays', icon: 'bed', placeholder: 'Naivasha camp, Diani beach hotel…', hidden: { category: 'stay' } },
  { key: 'safari', label: 'Game drives', icon: 'binoculars', placeholder: 'Mara full-day drive, Amboseli…', hidden: { category: 'safari' } },
  { key: 'transport', label: 'Transport', icon: 'car', placeholder: 'Airport transfer, driver for hire…', hidden: { category: 'transport' } },
  { key: 'settle', label: 'Settle in', icon: 'home', placeholder: 'Furnished apartment, sofa, movers, fibre, barber…', hidden: { mode: 'settle' } },
] as const;

/** TripAdvisor-style search: pick what you're looking for, then type. */
export function HeroSearch() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const t = TABS.find((x) => x.key === tab)!;
  return (
    <div className="mt-6 max-w-3xl">
      <div role="tablist" aria-label="What are you looking for?" className="flex gap-1 overflow-x-auto pb-2">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-bold ${tab === x.key ? 'bg-ink text-ground' : 'text-muted hover:bg-soft'}`}>
            <Icon name={x.icon} size={17} />{x.label}
          </button>
        ))}
      </div>
      <form action="/explore" role="search" className="flex items-center gap-2 rounded-full border-2 border-ink bg-panel p-1.5 pl-5 shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
        <Icon name="search" className="text-muted" />
        <label htmlFor="hero-q" className="sr-only">{t.label}</label>
        <input id="hero-q" name="q" placeholder={t.placeholder} className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-muted" />
        {Object.entries(t.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button className="btn-primary" type="submit">Search</button>
      </form>
    </div>
  );
}
