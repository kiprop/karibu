'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';

/** Sorts results by distance from where you are. Your location stays in the address bar, nowhere else. */
export function NearMe({ base, label = 'Near me' }: { base: Record<string, string>; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'denied'>('idle');
  return (
    <button
      type="button"
      className="pill"
      disabled={state === 'busy'}
      onClick={() => {
        if (!navigator.geolocation) return setState('denied');
        setState('busy');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const u = new URLSearchParams(base);
            u.set('lat', pos.coords.latitude.toFixed(3));
            u.set('lon', pos.coords.longitude.toFixed(3));
            u.set('sort', 'distance');
            u.delete('city');
            router.push(`/explore?${u}`);
          },
          () => setState('denied'),
          { maximumAge: 300000, timeout: 10000 },
        );
      }}
    >
      <Icon name="pin" size={15} />
      {state === 'busy' ? 'Finding you…' : state === 'denied' ? 'Location is off' : label}
    </button>
  );
}

/** "Tell us you need this": turns a search with no results into a request our team works on. */
export function TellUs({ query, city, category }: { query: string; city?: string; category?: string }) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (sent) return <p className="rounded-xl bg-teal-soft p-3 text-[14px] font-medium text-teal">Thanks. Our team will look for verified businesses for “{query}”.{contact ? ' We’ll let you know when we find one.' : ''}</p>;
  if (!open) return <button type="button" className="btn-outline" onClick={() => setOpen(true)}><Icon name="flag" size={16} />Tell us you need this</button>;
  return (
    <form className="flex max-w-xl flex-col gap-2 rounded-xl border border-line bg-panel p-4" onSubmit={async (e) => {
      e.preventDefault();
      try {
        await call('/demand', { body: { query, city, category, contact: contact || undefined } });
        setSent(true);
      } catch (x) { setErr((x as Error).message); }
    }}>
      <p className="text-[14px]">We’ll ask our team to find and verify businesses for <b>“{query}”</b>.</p>
      <label className="label" htmlFor="tu-c">Email or WhatsApp, if you’d like us to tell you (optional)</label>
      <input id="tu-c" className="input" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} />
      <div className="flex gap-2"><button className="btn-primary">Send</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      {err ? <p className="text-[14px] text-danger">{err}</p> : null}
    </form>
  );
}
