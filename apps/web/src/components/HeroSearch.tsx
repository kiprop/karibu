'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { call } from '@/lib/client-api';
import { t as tr, type Lang } from '@/lib/i18n';
import { Icon } from './Icon';

const TABS = [
  { key: 'all', label: 'Search all', icon: 'search', placeholder: 'Places, businesses, parks or neighbourhoods', hidden: {} },
  { key: 'stay', label: 'Stays', icon: 'bed', placeholder: 'Naivasha camp, Diani beach hotel…', hidden: { category: 'stay' } },
  { key: 'safari', label: 'Game drives', icon: 'binoculars', placeholder: 'Mara full-day drive, Amboseli…', hidden: { category: 'safari' } },
  { key: 'transport', label: 'Transport', icon: 'car', placeholder: 'Airport transfer, driver for hire…', hidden: { category: 'transport' } },
  { key: 'settle', label: 'Settle in', icon: 'home', placeholder: 'Furnished apartment, sofa, movers, fibre, barber…', hidden: { mode: 'settle' } },
] as const;
const EXAMPLES = ['tented camp in the Mara under 30k with hot water', 'furnished 2 bedroom Kilimani pets allowed', 'kinyozi near me', 'airport transfer Nairobi'];
const QUESTION = /^(is|are|do|does|can|how|what|where|when|which|should|why)\b|\?$/i;

type Preview = { total: number; understood: { chips: { key: string; label: string }[]; corrections: { from: string; to: string }[] } | null; results: { slug: string; title: string; city: string; subtype: string; verificationLevel: number }[] };

/** Search that understands plain language and shows what it understood while you type. */
export function HeroSearch({ lang = 'en' }: { lang?: Lang }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const t = TABS.find((x) => x.key === tab)!;
  const isQuestion = QUESTION.test(q.trim());

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) return setPreview(null);
    const id = setTimeout(() => {
      const u = new URLSearchParams({ q: text, nl: '1', pageSize: '4', ...t.hidden });
      call<Preview>(`/listings?${u}`).then(setPreview).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(id);
  }, [q, t.hidden]);

  return (
    <div className="mt-6 max-w-3xl">
      <div role="tablist" aria-label="What are you looking for?" className="flex gap-1 overflow-x-auto pb-2">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] font-semibold ${tab === x.key ? 'bg-ink text-ground' : 'text-muted hover:bg-soft hover:text-ink'}`}>
            <Icon name={x.icon} size={17} />{tr(lang, x.label)}
          </button>
        ))}
      </div>
      <div className="relative">
        <form ref={form} action={isQuestion ? '/ask' : '/explore'} role="search" onSubmit={(e) => {
          if (isQuestion) { e.preventDefault(); location.href = `/ask?q=${encodeURIComponent(q)}`; }
        }}
          className="flex items-center gap-2 rounded-xl border border-line bg-panel p-1.5 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/15">
          <Icon name="search" className="text-muted" />
          <label htmlFor="hero-q" className="sr-only">{tr(lang, t.label)}</label>
          <input id="hero-q" name="q" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoComplete="off" placeholder={tr(lang, t.placeholder)} className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-muted focus-visible:outline-none" />
          <input type="hidden" name="nl" value="1" />
          {Object.entries(t.hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button className="btn-primary" type="submit">{isQuestion ? tr(lang, 'Ask Karibu') : tr(lang, 'Search')}</button>
        </form>

        {open && q.trim().length >= 3 && (preview || isQuestion) ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-panel text-[14px] shadow-lg" role="listbox">
            {isQuestion ? (
              <Link href={`/ask?q=${encodeURIComponent(q)}`} className="flex items-center gap-2.5 border-b border-line/70 px-3.5 py-2.5 hover:bg-soft">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white"><Icon name="chat" size={15} /></span>
                <span><b>Ask Karibu:</b> “{q.trim()}”<span className="block text-[12px] text-muted">Answers from checked prices, verified businesses and official sources</span></span>
              </Link>
            ) : null}
            {preview?.understood?.chips.length ? (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line/70 px-3.5 py-2">
                <span className="text-[12px] font-semibold text-muted">{tr(lang, 'We understood')}</span>
                {preview.understood.chips.map((c) => <span key={c.key} className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[12.5px] font-medium text-brand">{c.label}</span>)}
              </div>
            ) : null}
            {preview?.results.map((r) => (
              <Link key={r.slug} href={`/listing/${r.slug}`} className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-soft">
                <span className="min-w-0"><span className="block truncate font-medium">{r.title}</span><span className="text-[12.5px] text-muted">{r.subtype} · {r.city}</span></span>
                <span className="chip shrink-0 bg-teal-soft text-teal">L{r.verificationLevel}</span>
              </Link>
            ))}
            {preview && !isQuestion ? (
              <button type="button" onMouseDown={() => form.current?.requestSubmit()} className="w-full bg-soft/60 px-3.5 py-2 text-left text-[13px] font-semibold text-brand hover:bg-soft">
                {preview.total ? `See all ${preview.total} verified results →` : 'No exact matches. See close matches →'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
        <span>Try:</span>
        {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => { setQ(e); setOpen(true); document.getElementById('hero-q')?.focus(); }} className="rounded-md border border-line bg-panel px-2 py-0.5 hover:text-ink">{e}</button>)}
      </p>
    </div>
  );
}
