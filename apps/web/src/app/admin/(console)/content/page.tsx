'use client';

import { useEffect, useState } from 'react';
import { Btn, Card, Empty, ErrorNote, Modal, NoAccess, PageHead, ago, api, countryName, useLoad, useReason, useStaff } from '../../ui';

type Link_ = { id: string; country: string; topic: string; title: string; url: string; description: string; warning: string | null; lastCheckedOn: string; isActive: boolean; daysSinceCheck: number };
type Advisory = { id: string; country: string; city: string | null; message: string; startsAt: string; endsAt: string | null; active: boolean };
const TOPICS: [string, string][] = [['entry', 'Visas and entry'], ['safety', 'Safety and police'], ['parks', 'Parks and wildlife'], ['business_check', 'Check a business'], ['health', 'Health'], ['transport', 'Trains and airports'], ['embassies', 'Embassies'], ['complaints', 'Complaints'], ['tourism', 'Tourism board']];
const TOPIC = Object.fromEntries(TOPICS);

function LinkForm({ initial, onClose, onSaved }: { initial: Partial<Link_> | null; onClose: () => void; onSaved: () => void }) {
  const { me } = useStaff();
  const [f, setF] = useState({ country: initial?.country?.trim() ?? me.staff.country ?? 'KE', topic: initial?.topic ?? 'entry', title: initial?.title ?? '', url: initial?.url ?? 'https://', description: initial?.description ?? '', warning: initial?.warning ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={initial?.id ? 'Edit official link' : 'Add official link'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={async () => {
        try {
          const body = { ...f, warning: f.warning || null };
          if (initial?.id) await api(`/admin/links/${initial.id}`, { method: 'PATCH', body });
          else await api('/admin/links', { body });
          onSaved();
        } catch (e) { setErr((e as Error).message); }
      }}>Save</button>
    </>}>
      <div className="row">
        <div style={{ flex: 1 }}><label className="f" htmlFor="lc">Country</label>
          <select id="lc" className="in" value={f.country} disabled={!!me.staff.country} onChange={(e) => set('country', e.target.value)}>{['KE', 'TZ', 'UG', 'RW', 'ET'].map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</select></div>
        <div style={{ flex: 1 }}><label className="f" htmlFor="lt">Topic</label>
          <select id="lt" className="in" value={f.topic} onChange={(e) => set('topic', e.target.value)}>{TOPICS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      </div>
      <div><label className="f" htmlFor="ltt">Title</label><input id="ltt" className="in" value={f.title} onChange={(e) => set('title', e.target.value)} /></div>
      <div><label className="f" htmlFor="lu">Official address (https only)</label><input id="lu" className="in mono" value={f.url} onChange={(e) => set('url', e.target.value)} /></div>
      <div><label className="f" htmlFor="ld">What it’s for</label><textarea id="ld" className="in" value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div><label className="f" htmlFor="lw">Warning (optional)</label><input id="lw" className="in" placeholder="Only use this site; look-alike sites charge extra fees" value={f.warning} onChange={(e) => set('warning', e.target.value)} /></div>
      <p className="footnote" style={{ margin: 0 }}>Open the address yourself before saving, and check it’s the government’s own domain. Saving marks it as checked today.</p>
      {err ? <p className="err">{err}</p> : null}
    </Modal>
  );
}

export default function ContentPage() {
  const { can, me, toast, refresh } = useStaff();
  const allowed = can('content.edit', 'advisories.publish');
  const links = useLoad<{ links: Link_[] }>(can('content.edit') ? '/admin/links' : null);
  const adv = useLoad<{ advisories: Advisory[] }>(allowed ? '/admin/advisories' : null);
  const [edit, setEdit] = useState<Partial<Link_> | null | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const [advCountry, setAdvCountry] = useState(me.staff.country ?? 'KE');
  const [cities, setCities] = useState<{ slug: string; name: string }[]>([]);
  const [pc, setPc] = useState({ citySlug: 'nairobi', group: 'food', item: '', low: '', high: '', checkedOn: new Date().toISOString().slice(0, 10) });
  const [pcErr, setPcErr] = useState<string | null>(null);
  const reason = useReason();
  useEffect(() => {
    fetch(`/api/cities?country=${me.staff.country ?? 'KE'}`).then((r) => r.json()).then((r) => setCities(r.cities ?? [])).catch(() => {});
  }, [me.staff.country]);
  if (!allowed) return <NoAccess />;
  const list = links.data?.links ?? [];
  const stale = list.filter((l) => l.isActive && l.daysSinceCheck > 90).length;

  return (
    <>
      <PageHead crumb="Travel smart" title="Official links, advisories and price checks"
        desc="Every official link shows travellers when it was last checked. Re-check each one at least every 90 days: scammers copy these sites."
        actions={<Btn kind="primary" perm="content.edit" onClick={() => setEdit(null)}>Add official link</Btn>} />
      <ErrorNote err={links.err} />
      {can('content.edit') ? (
        <Card title="Official government links" meta={stale ? `${stale} overdue for a re-check` : 'All checked within 90 days'}>
          {!links.data ? <Empty>Loading…</Empty> : (
            <div className="tbl">
              <table>
                <thead><tr><th>Link</th><th>Topic</th><th>Checked</th><th className="r">Action</th></tr></thead>
                <tbody>
                  {list.map((l) => (
                    <tr key={l.id} style={{ opacity: l.isActive ? 1 : 0.55 }}>
                      <td style={{ maxWidth: 460 }}><b>{l.title}</b><span className="sub"><a href={l.url} target="_blank" rel="noopener noreferrer" className="mono">{l.url.replace(/^https:\/\//, '')}</a> · {countryName(l.country)}</span>{l.warning ? <span className="sub">⚠ {l.warning}</span> : null}</td>
                      <td>{TOPIC[l.topic] ?? l.topic}</td>
                      <td>{!l.isActive ? <span className="chip">Retired</span> : <span className={`chip ${l.daysSinceCheck > 90 ? 'warn' : 'ok'}`}>{l.daysSinceCheck === 0 ? 'Today' : `${l.daysSinceCheck} days ago`}</span>}</td>
                      <td className="r">
                        <span className="row" style={{ justifyContent: 'flex-end' }}>
                          {l.isActive ? <Btn kind="sm" perm="content.edit" onClick={async () => { await api(`/admin/links/${l.id}`, { method: 'PATCH', body: { checked: true } }); toast('Marked as checked today'); links.reload(); refresh(); }}>I checked it</Btn> : null}
                          <Btn kind="sm ghost" perm="content.edit" onClick={() => setEdit(l)}>Edit</Btn>
                          {l.isActive ? <Btn kind="sm ghost" perm="content.edit" onClick={() => reason.ask({ title: `Retire “${l.title}”`, label: 'Why? For example: site closed, moved, or replaced.', cta: 'Retire', run: async (r) => { await api(`/admin/links/${l.id}`, { method: 'PATCH', body: { isActive: false, note: r } }); toast('Retired'); links.reload(); refresh(); } })}>Retire</Btn>
                            : <Btn kind="sm ghost" perm="content.edit" onClick={async () => { await api(`/admin/links/${l.id}`, { method: 'PATCH', body: { isActive: true, checked: true } }); links.reload(); }}>Restore</Btn>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <section className="grid g11">
        <Card title="Advisories" meta="Shown at the top of Travel smart">
          {can('advisories.publish') ? (
            <form className="pad stack" style={{ borderBottom: '1px solid var(--line2)' }} onSubmit={async (e) => {
              e.preventDefault();
              await api('/admin/advisories', { body: { countryCode: advCountry, message: msg } });
              setMsg('');
              toast('Advisory published');
              adv.reload();
            }}>
              <div className="row">
                <select className="in" style={{ width: 140 }} aria-label="Country" value={advCountry} disabled={!!me.staff.country} onChange={(e) => setAdvCountry(e.target.value)}>{['KE', 'TZ', 'UG', 'RW', 'ET'].map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</select>
              </div>
              <textarea className="in" aria-label="Advisory" placeholder="For example: Heavy rain has closed the Talek bridge. Drives from Talek gate are going via Sekenani." value={msg} onChange={(e) => setMsg(e.target.value)} />
              <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={msg.trim().length < 10}>Publish advisory</button>
            </form>
          ) : <div className="pad"><p className="footnote" style={{ margin: 0 }}>Country leads and Owners publish advisories.</p></div>}
          <div className="tbl">
            <table>
              <tbody>
                {(adv.data?.advisories ?? []).length === 0 ? <tr><td className="muted">No advisories.</td></tr> : adv.data!.advisories.map((a) => (
                  <tr key={a.id}>
                    <td>{a.message}<span className="sub">{countryName(a.country)}{a.city ? ` · ${a.city}` : ''} · {ago(a.startsAt)}</span></td>
                    <td className="r">{a.active ? <Btn kind="sm" perm="advisories.publish" onClick={async () => { await api(`/admin/advisories/${a.id}/end`, { body: {} }); toast('Advisory ended'); adv.reload(); }}>End now</Btn> : <span className="chip">Ended</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Add a team price check" meta="The “checked by Karibu” range on Fair prices">
          {can('content.edit') ? (
            <form className="pad stack" onSubmit={async (e) => {
              e.preventDefault();
              setPcErr(null);
              try {
                await api('/admin/price-checks', { body: { ...pc, low: Number(pc.low), high: Number(pc.high) } });
                setPc({ ...pc, item: '', low: '', high: '' });
                toast('Price check added');
              } catch (x) { setPcErr((x as Error).message); }
            }}>
              <div className="row">
                <select className="in" style={{ flex: 1 }} aria-label="City" value={pc.citySlug} onChange={(e) => setPc({ ...pc, citySlug: e.target.value })}>{cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
                <select className="in" style={{ flex: 1 }} aria-label="Kind" value={pc.group} onChange={(e) => setPc({ ...pc, group: e.target.value })}><option value="food">Food and drink</option><option value="transport">Transport</option><option value="other">Other</option></select>
              </div>
              <input className="in" aria-label="Item" placeholder="Boda ride, about 2 km" required value={pc.item} onChange={(e) => setPc({ ...pc, item: e.target.value })} />
              <div className="row">
                <input className="in" style={{ flex: 1 }} aria-label="Low" inputMode="numeric" placeholder="Low" required value={pc.low} onChange={(e) => setPc({ ...pc, low: e.target.value.replace(/\D/g, '') })} />
                <input className="in" style={{ flex: 1 }} aria-label="High" inputMode="numeric" placeholder="High" required value={pc.high} onChange={(e) => setPc({ ...pc, high: e.target.value.replace(/\D/g, '') })} />
                <input className="in" style={{ flex: 1 }} aria-label="Checked on" type="date" value={pc.checkedOn} onChange={(e) => setPc({ ...pc, checkedOn: e.target.value })} />
              </div>
              <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Add price check</button>
              {pcErr ? <p className="err">{pcErr}</p> : null}
            </form>
          ) : <div className="pad footnote">Content editors add price checks.</div>}
        </Card>
      </section>
      {edit !== undefined ? <LinkForm initial={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); toast('Saved and marked as checked'); links.reload(); refresh(); }} /> : null}
      {reason.node}
    </>
  );
}
