'use client';

import { useState } from 'react';
import { Bars, CATEGORY, Card, Delta, Empty, ErrorNote, Legend, LineChart, NoAccess, PageHead, Stat, countryName, fmt, useLoad, useStaff } from '../../ui';

type N = number;
type Insights = {
  days: N; country: string | null;
  headline: Record<string, N>;
  daily: { day: string; searches: N; enquiries: N; visitors: N }[];
  funnel: { enquiriesReviewed: N; views: N; searches: N; enquiries: N };
  cities: { city: string; n: N }[];
  categories: { category: string; n: N; settle: boolean }[];
  gaps: { query: string; key: string; city: string | null; searches: N; avgResults: N; maxResults: N; mode: string | null; people: N }[];
  heat: { dow: N; slot: N; n: N }[];
  trust: {
    decisionHours: N | null; safetyReports: N; safetyOnTime: N; live: N; liveConfirmed: N; links: N; linksFresh: N;
    reportsWeekly: { week: string; category: string; n: N }[]; weeks: string[];
    pipeline: Record<string, N>; team: { name: string; role: string; actions: N; decisions: N; safetyActions: N; visits: N }[];
  };
  prices: {
    premium: { city: string; item: string; currency: string; checked: N; paid: N; reports: N; premium: N; ripoffPct: N }[];
    areas: { place: string; reports: N; ripoffPct: N }[];
    trend: { month: string; group: string; premium: N; n: N }[];
  };
  businesses: { active: N; newBusinesses: N; paid: N; total: N; live: N; levels: { level: N; listings: N; medianEnquiries: N }[]; growth: { month: string; listings: N; businesses: N }[]; top: { name: string; level: N; plan: string; enquiries: N; rating: N | null; recommendPct: N | null }[] };
  audience: { settle: N; visit: N; settleSearches: N; visitSearches: N; searchedCities: { city: string; n: N }[] | null; signedInEnquiries: N; types: { type: string; n: N; rating: N; topCategory: string }[] };
};
const TABS = [['demand', 'Demand'], ['trust', 'Trust health'], ['prices', 'Fair prices'], ['business', 'Businesses'], ['audience', 'Audience']] as const;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT = ['00–03', '03–06', '06–09', '09–12', '12–15', '15–18', '18–21', '21–24'];
const TYPE: Record<string, string> = { solo: 'Solo', couple: 'Couple', family: 'Family', friends: 'Friends', business: 'Business trip', long_stay: 'Long stay or remote work', moving_home: 'Moving home' };
const GROUP_COLOR: Record<string, string> = { transport: 'var(--s2)', food: 'var(--s1)', drink: 'var(--s3)', shopping: 'var(--s4)', activity: '#C49A00', stay: '#2A9D8F' };
const pct = (a: N, b: N) => (b ? Math.round((a / b) * 100) : 0);
const label = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const month = (m: string) => new Date(`${m}-01`).toLocaleDateString('en-GB', { month: 'short' });
const cityName = (slug: string | null) => (slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Anywhere');

function Meter({ k, v, target, value, good, note }: { k: string; v: string; target: string; value: N; good: boolean; note: string }) {
  return (
    <div className="card stat">
      <span className="k">{k}</span>
      <span className="v" style={{ color: good ? undefined : 'var(--bad)' }}>{v}</span>
      <span className="d">Target {target}</span>
      <div className="meter"><i style={{ width: `${Math.min(100, Math.max(2, value))}%`, background: good ? 'var(--ok)' : 'var(--bad)' }} /></div>
      <span className="d" style={{ marginTop: 6 }}>{note}</span>
    </div>
  );
}

function Demand({ d }: { d: Insights }) {
  const f = d.funnel;
  const steps = [['Searched', f.searches], ['Opened a listing', f.views], ['Messaged a business', f.enquiries], ['Shared an experience', f.enquiriesReviewed]] as const;
  const top = Math.max(1, ...steps.map((s) => s[1]));
  const heatMax = Math.max(1, ...d.heat.map((h) => h.n));
  const cell = (dow: N, slot: N) => d.heat.find((h) => h.dow === dow && h.slot === slot)?.n ?? 0;
  return (
    <>
      <Card title="Searches, visitors and enquiries" meta={<Legend items={[['Visitors', 'var(--s1)'], ['Searches', 'var(--s4)'], ['Enquiries', 'var(--s2)']]} />} pad>
        <LineChart labels={d.daily.map((x) => label(x.day))} series={[
          { name: 'Visitors', color: 'var(--s1)', values: d.daily.map((x) => x.visitors) },
          { name: 'Searches', color: 'var(--s4)', values: d.daily.map((x) => x.searches), fill: false },
          { name: 'Enquiries', color: 'var(--s2)', values: d.daily.map((x) => x.enquiries), fill: false },
        ]} />
        <p className="footnote" style={{ margin: '6px 0 0' }}>Visitors are distinct devices that searched or messaged a business. Nothing here identifies a person.</p>
      </Card>
      <section className="grid g11">
        <Card title="From search to experience" meta={`${d.days} days`} pad>
          <div className="funnel">
            {steps.map(([k, v], i) => (
              <div key={k}>
                <div className="fstep"><span>{k}</span><span className="fbar"><i style={{ width: `${Math.max(1, (v / top) * 100)}%` }} /></span><span className="num" style={{ textAlign: 'right' }}>{fmt(v)}</span></div>
                {i < steps.length - 1 && v > 0 && steps[i + 1][1] <= v ? <div className="conv">↓ {pct(steps[i + 1][1], v)}% continue</div> : null}
              </div>
            ))}
          </div>
          <p className="footnote" style={{ margin: '10px 0 0' }}>{pct(f.enquiriesReviewed, f.enquiries)}% of enquiries come back as a shared experience. Listing views can be higher than searches because many people arrive from shared links.</p>
        </Card>
        <Card title="Top destinations" meta="by enquiries" pad>
          <Bars rows={d.cities.map((c) => ({ label: c.city, value: c.n }))} />
        </Card>
      </section>
      <Card title="Demand gaps: searches with two or fewer verified results" meta="Where to recruit businesses next">
        {d.gaps.length === 0 ? <Empty>No gaps in this period. Every common search found verified results.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>What people searched</th><th>Where</th><th className="r">Searches</th><th className="r">People</th><th className="r">Results found</th><th>Mode</th></tr></thead>
              <tbody>
                {d.gaps.map((g) => (
                  <tr key={`${g.key}-${g.city}`}>
                    <td><b>{g.query}</b></td>
                    <td>{cityName(g.city)}</td>
                    <td className="r num">{fmt(g.searches)}</td>
                    <td className="r num">{fmt(g.people)}</td>
                    <td className="r">{g.maxResults === 0 ? <span className="chip bad">0</span> : <span className="num">{g.maxResults}</span>}</td>
                    <td>{g.mode ? <span className={`chip ${g.mode === 'settle' ? 'blue' : ''}`}>{g.mode === 'settle' ? 'Settle in' : 'Visiting'}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <section className="grid g11">
        <Card title="Enquiries by category" meta={<Legend items={[['Visiting', 'var(--s1)'], ['Settle in', 'var(--s2)']]} />} pad>
          <Bars rows={d.categories.map((c) => ({ label: CATEGORY[c.category] ?? c.category, value: c.n, color: c.settle ? 'var(--s2)' : 'var(--s1)' }))} />
        </Card>
        <Card title="When people message businesses" meta="East Africa time" pad>
          <div className="heat" aria-label="Enquiries by day and time">
            <span />
            {DOW.map((x) => <b key={x} style={{ fontWeight: 500, textAlign: 'center' }}>{x}</b>)}
            {SLOT.map((t, s) => (
              <span key={t} style={{ display: 'contents' }}>
                <b style={{ fontWeight: 500 }}>{t}</b>
                {DOW.map((x, i) => {
                  const n = cell(i + 1, s);
                  return <span key={x} className="c" title={`${x} ${t}: ${n}`} style={{ background: `color-mix(in srgb, var(--s1) ${Math.round((n / heatMax) * 90) + (n ? 10 : 0)}%, var(--soft))` }} />;
                })}
              </span>
            ))}
          </div>
          <p className="footnote" style={{ margin: '10px 0 0' }}>Share the busiest times with businesses: a fast reply then wins the booking.</p>
        </Card>
      </section>
    </>
  );
}

function Trust({ d }: { d: Insights }) {
  const t = d.trust;
  const cats = ['scam', 'safety', 'overcharged', 'wrong_info', 'other'];
  const colors: Record<string, string> = { scam: 'var(--s2)', safety: 'var(--bad)', overcharged: 'var(--s4)', wrong_info: 'var(--s1)', other: 'var(--faint)' };
  const names: Record<string, string> = { scam: 'Scam', safety: 'Safety', overcharged: 'Overcharged', wrong_info: 'Wrong info', other: 'Other' };
  const present = cats.filter((c) => t.reportsWeekly.some((r) => r.category === c));
  const p = t.pipeline;
  return (
    <>
      <section className="grid g4">
        <Meter k="Verification decision time" v={t.decisionHours === null ? '—' : t.decisionHours < 48 ? `${t.decisionHours} h` : `${(t.decisionHours / 24).toFixed(1)} d`} target="2 days" value={t.decisionHours === null ? 0 : Math.min(100, (t.decisionHours / 48) * 100)} good={t.decisionHours === null || t.decisionHours <= 48} note="Median, from submitted to decided" />
        <Meter k="Safety reports on time" v={t.safetyReports ? `${pct(t.safetyOnTime, t.safetyReports)}%` : '—'} target="95%" value={pct(t.safetyOnTime, t.safetyReports)} good={!t.safetyReports || pct(t.safetyOnTime, t.safetyReports) >= 95} note={`${t.safetyReports} scam and safety reports, closed within 4 h`} />
        <Meter k="Listings confirmed in 30 days" v={`${pct(t.liveConfirmed, t.live)}%`} target="85%" value={pct(t.liveConfirmed, t.live)} good={pct(t.liveConfirmed, t.live) >= 85} note="Businesses saying “still accurate”" />
        <Meter k="Official links checked" v={`${pct(t.linksFresh, t.links)}%`} target="100%" value={pct(t.linksFresh, t.links)} good={t.linksFresh === t.links} note={`${t.links - t.linksFresh} of ${t.links} older than 90 days`} />
      </section>
      <section className="grid g11">
        <Card title="Reports received, by type" meta={<Legend items={present.map((c) => [names[c], colors[c]])} />} pad>
          {present.length ? (
            <LineChart area={false} height={180} labels={t.weeks.map(label)} series={present.map((c) => ({
              name: names[c], color: colors[c], values: t.weeks.map((w) => t.reportsWeekly.find((r) => r.week === w && r.category === c)?.n ?? 0),
            }))} />
          ) : <p className="footnote">No reports in the last 12 weeks.</p>}
        </Card>
        <Card title="Verification pipeline" meta="now">
          <div className="tbl">
            <table>
              <tbody>
                <tr><td>Waiting for the business to make changes</td><td className="r num">{p.waitingOnBusiness}</td></tr>
                <tr><td>In the review queue</td><td className="r num">{p.inQueue}</td></tr>
                <tr><td>Field visits booked</td><td className="r num">{p.visitsBooked}</td></tr>
                <tr><td>Waiting for a second approval</td><td className="r num">{p.awaitingApproval}</td></tr>
                <tr><td>Re-verification due in 30 days</td><td className="r num">{p.reverifySoon}</td></tr>
                <tr><td>Rejected in the last 90 days</td><td className="r num">{p.rejected90}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>
      <Card title="Team workload" meta={`${d.days} days, from the audit log`}>
        {t.team.length === 0 ? <Empty>No staff decisions in this period.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Person</th><th>Role</th><th className="r">Verification decisions</th><th className="r">Safety actions</th><th className="r">Visit reports</th><th className="r">All actions</th></tr></thead>
              <tbody>{t.team.map((m) => <tr key={m.name}><td>{m.name}</td><td>{m.role.replace(/_/g, ' ')}</td><td className="r num">{m.decisions}</td><td className="r num">{m.safetyActions}</td><td className="r num">{m.visits}</td><td className="r num">{m.actions}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Prices({ d }: { d: Insights }) {
  const p = d.prices;
  const groups = [...new Set(p.trend.map((r) => r.group))];
  const months = [...new Set(p.trend.map((r) => r.month))];
  return (
    <>
      <Card title="Visitor premium over time" meta={groups.length ? <Legend items={groups.map((g) => [g[0].toUpperCase() + g.slice(1), GROUP_COLOR[g] ?? 'var(--faint)'])} /> : 'How much more travellers pay than the team-checked price'} pad>
        {months.length >= 2 ? (
          <LineChart area={false} height={180} labels={months.map(month)} yfmt={(v) => `${Math.round(v)}%`}
            series={groups.map((g) => ({ name: g, color: GROUP_COLOR[g] ?? 'var(--faint)', values: months.map((m) => p.trend.find((r) => r.month === m && r.group === g)?.premium ?? 0) }))} />
        ) : <p className="footnote" style={{ margin: 0 }}>Needs at least two months of “I paid this much” reports for items the team has also checked.</p>}
        <p className="footnote" style={{ margin: '6px 0 0' }}>Median of what travellers paid compared with the middle of the checked range. Falling lines mean visitors arrive knowing the going rate.</p>
      </Card>
      <section className="grid g11">
        <Card title="Fair price index" meta="Checked price against what travellers paid">
          {p.premium.length === 0 ? <Empty>No items with both a team check and traveller reports yet.</Empty> : (
            <div className="tbl">
              <table>
                <thead><tr><th>Item</th><th className="r">Checked</th><th className="r">Paid (median)</th><th className="r">Premium</th><th className="r">Reports</th></tr></thead>
                <tbody>
                  {p.premium.map((r) => (
                    <tr key={`${r.city}-${r.item}`}>
                      <td>{r.item}<span className="sub">{r.city}</span></td>
                      <td className="r num">{r.currency} {fmt(r.checked)}</td>
                      <td className="r num">{r.currency} {fmt(r.paid)}</td>
                      <td className="r"><span className={`chip ${r.premium >= 30 ? 'bad' : r.premium >= 15 ? 'warn' : 'ok'}`}>{r.premium > 0 ? '+' : ''}{r.premium}%</span></td>
                      <td className="r num">{r.reports}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Where overcharging is reported" meta="Share of reports marked “I was overcharged”" pad>
          <Bars rows={p.areas.map((a) => ({ label: a.place, value: a.ripoffPct, color: 'var(--s2)' }))} fmtV={(v) => `${v}%`} />
          <p className="footnote" style={{ margin: '10px 0 0' }}>Places with at least 3 reports. Feeds the tips in Travel smart; the quarterly index can be shared with tourism regulators and county offices.</p>
        </Card>
      </section>
    </>
  );
}

function Businesses({ d }: { d: Insights }) {
  const b = d.businesses;
  const LV = ['Not verified', 'Contact verified (L1)', 'Licensed (L2)', 'Visited (L3)'];
  return (
    <>
      <section className="grid g4">
        <Stat k="Active businesses" v={fmt(b.active)} d={<><span className="up">+{b.newBusinesses}</span> joined in {d.days} days</>} />
        <Stat k="Enquiries per live listing" v={b.live ? (d.headline.enquiries / b.live).toFixed(1) : '—'} d={`in ${d.days} days`} />
        <Stat k="On a paid plan" v={`${pct(b.paid, b.total)}%`} d={`${b.paid} of ${b.total} businesses`} />
        <Stat k="Live listings" v={fmt(b.live)} />
      </section>
      <section className="grid g11">
        <Card title="Listings and businesses over time" meta={<Legend items={[['Live listings', 'var(--s1)'], ['Businesses', 'var(--s3)']]} />} pad>
          <LineChart height={170} labels={b.growth.map((g) => month(g.month))} series={[{ name: 'Live listings', color: 'var(--s1)', values: b.growth.map((g) => g.listings) }, { name: 'Businesses', color: 'var(--s3)', values: b.growth.map((g) => g.businesses), fill: false }]} />
        </Card>
        <Card title="Does verification bring more enquiries?" meta={`Median per live listing, ${d.days} days`} pad>
          <Bars rows={b.levels.map((l) => ({ label: LV[l.level] ?? `L${l.level}`, value: Number(l.medianEnquiries) }))} fmtV={(v) => v.toFixed(1)} />
          <p className="footnote" style={{ margin: '10px 0 0' }}>The pitch to businesses: verification is free, and each level should bring more enquiries.</p>
        </Card>
      </section>
      <Card title="Top businesses by enquiries" meta={`${d.days} days`}>
        {b.top.length === 0 ? <Empty>No enquiries in this period.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Business</th><th>Level</th><th>Plan</th><th className="r">Enquiries</th><th className="r">Rating</th><th className="r">Recommend</th></tr></thead>
              <tbody>{b.top.map((t) => <tr key={t.name}><td><b>{t.name}</b></td><td><span className="lvl">L{t.level}</span></td><td style={{ textTransform: 'capitalize' }}>{t.plan}</td><td className="r num">{fmt(t.enquiries)}</td><td className="r num">{t.rating ?? '—'}</td><td className="r num">{t.recommendPct === null ? '—' : `${t.recommendPct}%`}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Audience({ d }: { d: Insights }) {
  const a = d.audience;
  const totalEnq = a.settle + a.visit;
  const totalSearch = a.settleSearches + a.visitSearches;
  return (
    <>
      <section className="grid g3">
        <Card title="Why people come" meta="by enquiries" pad>
          <Bars rows={[{ label: 'Visiting', value: pct(a.visit, totalEnq) }, { label: 'Staying long or moving home', value: pct(a.settle, totalEnq), color: 'var(--s2)' }]} fmtV={(v) => `${v}%`} />
          <p className="footnote" style={{ margin: '10px 0 0' }}>Searches: {pct(a.settleSearches, totalSearch)}% in Settle in mode.</p>
        </Card>
        <Card title="Most searched places" pad>
          <Bars rows={(a.searchedCities ?? []).map((c) => ({ label: cityName(c.city), value: c.n, color: 'var(--s4)' }))} />
        </Card>
        <Card title="Signed in when they enquire" pad>
          <Bars rows={[{ label: 'Signed in', value: pct(a.signedInEnquiries, d.headline.enquiries) }, { label: 'Guest', value: 100 - pct(a.signedInEnquiries, d.headline.enquiries), color: 'var(--faint)' }]} fmtV={(v) => `${v}%`} />
          <p className="footnote" style={{ margin: '10px 0 0' }}>Guests can do almost everything; accounts add saved places, trips and reviews.</p>
        </Card>
      </section>
      <Card title="Who went, from shared experiences" meta="all time">
        {a.types.length === 0 ? <Empty>No experiences with a traveller type yet.</Empty> : (
          <div className="tbl">
            <table>
              <thead><tr><th>Traveller type</th><th className="r">Share</th><th className="r">Average rating</th><th>Most reviewed</th></tr></thead>
              <tbody>{a.types.map((t) => <tr key={t.type}><td>{TYPE[t.type] ?? t.type}</td><td className="r num">{pct(t.n, a.types.reduce((s, x) => s + x.n, 0))}%</td><td className="r num">{t.rating}</td><td>{CATEGORY[t.topCategory] ?? t.topCategory}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="footnote">Karibu doesn’t record where visitors live or which device they use. Add privacy-friendly analytics before reporting those.</p>
    </>
  );
}

export default function InsightsPage() {
  const { can } = useStaff();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('demand');
  const allowed = can('insights.view', 'insights.export');
  const { data: d, err } = useLoad<Insights>(allowed ? `/admin/insights?days=${days}` : null);
  if (!allowed) return <NoAccess />;
  const h = d?.headline;
  const exp = (table: string) => `/api/admin/insights/export?days=${days}&table=${table}`;
  return (
    <>
      <PageHead crumb={`Analytics · ${countryName(d?.country ?? null)}`} title="Insights"
        desc="What travellers search for, contact, pay and report, and how well the team keeps Karibu trustworthy. Counts and medians only; no personal details."
        actions={<>
          <div className="seg" role="group" aria-label="Date range">{[7, 30, 90, 365].map((n) => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)}>{n === 365 ? '1 year' : `${n} days`}</button>)}</div>
          {can('insights.export') ? (
            <details style={{ position: 'relative' }}>
              <summary className="btn" style={{ listStyle: 'none' }}>Export CSV ▾</summary>
              <div className="menu" style={{ top: 36 }}>
                <a href={exp('daily')}>Daily searches and enquiries</a>
                <a href={exp('gaps')}>Demand gaps</a>
                <a href={exp('prices')}>Fair price index</a>
                <a href={exp('businesses')}>Top businesses</a>
              </div>
            </details>
          ) : null}
        </>} />
      <ErrorNote err={err} />
      {!d || !h ? <Empty>Loading…</Empty> : (
        <>
          <section className="grid g6" aria-label="Headline numbers">
            <Stat k="Visitors" v={fmt(h.visitors)} d={<Delta now={h.visitors} prev={h.visitorsPrev} label={`vs previous ${days} d`} />} />
            <Stat k="Searches" v={fmt(h.searches)} d={<Delta now={h.searches} prev={h.searchesPrev} label={`vs previous ${days} d`} />} />
            <Stat k="Enquiries" v={fmt(h.enquiries)} d={<Delta now={h.enquiries} prev={h.enquiriesPrev} label={`vs previous ${days} d`} />} />
            <Stat k="Enquiry rate" v={h.visitors ? `${((h.enquiries / h.visitors) * 100).toFixed(1)}%` : '—'} d="enquiries per visitor" />
            <Stat k="Experiences shared" v={fmt(h.experiences)} d={<Delta now={h.experiences} prev={h.experiencesPrev} label={`vs previous ${days} d`} />} />
            <Stat k="Price reports" v={fmt(h.prices)} d={<Delta now={h.prices} prev={h.pricesPrev} label={`vs previous ${days} d`} />} />
          </section>
          <div className="tabs" role="tablist">{TABS.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}</div>
          {tab === 'demand' ? <Demand d={d} /> : tab === 'trust' ? <Trust d={d} /> : tab === 'prices' ? <Prices d={d} /> : tab === 'business' ? <Businesses d={d} /> : <Audience d={d} />}
        </>
      )}
    </>
  );
}
