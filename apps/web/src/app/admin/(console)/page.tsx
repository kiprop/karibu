'use client';

import Link from 'next/link';
import { Card, Delta, PERM_LABEL, PageHead, Stat, countryName, fmt, useLoad, useStaff } from '../ui';

type Overview = { counts: Record<string, number> };

export default function OverviewPage() {
  const { me, can } = useStaff();
  const { data } = useLoad<Overview>('/admin/overview');
  const c = me.counts;
  const o = data?.counts ?? {};
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // What needs this person, based on their role.
  const all: { tone: 'bad' | 'warn' | 'ok'; t: string; s: string; href: string; show: boolean }[] = [
    { tone: 'bad', t: `${c.overdueSafety} safety or scam report${c.overdueSafety === 1 ? ' is' : 's are'} past the 4-hour target`, s: 'Reports and safety', href: '/admin/reports', show: can('reports.act') && c.overdueSafety > 0 },
    { tone: 'warn', t: `${c.reports} open report${c.reports === 1 ? '' : 's'}`, s: 'Scams and safety first, then the rest within 2 days', href: '/admin/reports', show: can('reports.view') && c.reports > 0 && !c.overdueSafety },
    { tone: 'warn', t: `${c.approvals} decision${c.approvals === 1 ? '' : 's'} waiting for a second approval`, s: 'Level 3 badges and suspensions need someone other than the person who asked', href: '/admin/approvals', show: can('level3.approve', 'suspension.confirm') && c.approvals > 0 },
    { tone: (o.queueLate ? 'warn' : 'ok') as 'warn' | 'ok', t: `${c.queue} listing${c.queue === 1 ? '' : 's'} in the review queue`, s: o.queueLate ? `${o.queueLate} waiting more than 2 days (target)` : 'All within the 2-day target', href: '/admin/queue', show: can('queue.view') && c.queue > 0 },
    { tone: 'warn', t: `${c.myVisits} field visit${c.myVisits === 1 ? '' : 's'} booked for you`, s: 'Check in on site, then submit the report', href: '/admin/visits', show: c.myVisits > 0 },
    { tone: 'warn', t: `${c.staleLinks} official link${c.staleLinks === 1 ? '' : 's'} not checked in 90 days`, s: 'Look-alike sites copy these; re-check them', href: '/admin/content', show: can('content.edit') && c.staleLinks > 0 },
    { tone: 'ok', t: `${c.recommendations} business${c.recommendations === 1 ? '' : 'es'} recommended by travellers this month`, s: 'Invite them to join', href: '/admin/businesses', show: can('businesses.support') && c.recommendations > 0 },
    { tone: 'ok', t: `${c.newPrices} new price report${c.newPrices === 1 ? '' : 's'} this week`, s: 'Check outliers', href: '/admin/prices', show: can('prices.moderate') && c.newPrices > 0 },
    { tone: 'ok', t: `${c.newExperiences} new experience${c.newExperiences === 1 ? '' : 's'} this week`, s: 'Check for personal details and fakes', href: '/admin/experiences', show: can('reviews.moderate') && c.newExperiences > 0 },
  ];
  const todo = all.filter((x) => x.show);

  return (
    <>
      <PageHead crumb={`Overview · ${countryName(me.staff.country)}`} title={`${hello}, ${me.staff.displayName.split(' ')[0]}`}
        desc={<>Signed in as <b>{me.staff.roleLabel}</b>. You see only the sections and actions this role needs; everything you do is recorded in the audit log.</>} />
      {c.recoveryLeft !== null && c.recoveryLeft <= 2 ? (
        <div className="banner warn"><span>You have {c.recoveryLeft ?? 0} recovery code{c.recoveryLeft === 1 ? '' : 's'} left. <Link href="/admin/security">Make new ones</Link>.</span></div>
      ) : null}
      <section className="grid g4" aria-label="Key numbers">
        <Stat k="Enquiries this week" v={fmt(o.enquiries7)} d={<Delta now={o.enquiries7 ?? 0} prev={o.enquiriesPrev7 ?? 0} label="vs last week" />} />
        <Stat k="Live listings" v={fmt(o.live)} d={`${fmt(o.liveSettle)} in Settle in`} />
        <Stat k="Review queue" v={fmt(c.queue)} d={o.queueLate ? <span><span className="down">{o.queueLate}</span> over the 2-day target</span> : 'All within target'} />
        <Stat k="Overdue safety reports" v={fmt(c.overdueSafety)} d="Target: 4 hours for scams and safety" alert={c.overdueSafety > 0} />
      </section>
      <Card title="Needs you" meta={`${todo.length} item${todo.length === 1 ? '' : 's'} for your role`} className="todo">
        {todo.length ? (
          <ul>
            {todo.map((x) => (
              <li key={x.t}>
                <span className={`stripe ${x.tone}`} />
                <span><span className="t">{x.t}</span><span className="s">{x.s}</span></span>
                <Link className="btn" href={x.href}>Open</Link>
              </li>
            ))}
          </ul>
        ) : <div className="empty">Nothing waiting for you right now.</div>}
      </Card>
      <section className="grid g11">
        <Card title="Rules for this console" pad>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Sales and verification are always different people. Business support can’t approve or suspend, and plans never change verification.</li>
            <li>Visited (level 3) badges and suspending a verified business need a second person.</li>
            <li>Staff see only their country. Documents and contact details only where the role needs them.</li>
            <li>Every sign-in and decision records who, when and why. The log can’t be edited.</li>
          </ul>
        </Card>
        <Card title="Your role" meta={me.staff.roleLabel} pad>
          <p className="footnote" style={{ marginTop: 0 }}>What you can do in the console:</p>
          <div className="row">{me.staff.perms.map((p) => <span key={p} className="chip">{PERM_LABEL[p] ?? p}</span>)}</div>
        </Card>
      </section>
    </>
  );
}
