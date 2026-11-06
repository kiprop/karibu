'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AreaHead, Panel, Stat } from '@/components/RailShell';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';
import { CATEGORY_SINGULAR, LEVEL_LABEL, type Category } from '@/lib/types';
import { shortDate } from '@/lib/format';
import { useSession } from '@/components/Session';

type VMe = {
  vendor: { id: string; name: string; slug: string; about: string | null; website: string | null; whatsapp: string; whatsappVerified: boolean; email: string | null; emailVerified: boolean; emailIsCompany: boolean; verificationLevel: number; verifiedAt: string | null; reverifyDue: string | null; suspended: boolean; plan: { code: string; name: string; maxListings: number } };
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
  const { me } = useSession();
  // Start from the details this person signed in with, which are already verified.
  const [f, setF] = useState({ name: '', whatsapp: me.signIn?.phone ?? '+254', email: me.signIn?.email ?? '', licenceNumber: '' });
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
      <p className="text-muted">This is what travellers see next to your listings. You can add listings next. Contact details that match how you signed in are verified straight away.</p>
      <div><label className="label" htmlFor="bn">Business name</label><input id="bn" required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div><label className="label" htmlFor="bw">WhatsApp number travellers should message</label><input id="bw" required type="tel" className="input" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
      <div><label className="label" htmlFor="be">Business email (optional; a company address like bookings@yourcamp.co.ke helps verification)</label><input id="be" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><label className="label" htmlFor="bl">Tourism licence number (if you have one)</label><input id="bl" className="input" value={f.licenceNumber} onChange={(e) => setF({ ...f, licenceNumber: e.target.value })} /></div>
      <p className="text-[13px] text-muted">Karibu covers Kenya first. Tanzania, Uganda, Rwanda and Ethiopia are opening next.</p>
      <button className="btn-primary self-start">Continue</button>
      {err ? <p role="alert" className="text-danger">{err}</p> : null}
    </form>
  );
}

type Review = { id: string; rating: number; body: string | null; vendorReply: string | null; createdAt: string; listing: string; slug: string; recommend: boolean | null; travellerType: string | null; contacted: boolean; status: string; author: string };
type Stats2 = Stats & {
  totals: Stats['totals'] & { views30d: number; viewsPrev30d: number; enquiriesPrev30d: number; unanswered: number; recommendPct: number | null; priceReports: number };
  perListing: { id: string; title: string; slug: string; status: string; views: number; enquiries: number; saves: number }[];
  heat: { dow: number; slot: number; n: number }[];
  opportunities: { query: string; city: string; searches: number }[];
};
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT = ['00–03', '03–06', '06–09', '09–12', '12–15', '15–18', '18–21', '21–24'];
const n = (x: unknown) => Number(x ?? 0);
const delta = (now: number, prev: number) => (!prev ? (now ? 'new' : '—') : `${now >= prev ? '↑' : '↓'} ${Math.abs(Math.round(((now - prev) / prev) * 100))}%`);

/** The business console. Views are chosen from the side menu (?view=…). */
export function VendorDashboard() {
  const view = useSearchParams().get('view') ?? 'overview';
  const [data, setData] = useState<VMe | null | 'none'>(null);
  const [stats, setStats] = useState<Stats2 | null>(null);
  const [enq, setEnq] = useState<Enq[]>([]);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [docType, setDocType] = useState('national_id');
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await call<VMe>('/vendor/me');
      setData(d);
      call<Stats2>('/vendor/stats?weeks=12').then(setStats).catch(() => {});
      call<{ enquiries: Enq[] }>('/vendor/enquiries').then((r) => setEnq(r.enquiries)).catch(() => {});
      call<{ reviews: Review[] }>('/vendor/reviews').then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
    } catch (e) {
      setData('none');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (data === null) return <div className="p-6"><div className="h-8 w-64 animate-pulse rounded bg-soft" /><div className="mt-6 grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-soft" />)}</div></div>;
  // Full reload after creating, so the header and side menu show the business.
  if (data === 'none') return <CreateBusiness onDone={() => window.location.reload()} />;
  const v = data.vendor;
  const atLimit = data.listings.filter((l) => !['rejected', 'expired'].includes(l.status)).length >= v.plan.maxListings;
  const t = stats?.totals;

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fileInput = e.currentTarget.elements.namedItem('file') as HTMLInputElement;
    if (!fileInput.files?.[0]) return setUpMsg('Choose a file first');
    const form = new FormData();
    form.append('docType', docType);
    form.append('file', fileInput.files[0]);
    try {
      await call('/vendor/documents', { form });
      setUpMsg('Uploaded privately. Only Karibu’s verification team can see it.');
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
  async function sendReply(id: string) {
    await call(`/vendor/reviews/${id}/reply`, { body: { reply: reply[id] } }).catch((e) => alert(e.message));
    setReply((r) => ({ ...r, [id]: '' }));
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
  const maxWeek = Math.max(1, ...(stats?.weekly.map((w) => n(w.enquiries)) ?? [1]));
  const stale = data.listings.filter((l) => l.status === 'live' && (!l.lastConfirmedAt || Date.now() - Date.parse(l.lastConfirmedAt) > 30 * 864e5));
  const todo = [
    ...data.listings.filter((l) => l.status === 'changes_requested').map((l) => ({ tone: 'bad', t: `Changes requested on “${l.title}”`, s: l.lastNote ?? 'See the reviewer’s note', href: `/vendor/listings/${l.id}`, cta: 'Fix it' })),
    ...data.listings.filter((l) => l.status === 'draft').map((l) => ({ tone: 'warn', t: `“${l.title}” is a draft`, s: 'Submit it for review to go live', href: '/vendor?view=listings', cta: 'Open' })),
    ...(!v.whatsappVerified ? [{ tone: 'warn', t: 'Confirm your WhatsApp number', s: 'Add it to your sign-in so travellers see it’s really you', href: '/account', cta: 'Confirm' }] : []),
    ...(n(t?.unanswered) ? [{ tone: 'warn', t: `${t?.unanswered} experience${n(t?.unanswered) === 1 ? '' : 's'} without your reply`, s: 'A short, polite reply builds trust, even to criticism', href: '/vendor?view=experiences', cta: 'Reply' }] : []),
    ...(stale.length ? [{ tone: 'warn', t: `${stale.length} listing${stale.length === 1 ? '' : 's'} not confirmed this month`, s: 'Travellers see when you last confirmed your details', href: '/vendor?view=listings', cta: 'Confirm' }] : []),
    ...(v.verificationLevel < 2 ? [{ tone: 'ok', t: 'Get to level 2: upload your licence and registration', s: 'Licensed businesses get about twice the enquiries', href: '/vendor?view=verification', cta: 'Upload' }] : []),
  ];

  const heatMax = Math.max(1, ...(stats?.heat.map((h) => n(h.n)) ?? [1]));
  const cell = (d: number, sl: number) => n(stats?.heat.find((h) => h.dow === d && h.slot === sl)?.n);

  const head = (title: string, desc?: string, actions?: React.ReactNode) => (
    <AreaHead crumb={`${v.name} · business console`} title={title} desc={desc} actions={actions} />
  );

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      {v.suspended ? <div role="alert" className="rounded-xl border border-danger bg-danger-soft p-3 text-[14px] text-danger"><b>Your business is suspended.</b> Your listings are hidden. Contact Karibu to resolve this.</div> : null}

      {view === 'overview' ? (
        <>
          {head(v.name, undefined, (
            <>
              <span className="flex flex-wrap items-center gap-1.5">
                {v.verificationLevel ? <span className="chip bg-teal-soft text-teal"><Icon name="check" size={12} strokeWidth={3} />{LEVEL_LABEL[v.verificationLevel]}</span> : <span className="chip bg-amber-soft text-amber">Not verified yet</span>}
                <span className="chip bg-soft text-muted">{v.plan.name} plan</span>
              </span>
              {atLimit ? <Link href="/vendor/plan" className="btn-primary h-9 min-h-0 text-[13px]">Upgrade to add more</Link> : <Link href="/vendor/listings/new" className="btn-primary h-9 min-h-0 text-[13px]"><Icon name="plus" size={16} />New listing</Link>}
            </>
          ))}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat k="Listing views, 30 days" v={n(t?.views30d).toLocaleString()} d={`${delta(n(t?.views30d), n(t?.viewsPrev30d))} vs previous 30 days`} />
            <Stat k="Enquiries, 30 days" v={n(t?.enquiries30d).toLocaleString()} d={`${delta(n(t?.enquiries30d), n(t?.enquiriesPrev30d))} vs previous 30 days`} />
            <Stat k="Enquiry rate" v={n(t?.views30d) ? `${((n(t?.enquiries30d) / n(t?.views30d)) * 100).toFixed(1)}%` : '—'} d="Views that became a WhatsApp message" />
            <Stat k="Experiences" v={n(t?.reviews)} d={t?.rating ? `${t.rating} average${t.recommendPct != null ? ` · ${t.recommendPct}% recommend` : ''}` : 'Ratings show after 3'} />
          </section>
          <Panel title="Needs you" meta={`${todo.length} item${todo.length === 1 ? '' : 's'}`} pad={false}>
            {todo.length === 0 ? <p className="p-4 text-[14px] text-muted">All good. Nothing needs you right now.</p> : (
              <ul className="divide-y divide-line/70">
                {todo.map((x) => (
                  <li key={x.t} className="grid grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
                    <span className={`h-full rounded ${x.tone === 'bad' ? 'bg-danger' : x.tone === 'warn' ? 'bg-amber' : 'bg-teal'}`} />
                    <span className="min-w-0"><span className="block text-[14px] font-semibold">{x.t}</span><span className="block truncate text-[12.5px] text-muted">{x.s}</span></span>
                    <Link href={x.href} className="btn-outline h-8 min-h-0 px-3 text-[12.5px]">{x.cta}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Enquiries per week" meta="Last 12 weeks">
              {stats?.weekly.length ? (
                <div className="flex h-36 items-end gap-1.5 border-b border-line" role="img" aria-label="Enquiries per week">
                  {stats.weekly.map((w) => (
                    <div key={w.week} className="flex flex-1 flex-col items-center gap-1" title={`Week of ${shortDate(w.week)}: ${w.enquiries}`}>
                      <span className="text-[11px] font-semibold tabular-nums text-muted">{w.enquiries}</span>
                      <span className="w-full rounded-t bg-brand" style={{ height: `${(n(w.enquiries) / maxWeek) * 100}px` }} />
                    </div>
                  ))}
                </div>
              ) : <p className="text-[14px] text-muted">No enquiries yet. They’ll show here week by week.</p>}
            </Panel>
            <Panel title="Opportunities" meta="What travellers searched for near you, but found little">
              {stats?.opportunities.length ? (
                <ul className="flex flex-col gap-2">
                  {stats.opportunities.map((o) => (
                    <li key={o.query + o.city} className="flex items-center justify-between gap-2 text-[14px]">
                      <span>“{o.query}” <span className="text-muted">in {o.city.replace(/-/g, ' ')}</span></span>
                      <span className="chip bg-brand-soft text-brand">{o.searches} searches</span>
                    </li>
                  ))}
                  <li className="pt-1 text-[12.5px] text-muted">If you offer any of these, add a listing or update your description so travellers find you.</li>
                </ul>
              ) : <p className="text-[14px] text-muted">No unmet searches near you this month.</p>}
            </Panel>
          </div>
        </>
      ) : null}

      {view === 'listings' ? (
        <>
          {head('Listings', `${data.listings.length} of ${v.plan.maxListings} on the ${v.plan.name} plan. Each goes live once our team has verified it.`,
            atLimit ? <Link href="/vendor/plan" className="btn-primary h-9 min-h-0 text-[13px]">Upgrade to add more</Link> : <Link href="/vendor/listings/new" className="btn-primary h-9 min-h-0 text-[13px]"><Icon name="plus" size={16} />New listing</Link>)}
          <Panel pad={false}>
            {data.listings.length === 0 ? <p className="p-4 text-[14px] text-muted">No listings yet. Create your first one.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead><tr className="border-b border-line bg-soft/50 text-left text-[12px] text-muted"><th className="px-4 py-2 font-semibold">Listing</th><th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2 text-right font-semibold">Views (30 d)</th><th className="px-4 py-2 text-right font-semibold">Enquiries</th><th className="px-4 py-2 font-semibold">Confirmed</th><th className="px-4 py-2" /></tr></thead>
                  <tbody>
                    {data.listings.map((l) => {
                      const [label, cls] = STATUS[l.status] ?? [l.status, 'bg-soft'];
                      const st = stats?.perListing.find((x) => x.id === l.id);
                      return (
                        <tr key={l.id} className="border-b border-line/70 last:border-0 align-top">
                          <td className="px-4 py-3"><b>{l.title}</b><span className="block text-[12.5px] text-muted">{CATEGORY_SINGULAR[l.category as Category] ?? l.category} · {l.subtype}</span>
                            {l.status === 'changes_requested' && l.lastNote ? <span className="mt-1 block rounded-md bg-amber-soft px-2 py-1 text-[13px] text-amber"><b>Reviewer:</b> {l.lastNote}</span> : null}</td>
                          <td className="px-4 py-3"><span className={`chip ${cls}`}>{label}</span></td>
                          <td className="px-4 py-3 text-right tabular-nums">{n(st?.views).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{n(st?.enquiries)}</td>
                          <td className="px-4 py-3 text-[12.5px] text-muted">{l.lastConfirmedAt ? shortDate(l.lastConfirmedAt) : '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {l.status === 'live' ? <Link href={`/listing/${l.slug}`} className="btn-ghost h-8 min-h-0 px-2.5 text-[12.5px]">View</Link> : null}
                              {l.status === 'live' ? <button className="btn-outline h-8 min-h-0 px-2.5 text-[12.5px]" onClick={() => confirmListing(l.id)} title="Tell travellers your details are still accurate">Still accurate</button> : null}
                              {!['in_review', 'suspended'].includes(l.status) ? <Link href={`/vendor/listings/${l.id}`} className="btn-outline h-8 min-h-0 px-2.5 text-[12.5px]">Edit</Link> : null}
                              {['draft', 'changes_requested', 'expired'].includes(l.status) ? <button className="btn-primary h-8 min-h-0 px-2.5 text-[12.5px]" onClick={() => submit(l.id)}>Submit for review</button> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {view === 'enquiries' ? (
        <>
          {head('Enquiries', 'Each WhatsApp message from Karibu includes a reference like K-8F3QW, so you can match chats to this list.', enq.length ? <button className="btn-outline h-9 min-h-0 text-[13px]" onClick={exportCsv}>Export CSV</button> : null)}
          <Panel pad={false}>
            {enq.length === 0 ? <p className="p-4 text-[14px] text-muted">No enquiries yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead><tr className="border-b border-line bg-soft/50 text-left text-[12px] text-muted"><th className="px-4 py-2 font-semibold">Reference</th><th className="px-4 py-2 font-semibold">Listing</th><th className="px-4 py-2 font-semibold">For</th><th className="px-4 py-2 font-semibold">Received</th></tr></thead>
                  <tbody>
                    {enq.slice(0, 200).map((e) => (
                      <tr key={e.refCode} className="border-b border-line/70 last:border-0">
                        <td className="px-4 py-2.5"><span className="rounded bg-soft px-2 py-0.5 font-mono font-semibold">{e.refCode}</span>{e.sourceCode ? <span className="chip ml-2 bg-amber-soft text-amber">via {e.sourceCode}</span> : null}</td>
                        <td className="px-4 py-2.5">{e.listing}</td>
                        <td className="px-4 py-2.5 text-muted">{e.requestedDate ? shortDate(e.requestedDate) : '—'}</td>
                        <td className="px-4 py-2.5 text-muted">{shortDate(e.createdAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {view === 'experiences' ? (
        <>
          {head('Experiences', 'What travellers shared about you. Reply once to each, politely. You can’t remove experiences, but our team removes personal details and abuse.')}
          <Panel pad={false}>
            {!reviews ? <div className="m-4 h-24 animate-pulse rounded bg-soft" /> : reviews.length === 0 ? <p className="p-4 text-[14px] text-muted">No experiences yet. Travellers can share one after they contact you.</p> : (
              <ul className="divide-y divide-line/70">
                {reviews.map((r) => (
                  <li key={r.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="text-[#E8A010]">{'★'.repeat(r.rating)}<span className="text-line">{'★'.repeat(5 - r.rating)}</span></span>
                      <b>{r.author}</b><span className="text-muted">on {r.listing} · {shortDate(r.createdAt)}</span>
                      {r.contacted ? <span className="chip bg-teal-soft text-teal">Contacted via Karibu</span> : null}
                      {r.recommend === false ? <span className="chip bg-amber-soft text-amber">Wouldn’t recommend</span> : null}
                      {r.status === 'hidden' ? <span className="chip bg-soft text-muted">Hidden by Karibu</span> : null}
                    </div>
                    {r.body ? <p className="mt-1.5 text-[14.5px]">{r.body}</p> : null}
                    {r.vendorReply ? (
                      <p className="mt-2 rounded-lg bg-soft px-3 py-2 text-[14px]"><b>Your reply:</b> {r.vendorReply}</p>
                    ) : r.status === 'published' ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input className="input h-9 min-h-0 flex-1" aria-label="Your reply" placeholder="Thank them, or explain what you’ve changed" value={reply[r.id] ?? ''} onChange={(e) => setReply((x) => ({ ...x, [r.id]: e.target.value }))} maxLength={1000} />
                        <button className="btn-primary h-9 min-h-0 text-[13px]" disabled={(reply[r.id] ?? '').trim().length < 2} onClick={() => sendReply(r.id)}>Reply</button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}

      {view === 'insights' ? (
        <>
          {head('Insights', 'How travellers find and contact you. Counts only; Karibu never shares who viewed you.')}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat k="Views, 30 days" v={n(t?.views30d).toLocaleString()} d={`${delta(n(t?.views30d), n(t?.viewsPrev30d))} vs previous 30 days`} />
            <Stat k="Enquiries, 30 days" v={n(t?.enquiries30d)} d={`${delta(n(t?.enquiries30d), n(t?.enquiriesPrev30d))} vs previous 30 days`} />
            <Stat k="Saved by travellers" v={(stats?.perListing ?? []).reduce((s, x) => s + n(x.saves), 0)} d="Across your listings" />
            <Stat k="Prices reported" v={n(t?.priceReports)} d="“I paid this much” at your business" />
          </section>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="By listing" meta="30 days" pad={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead><tr className="border-b border-line bg-soft/50 text-left text-[12px] text-muted"><th className="px-4 py-2 font-semibold">Listing</th><th className="px-4 py-2 text-right font-semibold">Views</th><th className="px-4 py-2 text-right font-semibold">Enquiries</th><th className="px-4 py-2 text-right font-semibold">Rate</th><th className="px-4 py-2 text-right font-semibold">Saves</th></tr></thead>
                  <tbody>
                    {(stats?.perListing ?? []).map((x) => (
                      <tr key={x.id} className="border-b border-line/70 last:border-0">
                        <td className="px-4 py-2.5">{x.title}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{n(x.views).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{n(x.enquiries)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{n(x.views) ? `${((n(x.enquiries) / n(x.views)) * 100).toFixed(1)}%` : '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{n(x.saves)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="When travellers message you" meta="East Africa time, last 90 days">
              <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-[3px] text-[11px] text-muted" aria-label="Enquiries by day and time">
                <span />{DOW.map((d) => <b key={d} className="text-center font-medium">{d}</b>)}
                {SLOT.map((s, i) => (
                  <span key={s} className="contents">
                    <b className="font-medium">{s}</b>
                    {DOW.map((d, j) => { const c = cell(j + 1, i); return <span key={d} title={`${d} ${s}: ${c}`} className="aspect-[1.8] rounded-sm" style={{ background: c ? `color-mix(in srgb, rgb(var(--brand)) ${Math.round((c / heatMax) * 85) + 15}%, rgb(var(--soft)))` : 'rgb(var(--soft))' }} />; })}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[12.5px] text-muted">Replying within an hour in your busiest times wins most bookings.</p>
            </Panel>
          </div>
        </>
      ) : null}

      {view === 'verification' ? (
        <>
          {head('Verification', 'Free, and it can’t be bought. Each level is checked by our team and shown to travellers as a receipt on your listings.')}
          <Panel title="Your level" meta={v.verifiedAt ? `Verified ${shortDate(v.verifiedAt)}${v.reverifyDue ? ` · re-check by ${shortDate(v.reverifyDue)}` : ''}` : 'Not verified yet'}>
            <ol className="grid gap-3 md:grid-cols-3">
              {[
                [1, 'Contact verified', 'WhatsApp or a company email confirmed, and owner identity checked.'],
                [2, 'Licensed', 'Licence and business documents checked with the issuer.'],
                [3, 'Visited', 'A team member visits in person; a second person approves. Needed for homes and private places.'],
              ].map(([lv, title, body]) => {
                const done = v.verificationLevel >= (lv as number);
                const next = v.verificationLevel + 1 === lv;
                return (
                  <li key={lv as number} className={`rounded-lg border p-3 ${done ? 'border-teal/40 bg-teal-soft/60' : next ? 'border-brand/40' : 'border-line'}`}>
                    <div className="flex items-center gap-2 text-[14px] font-semibold">{done ? <Icon name="check" size={15} strokeWidth={3} className="text-teal" /> : <span className="text-muted">L{lv as number}</span>}{title as string}{next ? <span className="chip bg-brand-soft text-brand">Next</span> : null}</div>
                    <p className="mt-1 text-[13px] text-muted">{body as string}</p>
                  </li>
                );
              })}
            </ol>
          </Panel>
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Documents" meta="Private: only our verification team sees them">
              <ul className="flex flex-col gap-1.5 text-[14px]">
                {data.documents.length === 0 ? <li className="text-muted">None uploaded yet.</li> : null}
                {data.documents.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2"><span>{DOC_TYPES.find((tt) => tt[0] === d.docType)?.[1] ?? d.docType}</span><span className={`chip ${d.result === 'accepted' ? 'bg-teal-soft text-teal' : d.result === 'rejected' ? 'bg-danger-soft text-danger' : 'bg-amber-soft text-amber'}`}>{d.result}</span></li>
                ))}
              </ul>
              <form onSubmit={upload} className="mt-4 flex flex-col gap-2 border-t border-line/70 pt-4">
                <label className="label" htmlFor="dt">Document type</label>
                <select id="dt" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  {DOC_TYPES.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                </select>
                <label className="label" htmlFor="df">File (PDF, JPG, PNG or WEBP, up to 10 MB)</label>
                <input id="df" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-[14px]" />
                <button className="btn-dark self-start"><Icon name="upload" size={16} />Upload</button>
                {upMsg ? <p role="status" className="text-[14px]">{upMsg}</p> : null}
              </form>
            </Panel>
            <Panel title="Travellers contact you at">
              <ContactRow label="WhatsApp" value={v.whatsapp} ok={v.whatsappVerified} fix={<Link href="/account" className="font-semibold text-brand underline">Confirm it by adding this number to your sign-in</Link>} />
              {v.email ? <ContactRow label={v.emailIsCompany ? 'Company email' : 'Email'} value={v.email} ok={v.emailVerified} fix={<VerifyEmail />} /> : null}
              <p className="mt-3 text-[13px] text-muted">Karibu never takes payments or commission. Agree prices and payment directly with travellers, and only take deposits to a company account or paybill.</p>
            </Panel>
          </div>
        </>
      ) : null}

      {view === 'profile' ? (
        <>
          {head('Public page', 'What travellers see about your business on every listing.', <Link href={`/b/${v.slug}`} className="btn-outline h-9 min-h-0 text-[13px]">View public page</Link>)}
          <PublicPage v={v} onSaved={load} />
        </>
      ) : null}
    </div>
  );
}

function ContactRow({ label, value, ok, fix }: { label: string; value: string; ok: boolean; fix: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="text-[12px] font-bold text-muted">{label}</div>
      <div className="font-mono">{value}</div>
      {ok ? (
        <span className="chip mt-1 bg-teal-soft text-teal"><Icon name="check" size={12} strokeWidth={3} />Confirmed</span>
      ) : (
        <div className="mt-1 text-[13px]"><span className="chip bg-amber-soft text-amber">Not confirmed yet</span> <span className="ml-1">{fix}</span></div>
      )}
    </div>
  );
}

function VerifyEmail() {
  const [state, setState] = useState<'idle' | 'sent'>('idle');
  const [dev, setDev] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setErr(null);
    try {
      const r = await call<{ devLink?: string }>('/vendor/email/start', { body: {} });
      setDev(r.devLink ?? null);
      setState('sent');
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  if (state === 'sent') return <span>Link sent. Open it from that inbox.{dev ? <> <a className="font-bold underline" href={dev}>Dev: open link</a></> : null}</span>;
  return <>{' '}<button className="font-bold text-brand underline" onClick={send}>Send a confirmation link</button>{err ? <span className="text-danger"> {err}</span> : null}</>;
}

/** The business's shareable page and live badge, plus the short "about" shown on it. */
function PublicPage({ v, onSaved }: { v: VMe['vendor']; onSaved: () => void }) {
  const [about, setAbout] = useState(v.about ?? '');
  const [website, setWebsite] = useState(v.website ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const pageUrl = `${origin}/b/${v.slug}`;
  const badge = `<a href="${pageUrl}"><img src="${origin}/api/businesses/${v.slug}/badge.svg" alt="Verified on Karibu" width="220" height="52"></a>`;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await call('/vendor/me', { method: 'PATCH', body: { about: about || null, website: website || null } });
      setMsg('Saved');
      onSaved();
    } catch (x) {
      setMsg((x as Error).message);
    }
  }
  return (
    <section className="card flex flex-col gap-3 p-5 text-[14px]">
      <h2 className="font-extrabold">Your public page</h2>
      {v.verificationLevel ? (
        <>
          <p className="text-muted">Share this link, or put the badge on your website. Both update live: if verification lapses, they say so.</p>
          <a href={`/b/${v.slug}`} className="break-all font-bold text-brand underline">{pageUrl.replace(/^https?:\/\//, '')}</a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/businesses/${v.slug}/badge.svg`} alt="Your Karibu badge" width={220} height={52} />
          <label className="label" htmlFor="badge">Badge code for your website</label>
          <textarea id="badge" readOnly className="input min-h-[90px] py-2 font-mono text-[12px]" value={badge} onFocus={(e) => e.currentTarget.select()} />
        </>
      ) : (
        <p className="text-muted">Your public page and badge switch on once our team has verified you.</p>
      )}
      <form onSubmit={save} className="flex flex-col gap-2">
        <label className="label" htmlFor="about">About your business ({600 - about.length} left)</label>
        <textarea id="about" maxLength={600} className="input min-h-[90px] py-2" value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Family-run since 2009. Six pop-top Land Cruisers, KPSGA-certified guides." />
        <label className="label" htmlFor="web">Website (optional)</label>
        <input id="web" type="url" className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        <button className="btn-dark self-start">Save</button>
        {msg ? <p role="status">{msg}</p> : null}
      </form>
    </section>
  );
}
