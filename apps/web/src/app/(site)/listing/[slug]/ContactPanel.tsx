'use client';

import { useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { Icon } from '@/components/Icon';

type Props = { listing: { id: string; title: string; phone: string | null; email: string | null; dates: string[] } };

export function ContactPanel({ listing }: Props) {
  const { me } = useSession();
  const [date, setDate] = useState('');
  const [remind, setRemind] = useState(true);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ refCode: string; url: string } | null>(null);
  const uniqueDates = [...new Set(listing.dates)];

  async function contactVendor(channel: 'whatsapp' | 'phone' | 'email') {
    setBusy(true);
    setError(null);
    // Open the tab during the click so pop-up blockers allow it, then point it at WhatsApp.
    const tab = channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    try {
      const sourceCode = new URLSearchParams(window.location.search).get('via') ?? undefined;
      const r = await call<{ enquiry: { refCode: string }; whatsappUrl: string }>('/enquiries', {
        body: {
          listingId: listing.id,
          channel,
          requestedDate: date || undefined,
          reminderContact: !me.user && remind && contact ? contact : undefined,
          sourceCode: sourceCode && /^[A-Za-z0-9_-]{2,32}$/.test(sourceCode) ? sourceCode : undefined,
        },
      });
      setDone({ refCode: r.enquiry.refCode, url: r.whatsappUrl });
      if (tab) {
        tab.opener = null;
        tab.location.href = r.whatsappUrl;
      }
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {uniqueDates.length ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-date" className="label">Which date?</label>
          <select id="c-date" value={date} onChange={(e) => setDate(e.target.value)} className="input">
            <option value="">Not sure yet</option>
            {uniqueDates.map((d) => <option key={d} value={d}>{new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-date" className="label">When? (optional)</label>
          <input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
      )}
      {!me.user ? (
        <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
          <label className="flex items-center justify-between gap-3 text-[14px] font-semibold" htmlFor="c-remind">
            Remind me and ask how it went
            <input id="c-remind" type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--brand))]" />
          </label>
          {remind ? (
            <>
              <label htmlFor="c-contact" className="sr-only">Email or WhatsApp number</label>
              <input id="c-contact" value={contact} onChange={(e) => setContact(e.target.value)} className="input" placeholder="Email or WhatsApp number (optional)" />
            </>
          ) : null}
        </div>
      ) : null}
      <button className="btn-whatsapp w-full" onClick={() => contactVendor('whatsapp')} disabled={busy}>
        <Icon name="chat" size={18} />
        {busy ? 'Opening…' : 'Message on WhatsApp'}
      </button>
      {error ? <p role="alert" className="text-[14px] font-semibold text-danger">{error}</p> : null}
      {done ? (
        <div className="rounded-xl bg-teal-soft p-3 text-[14px]" role="status">
          Your reference is <strong className="font-mono">{done.refCode}</strong>. It’s in the message so the business knows you came from Karibu.{' '}
          <a href={done.url} target="_blank" rel="noopener" className="font-bold underline">Open WhatsApp again</a>
          {me.user ? <span className="block text-muted">Saved to your account so you can review them later.</span> : null}
        </div>
      ) : null}
      {listing.phone || listing.email ? (
        <div className="text-[14px] text-muted">
          No WhatsApp?{' '}
          {listing.phone ? <span>Call <span className="select-all font-mono text-ink">{listing.phone}</span></span> : null}
          {listing.phone && listing.email ? ' or email ' : null}
          {listing.email ? <span className="select-all text-ink">{listing.email}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
