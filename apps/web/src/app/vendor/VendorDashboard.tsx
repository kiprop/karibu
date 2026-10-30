'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';
import { CATEGORY_SINGULAR, LEVEL_LABEL, type Category } from '@/lib/types';
import { shortDate } from '@/lib/format';

type VMe = {
  vendor: { id: string; name: string; whatsapp: string; verificationLevel: number; verifiedAt: string | null; reverifyDue: string | null; suspended: boolean; plan: { code: string; name: string; maxListings: number } };
  listings: { id: string; slug: string; title: string; category: string; subtype: string; status: string; updatedAt: string; lastConfirmedAt: string | null; lastNote: string | null }[];
  documents: { id: string; docType: string; fileName: string; result: string; uploadedAt: string }[];
};
type Stats = { weekly: { week: string; enquiries: number; fromCreators: number }[]; totals: { enquiries30d: number; reviews: number; rating: number | null } };
type Enq = { refCode: string; requestedDate: string | null; createdAt: string; listing: string | null; sourceCode: string | null };

const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', 'bg-soft text-muted'],
  submitted: ['Waiting for review', 'bg-amber-soft text-amber'],
  in_review: ['In review', 'bg-amber-soft text-amber'],
  changes_requested: ['Changes requested', 'bg-danger-soft text-danger'],
  live: ['Live', 'bg-teal-soft text-teal'],
  rejected: ['Not approved', 'bg-danger-soft text-danger'],
  suspended: ['Suspended', 'bg-danger-soft text-danger'],
  expired: ['Expired', 'bg-soft text-muted'],
};

const DOC_TYPES = [
  ['national_id', 'National ID or passport'],
  ['business_registration', 'Business registration'],
  ['tourism_licence', 'Tourism licence'],
  ['driving_licence', 'Driving licence'],
  ['psv_badge', 'PSV badge'],
  ['insurance', 'Insurance'],
  ['event_permit', 'Event permit'],
  ['photo_permission', 'Photo permission'],
  ['other', 'Other'],
];

function CreateBusiness({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', whatsapp: '+254', email: '', licenceNumber: '' });
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await call('/vendor/businesses', { body: { name: f.name, countryCode: 'KE', whatsapp: f.whatsapp.replace(/\s/g, ''), email: f.email || undefined, licenceNumber: f.licenceNumber || undefined } });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="container-k flex max-w-xl flex-col gap-4 py-10">
      <h1 className="font-display text-3xl font-extrabold">Tell us about your business</h1>
      <p className="text-muted">This is what travellers see next to your listings. You can add listings next.</p>
      <div><label className="label" htmlFor="bn">Business name</label><input id="bn" required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><label className="label" htmlFor="bw">WhatsApp number travellers should message</label><input id="bw" required type="tel" className="input" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
      <div><label className="label" htmlFor="be">Email (optional, for receipts and notices)</label><input id="be" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><label className="label" htmlFor="bl">Tourism licence number (if you have one)</label><input id="bl" className="input" value={f.licenceNumber} onChange={(e) => setF({ ...f, licenceNumber: e.target.value })} /></div>
      <p className="text-[13px] text-muted">Karibu covers Kenya first. Tanzania, Uganda, Rwanda and Ethiopia are opening next.</p>
      <button className="btn-primary self-start">Continue</button>
      {err ? <p role="alert" className="text-danger">{err}</p> : null}
    </form>
  );
}

export function VendorDashboard() {
  const [data, setData] = useState<VMe | null | 'none'>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [enq, setEnq] = useState<Enq[]>([]);
  const [docType, setDocType] = useState('national_id');
  const [upMsg, setUpMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await call<VMe>('/vendor/me');
      setData(d);
      call<Stats>('/vendor/stats').then(setStats).catch(() => {});
      call<{ enquiries: Enq[] }>('/vendor/enquiries').then((r) => setEnq(r.enquiries)).catch(() => {});
    } catch (e) {
      setData('none');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (data === null) return <div className="container-k py-12 text-muted">Loading your business…</div>;
  if (data === 'none') return <CreateBusiness onDone={load} />;
  const v = data.vendor;
  const atLimit = data.listings.filter((l) => !['rejected', 'expired'].includes(l.status)).length >= v.plan.maxListings;

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fileInput = e.currentTarget.elements.namedItem('file') as HTMLInputElement;
    if (!fileInput.files?.[0]) return setUpMsg('Choose a file first');
    const form = new FormData();
    form.append('docType', docType);
    form.append('file', fileInput.files[0]);
    try {
      await call('/vendor/documents', { form });
      setUpMsg('Uploaded privately. Only Karibu reviewers can see it.');
      fileInput.value = '';
      load();
    } catch (x) {
      setUpMsg((x as Error).message);
    }
  }
  async function submit(id: string) {
    await call(`/vendor/listings/${id}/submit`, { body: {} }).catch((e) => alert(e.message));
    load();
  }
  async function confirmListing(id: string) {
    await call(`/vendor/listings/${id}/confirm`, { body: {} });
    load();
  }
  function exportCsv() {
    const rows = [['Reference', 'Listing', 'Requested date', 'Received', 'Source'], ...enq.map((e) => [e.refCode, e.listing ?? '', e.requestedDate ?? '', e.createdAt, e.sourceCode ?? ''])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'karibu-enquiries.csv';
    a.click();
  }
  const maxWeek = Math.max(1, ...(stats?.weekly.map((w) => w.enquiries) ?? [1]));

  return (
    <div className="container-k py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your business</p>
          <h1 className="font-display text-3xl font-extrabold">{v.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-[14px]">
            {v.verificationLevel ? <span className="chip bg-teal-soft text-teal"><Icon name="check" size={12} strokeWidth={3} />{LEVEL_LABEL[v.verificationLevel]}</span> : <span className="chip bg-amber-soft text-amber">Not verified yet</span>}
            {v.reverifyDue ? <span className="chip bg-soft text-muted">Re-verify by {shortDate(v.reverifyDue)}</span> : null}
            <span className="chip bg-soft text-muted">{v.plan.name} plan</span>
            {v.suspended ? <span className="chip bg-danger-soft text-danger">Suspended: contact Karibu</span> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/vendor/plan" className="btn-outline">Plan</Link>
          {atLimit ? <Link href="/vendor/plan" className="btn-primary">Upgrade to add more</Link> : <Link href="/vendor/listings/new" className="btn-primary"><Icon name="plus" size={18} />New listing</Link>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl p-5 text-white media-experience"><div className="font-display text-4xl font-extrabold tabular-nums">{stats?.totals.enquiries30d ?? '–'}</div><div className="text-[13px] font-bold">Enquiries, last 30 days</div></div>
        <div className="rounded-2xl p-5 text-[#0B2E17]" style={{ background: 'linear-gradient(135deg,#25D366,#9BE15D)' }}><div className="font-display text-4xl font-extrabold tabular-nums">{stats?.totals.reviews ?? '–'}</div><div className="text-[13px] font-bold">Reviews</div></div>
        <div className="rounded-2xl p-5 text-white media-stay"><div className="font-display text-4xl font-extrabold tabular-nums">{stats?.totals.rating ?? '–'}</div><div className="text-[13px] font-bold">Average rating</div></div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="font-display text-xl font-extrabold">Listings</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {data.listings.length === 0 ? <li className="card p-5 text-muted">No listings yet. Create your first one; it goes live once our team has verified it.</li> : null}
              {data.listings.map((l) => {
                const [label, cls] = STATUS[l.status] ?? [l.status, 'bg-soft'];
                return (
                  <li key={l.id} className="card flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><strong>{l.title}</strong><span className={`chip ${cls}`}>{label}</span></div>
                      <div className="text-[13px] text-muted">{CATEGORY_SINGULAR[l.category as Category] ?? l.category} · {l.subtype} · updated {shortDate(l.updatedAt)}</div>
                      {l.status === 'changes_requested' && l.lastNote ? <p className="mt-2 rounded-lg bg-amber-soft p-2 text-[14px] text-amber"><strong>Reviewer note:</strong> {l.lastNote}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {l.status === 'live' ? <Link href={`/listing/${l.slug}`} className="pill">View</Link> : null}
                      {l.status === 'live' ? <button className="pill" onClick={() => confirmListing(l.id)} title="Tell travellers your details are still accurate">Confirm details</button> : null}
                      {!['in_review', 'suspended'].includes(l.status) ? <Link href={`/vendor/listings/${l.id}`} className="pill">Edit</Link> : null}
                      {['draft', 'changes_requested', 'expired'].includes(l.status) ? <button className="btn-primary min-h-[38px]" onClick={() => submit(l.id)}>Submit for review</button> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-extrabold">Enquiries</h2>
              {enq.length ? <button className="pill" onClick={exportCsv}>Export CSV</button> : null}
            </div>
            <p className="mt-1 text-[14px] text-muted">Each WhatsApp message from Karibu includes a reference like K-8F3QW, so you can match chats to this list.</p>
            {stats?.weekly.length ? (
              <div className="mt-4 flex h-28 items-end gap-2 border-b border-line" role="img" aria-label="Enquiries per week">
                {stats.weekly.map((w) => (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-bold tabular-nums">{w.enquiries}</span>
                    <span className="w-full rounded-t-md bg-gradient-to-t from-brand to-star" style={{ height: `${(w.enquiries / maxWeek) * 80}px` }} />
                  </div>
                ))}
              </div>
            ) : null}
            <ul className="mt-3 divide-y divide-line">
              {enq.length === 0 ? <li className="py-3 text-muted">No enquiries yet.</li> : null}
              {enq.slice(0, 20).map((e) => (
                <li key={e.refCode} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[14px]">
                  <span><span className="rounded bg-soft px-2 py-0.5 font-mono font-semibold">{e.refCode}</span> {e.listing}{e.sourceCode ? <span className="chip ml-2 bg-amber-soft text-amber">via {e.sourceCode}</span> : null}</span>
                  <span className="text-muted">{e.requestedDate ? `for ${shortDate(e.requestedDate)} · ` : ''}{shortDate(e.createdAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card p-5">
            <h2 className="font-extrabold">Verification documents</h2>
            <p className="mt-1 text-[14px] text-muted">Private. Only Karibu reviewers see them. PDF, JPG, PNG or WEBP up to 10 MB.</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[14px]">
              {data.documents.map((d) => (
                <li key={d.id} className="flex justify-between gap-2"><span>{DOC_TYPES.find((t) => t[0] === d.docType)?.[1] ?? d.docType}</span><span className={`chip ${d.result === 'accepted' ? 'bg-teal-soft text-teal' : d.result === 'rejected' ? 'bg-danger-soft text-danger' : 'bg-amber-soft text-amber'}`}>{d.result}</span></li>
              ))}
            </ul>
            <form onSubmit={upload} className="mt-4 flex flex-col gap-2">
              <label className="label" htmlFor="dt">Document type</label>
              <select id="dt" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label className="label" htmlFor="df">File</label>
              <input id="df" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-[14px]" />
              <button className="btn-dark"><Icon name="upload" size={18} />Upload</button>
              {upMsg ? <p role="status" className="text-[14px]">{upMsg}</p> : null}
            </form>
          </section>
          <section className="card p-5 text-[14px]">
            <h2 className="font-extrabold">Travellers contact you at</h2>
            <p className="mt-1 font-mono">{v.whatsapp}</p>
            <p className="mt-2 text-muted">Karibu never takes payments or commission. Agree prices and payment directly with travellers.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
