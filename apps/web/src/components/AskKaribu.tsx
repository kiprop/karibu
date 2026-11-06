'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from './Icon';

type Source = { title: string; url: string; kind: 'official' | 'karibu' | 'listing' | 'price' };
type Answer = {
  intent: string; answered: boolean; text: string; sources: Source[]; chips?: string[];
  listings?: { slug: string; title: string; city: string; category: string; priceFrom: number | null; currency: string; verificationLevel: number }[];
  followUps: string[]; action?: { label: string; href: string };
};
type Msg = { role: 'you'; text: string } | { role: 'karibu'; a: Answer; q: string; rated?: boolean };

const STARTERS = [
  'Is KES 6,500 fair for an airport taxi to Westlands?',
  'Do I need an eTA for Kenya?',
  'Tented camp in the Mara under 30k with hot water',
  'Is Mara Sunset Tours legit?',
  'Furnished 2 bedroom in Nairobi, pets allowed',
  'Emergency numbers',
];
const KIND: Record<Source['kind'], string> = { official: 'Official', karibu: 'Karibu', listing: 'Verified listing', price: 'Fair prices' };
const local = (u: string) => u.replace(/^https?:\/\/[^/]+(?=\/)/, (h) => (typeof window !== 'undefined' && (h.includes('karibu.enkopintelligence.com') || h.includes(location.host)) ? '' : h));

/** A chat that only answers from what Karibu has checked, and always shows where the answer came from. */
export function AskKaribu({ compact = false, autoFocus = false, initial }: { compact?: boolean; autoFocus?: boolean; initial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (msgs.length || busy) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);
  const asked = useRef(false);
  useEffect(() => {
    if (initial && !asked.current) {
      asked.current = true;
      ask(initial);
    }
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask(qText: string) {
    const q = qText.trim();
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { role: 'you', text: q }]);
    setBusy(true);
    try {
      const a = await call<Answer>('/ask', { body: { question: q } });
      setMsgs((m) => [...m, { role: 'karibu', a, q }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'karibu', q, a: { intent: 'error', answered: false, text: (e as Error).message, sources: [], followUps: [] } }]);
    }
    setBusy(false);
  }
  async function rate(i: number, helpful: boolean) {
    const m = msgs[i];
    if (m.role !== 'karibu') return;
    setMsgs((x) => x.map((y, n) => (n === i ? { ...(y as Extract<Msg, { role: 'karibu' }>), rated: true } : y)));
    call('/ask/feedback', { body: { question: m.q, helpful } }).catch(() => {});
  }

  return (
    <div className={`flex min-h-0 flex-col ${compact ? 'h-full' : 'min-h-[60vh]'}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {msgs.length === 0 ? (
          <div className="flex flex-col gap-3 p-1">
            <p className="text-[14px] text-muted">Ask about prices, scams, entry rules, getting around, or describe what you’re looking for. Answers come only from what Karibu has checked, with sources.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-left text-[13px] hover:border-muted/50">{s}</button>)}
            </div>
          </div>
        ) : null}
        <ol className="flex flex-col gap-4 p-1">
          {msgs.map((m, i) =>
            m.role === 'you' ? (
              <li key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[14.5px] text-ground">{m.text}</li>
            ) : (
              <li key={i} className="max-w-[95%]">
                <div className={`rounded-2xl rounded-bl-md border px-3.5 py-3 text-[14.5px] ${m.a.intent === 'emergency' ? 'border-danger bg-danger-soft' : 'border-line bg-panel'}`}>
                  {m.a.chips?.length ? (
                    <div className="mb-2 flex flex-wrap gap-1">{m.a.chips.map((c) => <span key={c} className="chip bg-soft text-muted">{c}</span>)}</div>
                  ) : null}
                  <p className="whitespace-pre-line leading-relaxed">{m.a.text}</p>
                  {m.a.listings?.length ? (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {m.a.listings.map((l) => (
                        <li key={l.slug}>
                          <Link href={`/listing/${l.slug}`} className="flex items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2 hover:bg-line/50">
                            <span className="min-w-0"><span className="block truncate font-semibold">{l.title}</span><span className="text-[12.5px] text-muted">{l.city}{l.priceFrom ? ` · from ${l.currency} ${l.priceFrom.toLocaleString()}` : ''}</span></span>
                            <span className="chip shrink-0 bg-teal-soft text-teal"><Icon name="check" size={11} strokeWidth={3} />L{l.verificationLevel}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {m.a.action ? <a href={local(m.a.action.href)} className="btn-primary mt-3 h-9 min-h-0 text-[13px]">{m.a.action.label}</a> : null}
                  {m.a.sources.filter((s) => s.kind !== 'listing').length ? (
                    <div className="mt-3 border-t border-line/70 pt-2">
                      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Sources</div>
                      <ul className="mt-1 flex flex-col gap-0.5 text-[13px]">
                        {m.a.sources.filter((s) => s.kind !== 'listing').map((s) => (
                          <li key={s.url}><a href={local(s.url)} target={s.kind === 'official' ? '_blank' : undefined} rel="noopener" className="text-brand hover:underline">{s.title}</a> <span className="text-muted">· {KIND[s.kind]}</span></li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 pl-1 text-[12px] text-muted">
                  {m.rated ? <span>Thanks for the feedback</span> : (
                    <>Helpful? <button className="hover:text-ink" onClick={() => rate(i, true)} aria-label="Helpful"><Icon name="thumb" size={14} /></button>
                      <button className="rotate-180 hover:text-ink" onClick={() => rate(i, false)} aria-label="Not helpful"><Icon name="thumb" size={14} /></button></>
                  )}
                  {m.a.followUps.map((f) => <button key={f} onClick={() => ask(f)} className="rounded-md border border-line px-2 py-0.5 hover:text-ink">{f}</button>)}
                </div>
              </li>
            ),
          )}
          {busy ? <li className="flex gap-1 p-2" aria-label="Karibu is thinking">{[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${d * 120}ms` }} />)}</li> : null}
        </ol>
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-panel p-1.5 pl-3 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/15">
        <label htmlFor={compact ? 'ask-c' : 'ask-p'} className="sr-only">Ask Karibu</label>
        <input id={compact ? 'ask-c' : 'ask-p'} autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Ask anything about your trip…" className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-muted focus-visible:outline-none" />
        <button className="btn-primary h-9 min-h-0 px-3" disabled={!text.trim() || busy} aria-label="Ask"><Icon name="back" size={16} className="rotate-180" /></button>
      </form>
      <p className="mt-1.5 text-center text-[11.5px] text-muted">Karibu only answers from checked information and official sources. In an emergency call 999 or 112.</p>
    </div>
  );
}

/** A floating button that opens Ask Karibu anywhere on the site. */
export function AskLauncher() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  if (path.startsWith('/ask') || path.startsWith('/vendor')) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Ask Karibu"
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-[14px] font-semibold text-ground shadow-lg hover:opacity-90 lg:bottom-6">
        <Icon name="chat" size={18} /> Ask Karibu
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Ask Karibu" className="flex h-[85vh] w-full flex-col rounded-t-2xl border border-line bg-ground p-3 shadow-xl sm:h-[640px] sm:max-h-[calc(100vh-32px)] sm:w-[420px] sm:rounded-2xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white"><Icon name="chat" size={15} /></span>Ask Karibu</span>
              <span className="flex items-center gap-1">
                <Link href="/ask" className="btn-ghost h-8 min-h-0 px-2 text-[12.5px]">Full screen</Link>
                <button onClick={() => setOpen(false)} className="btn-ghost h-8 min-h-0 px-2" aria-label="Close"><Icon name="x" size={16} /></button>
              </span>
            </div>
            <AskKaribu compact autoFocus />
          </div>
        </div>
      ) : null}
    </>
  );
}
