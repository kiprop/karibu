'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { Verdict, type FairResult } from './Verdict';

/** "Is this price fair?" Type what you were quoted and get an instant comparison. */
export function FairCheck({ city, currency, items, initialItem = '', initialAmount = '' }: { city: string; currency: string; items: string[]; initialItem?: string; initialAmount?: string }) {
  const [item, setItem] = useState(initialItem);
  const [amount, setAmount] = useState(initialAmount);
  const [r, setR] = useState<FairResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving from the Today screen or Ask Karibu with a quote: check it straight away.
  useEffect(() => {
    if (initialItem && initialAmount) check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      setR(await call<FairResult>(`/prices/fair?city=${encodeURIComponent(city)}&item=${encodeURIComponent(item)}&amount=${Number(amount)}`));
    } catch (x) {
      setErr((x as Error).message);
      setR(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-[22px] font-semibold tracking-tight">Is this price fair?</h2>
      <p className="mt-1 text-[14px] text-muted">Type what you’re being charged. We compare it with our checked prices and what other travellers paid.</p>
      <form onSubmit={check} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <div>
          <label className="label" htmlFor="fc-item">What is it?</label>
          <input id="fc-item" required minLength={2} maxLength={80} list="fc-items" className="input" value={item} onChange={(e) => { setItem(e.target.value); setR(null); }} placeholder="Boda ride, about 2 km" />
          <datalist id="fc-items">{items.map((i) => <option key={i} value={i} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="fc-amt">Price ({currency})</label>
          <input id="fc-amt" required type="number" min={1} inputMode="numeric" className="input" value={amount} onChange={(e) => { setAmount(e.target.value); setR(null); }} />
        </div>
        <button className="btn-primary self-end" disabled={busy}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      {err ? <p role="alert" className="mt-3 text-danger">{err}</p> : null}
      {r ? (
        <div className="mt-4 flex flex-col gap-3">
          <Verdict r={r} amount={Number(amount)} reportHref={`/report?category=overcharged&subject=${encodeURIComponent(`Overcharged for ${item}`)}`} />
          <Link href={`/safety/prices/add?city=${city}&item=${encodeURIComponent(item)}&amount=${amount}`} className="self-start text-[14px] font-bold text-brand underline">
            Paid it? Add it so the next traveller knows
          </Link>
        </div>
      ) : null}
    </section>
  );
}
