'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { useSession } from '@/components/Session';
import { CATEGORY_SINGULAR, type Category } from '@/lib/types';
import { shortDate } from '@/lib/format';

type QueueRow = { id: string; title: string; category: Category; subtype: string; status: string; vendor: string; vendorLevel: number; city: string; minLevel: number; since: string | null; docsPending: number };
type Detail = {
  listing: Record<string, any>;
  documents: { id: string; docType: string; fileName: string; result: string; uploadedAt: string }[];
  history: { from: string | null; to: string; reason: string | null; at: string; actor: string | null }[];
  photos: { url: string; alt: string }[];
};

const LEVELS = [
  { n: 1, t: 'Level 1: WhatsApp or company email verified, identity checked' },
  { n: 2, t: 'Level 2: business documents and licence checked' },
  { n: 3, t: 'Level 3: in-person visit done' },
];

export default function Admin() {
  const { me } = useSession();
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [level, setLevel] = useState<number>(1);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => call<{ queue: QueueRow[] }>('/admin/queue').then((r) => setQueue(r.queue)).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!sel) return;
    setD(null); setNote(''); setMsg(null);
    call<Detail>(`/admin/listings/${sel}`).then((r) => { setD(r); setLevel(Math.max(r.listing.verification_level || 1, queue?.find((x) => x.id === sel)?.minLevel ?? 1)); });
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me.user || !['reviewer', 'admin'].includes(me.user.role)) {
    return <div className="container-k py-12"><h1 className="font-display text-3xl font-extrabold">Reviewers only</h1><p className="mt-2 text-muted">Sign in with a reviewer account to see the queue.</p><Link className="btn-primary mt-4" href="/signin">Sign in</Link></div>;
  }

  async function doc(id: string, result: 'accepted' | 'rejected') {
    await call(`/admin/documents/${id}`, { body: { result } });
    setD((x) => x && { ...x, documents: x.documents.map((dd) => (dd.id === id ? { ...dd, result } : dd)) });
  }
  async function decide(decision: 'approve' | 'changes' | 'reject') {
    setMsg(null);
    try {
      const r = await call<{ status: string }>(`/admin/listings/${sel}/decision`, { body: { decision, level: decision === 'approve' ? level : undefined, note: note || undefined } });
      setMsg(`Listing is now ${r.status.replace('_', ' ')}.`);
      setSel(null);
      load();
    } catch (x) {
      setMsg((x as Error).message);
    }
  }

  const l = d?.listing;
  return (
    <div className="container-k py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Trust and safety</p><h1 className="font-display text-3xl font-extrabold">Review queue</h1></div>
        <span className="flex flex-wrap gap-2"><Link href="/admin/experiences" className="btn-outline">Experiences</Link><Link href="/admin/prices" className="btn-outline">Price reports</Link><Link href="/admin/reports" className="btn-outline">Reports</Link></span>
      </div>
      {msg ? <p role="status" className="mt-4 rounded-xl bg-soft p-3 font-semibold">{msg}</p> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="card divide-y divide-line">
          {queue === null ? <p className="p-4 text-muted">Loading…</p> : queue.length === 0 ? <p className="p-4 text-muted">Nothing waiting. Nice.</p> : queue.map((q) => (
            <button key={q.id} onClick={() => setSel(q.id)} className={`block w-full p-4 text-left hover:bg-soft ${sel === q.id ? 'bg-brand-soft' : ''}`}>
              <div className="font-bold">{q.title}</div>
              <div className="text-[13px] text-muted">{CATEGORY_SINGULAR[q.category]} · {q.city} · {q.vendor}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[12px]">
                <span className="chip">{q.status.replace('_', ' ')}</span>
                <span className="chip">needs L{q.minLevel}, vendor L{q.vendorLevel}</span>
                {Number(q.docsPending) ? <span className="chip bg-amber-100 text-amber-900">{q.docsPending} docs to check</span> : null}
                {q.since ? <span className="chip">since {shortDate(q.since)}</span> : null}
              </div>
            </button>
          ))}
        </section>

        <section>
          {!sel ? <div className="card p-8 text-muted">Pick a listing to review.</div> : !d || !l ? <div className="card p-8 text-muted">Loading…</div> : (
            <div className="flex flex-col gap-4">
              <div className="card p-5">
                <h2 className="font-display text-2xl font-extrabold">{l.title}</h2>
                <p className="text-muted">{CATEGORY_SINGULAR[l.category as Category]} · {l.subtype} · {l.city} · {l.vendor_name}</p>
                <p className="mt-3">{l.summary}</p>
                {l.description ? <p className="mt-2 whitespace-pre-line text-[15px] text-muted">{l.description}</p> : null}
                <dl className="mt-4 grid gap-2 text-[14px] sm:grid-cols-2">
                  <div><dt className="font-bold">WhatsApp</dt><dd className="font-mono">{l.whatsapp_e164} {l.whatsapp_verified ? <span className="chip bg-teal-soft text-teal">verified</span> : <span className="chip bg-amber-soft text-amber">unverified</span>}</dd></div>
                  <div><dt className="font-bold">Business email</dt><dd>{l.vendor_email ? <><span className="font-mono">{l.vendor_email}</span> {l.vendor_email_verified ? <span className="chip bg-teal-soft text-teal">verified</span> : <span className="chip bg-amber-soft text-amber">unverified</span>} {l.vendor_email_is_company ? <span className="chip">company domain</span> : <span className="chip">free webmail</span>}</> : 'None given'}</dd></div>
                  <div><dt className="font-bold">Licence</dt><dd>{l.licence_number ?? 'None given'}</dd></div>
                  <div><dt className="font-bold">Location</dt><dd className="font-mono">{Number(l.lat).toFixed(5)}, {Number(l.lon).toFixed(5)} {l.location_is_private ? '(private home)' : ''}</dd></div>
                  <div><dt className="font-bold">Price</dt><dd>{l.price_from ?? '?'} to {l.price_to ?? '?'} {l.currency} {l.price_unit}</dd></div>
                  <div className="sm:col-span-2"><dt className="font-bold">Attributes</dt><dd className="font-mono text-[12px]">{JSON.stringify(l.attributes)}</dd></div>
                  <div className="sm:col-span-2"><dt className="font-bold">Amenities</dt><dd>{(l.amenities ?? []).join(', ') || 'None'}</dd></div>
                </dl>
                {d.photos.length ? <div className="mt-4 flex gap-2 overflow-x-auto">{d.photos.map((p) => <img key={p.url} src={p.url} alt={p.alt} className="h-24 rounded-lg object-cover" />)}</div> : null}
              </div>

              <div className="card p-5">
                <h3 className="text-lg font-extrabold">Vendor documents</h3>
                {d.documents.length === 0 ? <p className="text-muted">No documents uploaded.</p> : (
                  <ul className="mt-2 divide-y divide-line">
                    {d.documents.map((dc) => (
                      <li key={dc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span><b>{dc.docType.replace('_', ' ')}</b> · {dc.fileName} · <span className="text-muted">{dc.result}</span></span>
                        {dc.result === 'pending' ? <span className="flex gap-2"><button className="btn-outline h-9" onClick={() => doc(dc.id, 'accepted')}>Accept</button><button className="btn-ghost h-9" onClick={() => doc(dc.id, 'rejected')}>Reject</button></span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card flex flex-col gap-3 p-5">
                <h3 className="text-lg font-extrabold">Decision</h3>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="label">Verification level reached</legend>
                  {LEVELS.map((x) => (
                    <label key={x.n} className="flex items-center gap-2 text-[15px]"><input type="radio" name="lvl" checked={level === x.n} onChange={() => setLevel(x.n)} />{x.t}</label>
                  ))}
                </fieldset>
                <div><label className="label" htmlFor="note">Note to vendor (required to request changes or reject)</label><textarea id="note" className="input min-h-[80px] py-2" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => decide('approve')}>Approve and publish</button>
                  <button className="btn-outline" onClick={() => decide('changes')}>Request changes</button>
                  <button className="btn-ghost text-danger" onClick={() => decide('reject')}>Reject</button>
                </div>
              </div>

              <div className="card p-5">
                <h3 className="text-lg font-extrabold">History</h3>
                <ul className="mt-2 flex flex-col gap-1 text-[14px]">
                  {d.history.map((h, i) => <li key={i}><span className="font-mono text-muted">{shortDate(h.at)}</span> {h.from ?? 'new'} → <b>{h.to}</b>{h.actor ? ` by ${h.actor}` : ''}{h.reason ? `: ${h.reason}` : ''}</li>)}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
