'use client';

import { useEffect, useState } from 'react';
import { shrinkPhoto } from '@/components/PhotoUploader';
import { Btn, CATEGORY, Card, Empty, ErrorNote, LockedNote, Modal, NoAccess, PageHead, ago, api, useLoad, useStaff, waited, when } from '../../ui';

type Row = { id: string; title: string; category: string; subtype: string; status: string; vendor: string; vendorLevel: number; city: string; minLevel: number; isPrivate: boolean; since: string | null; docsPending: number; level3Approval: string | null; visit: string | null };
type Detail = {
  listing: Record<string, any>;
  documents: { id: string; docType: string; fileName: string; result: string; uploadedAt: string }[];
  history: { from: string | null; to: string; reason: string | null; at: string; actor: string | null }[];
  photos: { id: string; url: string; alt: string }[];
  visits: { id: string; status: string; scheduledFor: string; checklist: Record<string, boolean>; notes: string | null; submittedAt: string | null; verifier: string }[];
  approvals: { id: string; kind: string; status: string; reason: string | null; requestedAt: string; requestedBy: string; mine: boolean }[];
};

const LEVELS = [
  { n: 1, t: 'Level 1 · Contact verified', note: 'WhatsApp or company email confirmed and identity checked' },
  { n: 2, t: 'Level 2 · Licensed', note: 'Business documents and licence checked' },
  { n: 3, t: 'Level 3 · Visited', note: 'Needs a submitted field visit and a second approval' },
];
const CHECK_LABEL: Record<string, string> = { addressMatches: 'Address matches the listing area', personMatchesId: 'Owner or host matches the ID on file', matchesListing: 'The place matches the listing and photos', safeForGuests: 'Safe and suitable for guests' };

function Tick({ ok, bad }: { ok: boolean; bad?: boolean }) {
  return <span className={`tick ${bad ? 'bad' : ok ? 'ok' : 'no'}`}>{bad ? '✕' : ok ? '✓' : ''}</span>;
}

export default function QueuePage() {
  const { can, toast, refresh } = useStaff();
  const { data, err, reload } = useLoad<{ queue: Row[] }>(can('queue.view') ? '/admin/queue' : null);
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [level, setLevel] = useState(2);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const queue = data?.queue ?? [];
  const row = queue.find((x) => x.id === sel);
  const loadDetail = (id: string) => api<Detail>(`/admin/listings/${id}`).then((r) => {
    setD(r);
    setLevel(Math.max(r.listing.min_level, r.listing.location_is_private ? 3 : 1, Math.min(r.listing.verification_level || 1, 3)));
  }).catch((e) => setMsg(e.message));

  useEffect(() => {
    if (!sel && queue[0]) setSel(queue[0].id);
  }, [queue, sel]);
  useEffect(() => {
    if (!sel) return;
    setD(null);
    setNote('');
    setMsg(null);
    loadDetail(sel);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can('queue.view')) return <NoAccess />;

  async function decide(decision: 'approve' | 'changes' | 'reject') {
    setMsg(null);
    try {
      const r = await api<{ status: string; solo?: boolean }>(`/admin/listings/${sel}/decision`, { body: { decision, level: decision === 'approve' ? level : undefined, note: note || undefined } });
      toast(r.status === 'awaiting_second_approval' ? 'Sent for second approval' : r.solo ? 'Approved at level 3 (no second approver available; recorded)' : `Listing is now ${r.status.replace('_', ' ')}`);
      if (r.status === 'awaiting_second_approval') loadDetail(sel!);
      else setSel(null);
      reload();
      refresh();
    } catch (x) {
      setMsg((x as Error).message);
    }
  }
  async function doc(id: string, result: 'accepted' | 'rejected') {
    await api(`/admin/documents/${id}`, { body: { result } });
    setD((x) => x && { ...x, documents: x.documents.map((dd) => (dd.id === id ? { ...dd, result } : dd)) });
    toast(`Document ${result}`);
  }

  const l = d?.listing;
  const needed = l ? Math.max(l.min_level, l.location_is_private ? 3 : 1) : 1;
  const visit = d?.visits.find((v) => v.status === 'submitted');
  const booked = d?.visits.find((v) => v.status === 'booked');
  const pendingL3 = d?.approvals.find((a) => a.kind === 'level3' && a.status === 'pending');
  const docsAccepted = d?.documents.filter((x) => x.result === 'accepted').length ?? 0;

  return (
    <>
      <PageHead crumb="Verification" title="Review queue" desc="Decide within 2 working days, oldest first. Verification is free and can’t be bought; plans never affect it."
        actions={<><span className="chip">{queue.length} waiting</span>{queue.filter((x) => waited(x.since).late).length ? <span className="chip warn">{queue.filter((x) => waited(x.since).late).length} over target</span> : null}</>} />
      <ErrorNote err={err} />
      {!data ? null : queue.length === 0 ? (
        <Card><Empty>The queue is empty. Nice work.</Empty></Card>
      ) : (
        <div className="grid g2">
          <section className="card tbl">
            <table>
              <thead><tr><th>Listing</th><th>Needs</th><th className="r">Waiting</th></tr></thead>
              <tbody>
                {queue.map((x) => {
                  const w = waited(x.since);
                  return (
                    <tr key={x.id} className={`click ${x.id === sel ? 'sel' : ''}`} onClick={() => setSel(x.id)}>
                      <td><b>{x.title}</b><span className="sub">{CATEGORY[x.category] ?? x.category} · {x.city} · {x.vendor}</span>
                        {x.level3Approval === 'pending' ? <span className="chip blue" style={{ marginTop: 4 }}>Waiting for second approval</span> : x.visit === 'booked' ? <span className="chip" style={{ marginTop: 4 }}>Visit booked</span> : null}
                      </td>
                      <td><span className="lvl">L{Math.max(x.minLevel, x.isPrivate ? 3 : 1)}</span><span className="sub">has L{x.vendorLevel}</span></td>
                      <td className="r num">{w.late ? <span className="chip warn">{w.text}</span> : w.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <Card title={row?.title ?? 'Listing'} meta={row ? `${CATEGORY[row.category] ?? row.category} · ${row.city}` : ''}>
            {!l || !d ? <div className="empty">Loading…</div> : (
              <div className="pad stack">
                <p className="footnote" style={{ margin: 0 }}>
                  {l.vendor_name} · {l.subtype}{l.location_is_private ? ' · private home (exact location hidden from travellers)' : ''} · licence {l.licence_number || 'not given'}
                </p>
                <StaffPhotos listingId={sel!} photos={d.photos} onChanged={() => loadDetail(sel!)} />
                <div>
                  <div className="check"><Tick ok={!!l.whatsapp_verified} /><span><b>WhatsApp confirmed</b><span className="s">{l.whatsapp_e164} {l.whatsapp_verified ? 'matches a verified sign-in' : 'not yet confirmed'}</span></span><span className={`chip ${l.whatsapp_verified ? 'ok' : ''}`}>L1</span></div>
                  <div className="check"><Tick ok={!!(l.vendor_email_verified && l.vendor_email_is_company)} /><span><b>Company email</b><span className="s">{l.vendor_email ?? 'none'} {l.vendor_email ? (l.vendor_email_verified ? '· confirmed' : '· not confirmed') : ''}{l.vendor_email && !l.vendor_email_is_company ? ' · free webmail, a weaker signal' : ''}</span></span><span className="chip">Signal</span></div>
                  <div className="check"><Tick ok={docsAccepted > 0 && !!l.licence_number} /><span><b>Licence on the regulator’s register</b><span className="s">Check {l.licence_number ? <b className="mono">{l.licence_number}</b> : 'the licence'} on <a href="https://verify.tra.go.ke" target="_blank" rel="noopener">verify.tra.go.ke</a>, then accept the document below</span></span><span className={`chip ${docsAccepted ? 'ok' : ''}`}>L2</span></div>
                  {needed >= 3 || visit || booked ? (
                    <div className="check"><Tick ok={!!visit} bad={!!visit && Object.values(visit.checklist).some((v) => !v)} />
                      <span><b>Field visit</b><span className="s">{visit ? `${visit.verifier}, ${when(visit.submittedAt)}` : booked ? `Booked with ${booked.verifier} for ${when(booked.scheduledFor)}` : 'Not booked yet'}</span></span>
                      <span className={`chip ${visit ? 'ok' : ''}`}>L3</span></div>
                  ) : null}
                </div>
                {visit ? (
                  <div className="card pad" style={{ background: 'var(--head)' }}>
                    <b>Visit report</b>
                    <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{Object.entries(visit.checklist).map(([k, v]) => <li key={k} style={{ color: v ? undefined : 'var(--bad)' }}>{v ? '✓' : '✕'} {CHECK_LABEL[k] ?? k}</li>)}</ul>
                    <p style={{ margin: 0 }}>{visit.notes}</p>
                  </div>
                ) : null}

                <div>
                  <label className="f">Documents</label>
                  {d.documents.length === 0 ? <p className="footnote" style={{ margin: 0 }}>No documents uploaded yet.</p> : (
                    <div className="stack" style={{ gap: 6 }}>
                      {d.documents.map((x) => (
                        <div key={x.id} className="row" style={{ justifyContent: 'space-between' }}>
                          <span><a href={`/api/admin/documents/${x.id}/file`} target="_blank" rel="noopener">{x.docType}</a> <span className="footnote">{x.fileName} · {ago(x.uploadedAt)}</span></span>
                          <span className="row">
                            <span className={`chip ${x.result === 'accepted' ? 'ok' : x.result === 'rejected' ? 'bad' : 'warn'}`}>{x.result}</span>
                            {x.result === 'pending' ? <><Btn kind="sm" perm="queue.decide" onClick={() => doc(x.id, 'accepted')}>Accept</Btn><Btn kind="sm danger" perm="queue.decide" onClick={() => doc(x.id, 'rejected')}>Reject</Btn></> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {pendingL3 ? (
                  <div className="banner"><span><b>Waiting for second approval.</b> {pendingL3.requestedBy} asked {ago(pendingL3.requestedAt)}{pendingL3.reason ? `: “${pendingL3.reason}”` : ''}. {pendingL3.mine ? 'Someone else must approve it.' : 'Decide it in Second approvals.'}</span></div>
                ) : (
                  <>
                    <div className="levels" role="radiogroup" aria-label="Level reached">
                      {LEVELS.map((x) => (
                        <label key={x.n}>
                          <input type="radio" name="lvl" checked={level === x.n} onChange={() => setLevel(x.n)} />
                          <span><b>{x.t}</b><span className="note">{x.n < needed ? `Not enough for this listing (needs level ${needed})` : x.note}</span></span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <label className="f" htmlFor="note">Note to the business (required to ask for changes or reject)</label>
                      <textarea id="note" className="in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: please upload your current PSV licence; the one we have expired in June." />
                    </div>
                    <div className="row">
                      {level === 3 ? (
                        <Btn kind="primary" perm={['level3.request', 'level3.approve']} disabled={!visit} onClick={() => decide('approve')} title={!visit ? 'Needs a submitted field visit' : undefined}>Send level 3 for second approval</Btn>
                      ) : (
                        <Btn kind="primary" perm="queue.decide" disabled={level < needed} onClick={() => decide('approve')}>Approve at level {level} and publish</Btn>
                      )}
                      <Btn perm="queue.decide" onClick={() => decide('changes')}>Ask for changes</Btn>
                      <Btn kind="danger" perm="queue.decide" onClick={() => decide('reject')}>Reject</Btn>
                      {needed >= 3 && !visit && !booked ? <Btn perm="visits.assign" onClick={() => setBooking(true)}>Book field visit</Btn> : null}
                    </div>
                  </>
                )}
                {!can('queue.decide') ? <LockedNote>Your role can see this listing but can’t decide on it.</LockedNote> : null}
                {msg ? <p className="err" role="alert">{msg}</p> : null}

                <details>
                  <summary className="small muted" style={{ cursor: 'pointer' }}>History ({d.history.length})</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} className="small">
                    {d.history.map((h, i) => <li key={i}>{when(h.at)} · {h.from ? `${h.from} → ` : ''}{h.to}{h.actor ? ` · ${h.actor}` : ''}{h.reason ? ` · ${h.reason}` : ''}</li>)}
                  </ul>
                </details>
              </div>
            )}
          </Card>
        </div>
      )}
      {booking && sel ? <BookVisit listingId={sel} onClose={() => setBooking(false)} onDone={() => { setBooking(false); loadDetail(sel); reload(); toast('Field visit booked'); }} /> : null}
    </>
  );
}

function BookVisit({ listingId, onClose, onDone }: { listingId: string; onClose: () => void; onDone: () => void }) {
  const { data } = useLoad<{ verifiers: { id: string; displayName: string; role: string }[] }>('/admin/verifiers');
  const [who, setWho] = useState('');
  const [at, setAt] = useState(() => {
    const t = new Date(Date.now() + 86400e3);
    t.setHours(10, 0, 0, 0);
    return new Date(t.getTime() - t.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (data?.verifiers[0] && !who) setWho(data.verifiers[0].id);
  }, [data, who]);
  return (
    <Modal title="Book a field visit" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!who} onClick={async () => {
        try { await api('/admin/visits', { body: { listingId, assignedTo: who, scheduledFor: new Date(at).toISOString() } }); onDone(); } catch (e) { setErr((e as Error).message); }
      }}>Book visit</button>
    </>}>
      <div>
        <label className="f" htmlFor="who">Field verifier</label>
        <select id="who" className="in" value={who} onChange={(e) => setWho(e.target.value)}>
          {(data?.verifiers ?? []).map((v) => <option key={v.id} value={v.id}>{v.displayName}{v.role === 'owner' ? ' (Owner)' : ''}</option>)}
        </select>
        {data && !data.verifiers.length ? <p className="err">No field verifiers yet. An Owner can invite one in Team and roles.</p> : null}
      </div>
      <div>
        <label className="f" htmlFor="at">When</label>
        <input id="at" className="in" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </div>
      {err ? <p className="err">{err}</p> : null}
    </Modal>
  );
}

/**
 * The photo pilot: our field team photographs a business (or receives its photos) and adds them here,
 * with the owner's permission on record. Every add and removal is in the audit log.
 */
function StaffPhotos({ listingId, photos, onChanged }: { listingId: string; photos: Detail['photos']; onChanged: () => void }) {
  const { can, toast } = useStaff();
  const [ok, setOk] = useState(false);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const allowed = can('businesses.support', 'queue.decide', 'visits.submit');
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const f of [...files].slice(0, 10)) {
        const form = new FormData();
        form.append('permission', 'yes');
        form.append('alt', alt);
        form.append('file', await shrinkPhoto(f), 'photo.jpg');
        await api(`/admin/listings/${listingId}/photos`, { form });
      }
      toast('Photos added');
      setAlt('');
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  async function removePhoto(id: string) {
    try {
      await api(`/admin/listings/${listingId}/photos/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><b>Photos</b><span className="footnote" style={{ margin: 0 }}>{photos.length ? `${photos.length} on the listing · the first is the cover` : 'None yet: travellers see a drawn illustration'}</span></div>
      {photos.length ? (
        <div className="row" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {photos.map((p) => (
            <span key={p.id} style={{ position: 'relative', flex: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt} style={{ height: 76, width: 100, borderRadius: 4, objectFit: 'cover', display: 'block' }} />
              {allowed ? <button className="btn" style={{ position: 'absolute', top: 3, right: 3, height: 20, padding: '0 5px', fontSize: 11 }} onClick={() => removePhoto(p.id)} aria-label="Remove photo">✕</button> : null}
            </span>
          ))}
        </div>
      ) : null}
      {allowed ? (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label className="row" style={{ gap: 6, fontSize: 13, flex: '1 1 260px' }}>
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            The business gave permission to use these photos (photo permission on file or signed at the visit)
          </label>
          <input className="in" style={{ flex: "1 1 180px", width: "auto" }} placeholder="What they show (optional)" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={160} />
          <label className={`btn ${ok ? 'primary' : ''}`} style={{ opacity: ok ? 1 : 0.5, pointerEvents: ok && !busy ? 'auto' : 'none' }}>
            {busy ? 'Uploading…' : 'Add photos'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={!ok || busy} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      ) : null}
      {err ? <p className="footnote" style={{ color: 'var(--bad)', margin: 0 }}>{err}</p> : null}
    </div>
  );
}
