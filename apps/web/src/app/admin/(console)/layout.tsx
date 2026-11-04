'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ICON, Modal, StaffCtx, Svg, api, countryName, initials, type StaffMe } from '../ui';

type Section = { href: string; label: string; icon: string; perms: string[]; count?: string; hot?: string; group?: string };
const SECTIONS: Section[] = [
  { href: '/admin', label: 'Overview', icon: ICON.overview, perms: [], group: 'Work' },
  { href: '/admin/queue', label: 'Review queue', icon: ICON.queue, perms: ['queue.view'], count: 'queue' },
  { href: '/admin/approvals', label: 'Second approvals', icon: ICON.approvals, perms: ['level3.approve', 'suspension.confirm', 'level3.request', 'vendor.suspend', 'listing.suspend'], count: 'approvals' },
  { href: '/admin/visits', label: 'Field visits', icon: ICON.visits, perms: ['visits.view', 'visits.submit'], count: 'myVisits' },
  { href: '/admin/reports', label: 'Reports and safety', icon: ICON.reports, perms: ['reports.view'], count: 'reports', hot: 'overdueSafety', group: 'Trust' },
  { href: '/admin/experiences', label: 'Experiences', icon: ICON.experiences, perms: ['reviews.moderate'] },
  { href: '/admin/prices', label: 'Price reports', icon: ICON.prices, perms: ['prices.moderate'] },
  { href: '/admin/content', label: 'Official links', icon: ICON.content, perms: ['content.edit', 'advisories.publish'], count: 'staleLinks', group: 'Content' },
  { href: '/admin/insights', label: 'Insights', icon: ICON.insights, perms: ['insights.view', 'insights.export'], group: 'Analytics' },
  { href: '/admin/businesses', label: 'Businesses', icon: ICON.businesses, perms: ['businesses.view'], group: 'Growth' },
  { href: '/admin/billing', label: 'Plans and billing', icon: ICON.billing, perms: ['billing.view'] },
  { href: '/admin/team', label: 'Team and roles', icon: ICON.team, perms: ['staff.manage'], group: 'Admin' },
  { href: '/admin/audit', label: 'Audit log', icon: ICON.audit, perms: ['audit.view'] },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [me, setMe] = useState<StaffMe | null>(null);
  const [menu, setMenu] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [idleWarn, setIdleWarn] = useState(false);
  const lastActive = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = useCallback(() => {
    api<StaffMe & { staff: StaffMe['staff'] | null }>('/staff/me')
      .then((r) => {
        if (!r.staff) location.replace(`/admin/login?next=${encodeURIComponent(location.pathname)}`);
        else setMe(r);
      })
      .catch(() => location.replace('/admin/login'));
  }, []);
  useEffect(refresh, [path, refresh]);
  useEffect(() => setMenu(false), [path]);

  // The server ends a session after 30 minutes without activity. Warn two minutes before, so nobody loses work.
  useEffect(() => {
    if (!me) return;
    const mark = () => (lastActive.current = Date.now());
    const evs = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const limit = me.idleMinutes * 60e3;
    const t = setInterval(() => {
      const idle = Date.now() - lastActive.current;
      if (idle > limit) location.replace(`/admin/login?expired=1&next=${encodeURIComponent(location.pathname)}`);
      else setIdleWarn(idle > limit - 120e3);
    }, 15e3);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(t);
    };
  }, [me]);

  const toast = useCallback((t: string) => {
    setToastText(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 3000);
  }, []);

  if (!me) return <div className="login"><p className="muted">Loading the staff console…</p></div>;
  const s = me.staff;
  const can = (...p: string[]) => p.length === 0 || p.some((x) => s.perms.includes(x));
  const visible = SECTIONS.filter((x) => can(...x.perms));
  let lastGroup = '';

  async function signOut() {
    await api('/staff/auth/logout', { body: {} }).catch(() => {});
    location.replace('/admin/login');
  }
  async function endOthers() {
    const r = await api<{ ended: number }>('/staff/me/sessions/end-others', { body: {} });
    toast(r.ended ? `Signed out of ${r.ended} other session${r.ended === 1 ? '' : 's'}` : 'No other sessions were open');
    setMenu(false);
  }

  return (
    <StaffCtx.Provider value={{ me, can, refresh, toast }}>
      <header className="top">
        <Link className="mark" href="/admin"><img src="/brand/ei-logo.png" alt="" /><span>EI Karibu</span><span className="tag">Staff console</span></Link>
        <div className="spacer" />
        <span className="chip">{countryName(s.country)}</span>
        <a className="btn ghost sm" href="/" target="_blank" rel="noopener">View site ↗</a>
        <div className="acct">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <span className="av">{initials(s.displayName)}</span>
            <span className="who">{s.displayName}<small>{s.roleLabel}</small></span>
          </button>
          {menu ? (
            <div className="menu" role="menu">
              <div className="hd">
                <b>{s.displayName}</b>
                <div className="mono muted">{s.email}</div>
                <div className="footnote" style={{ marginTop: 4 }}>{s.roleLabel} · {countryName(s.country)}</div>
              </div>
              <Link href="/admin/security">Password and two-step check</Link>
              <button onClick={endOthers}>Sign out other devices</button>
              <button onClick={signOut}>Sign out</button>
            </div>
          ) : null}
        </div>
      </header>
      <div className="shell">
        <aside className="rail">
          <nav aria-label="Staff console">
            {visible.map((x) => {
              const g = x.group && x.group !== lastGroup ? <div className="group">{x.group}</div> : null;
              if (x.group) lastGroup = x.group;
              const n = x.count ? me.counts[x.count] : 0;
              const hot = x.hot ? me.counts[x.hot] > 0 : false;
              const active = x.href === '/admin' ? path === '/admin' : path.startsWith(x.href);
              return (
                <span key={x.href} style={{ display: 'contents' }}>
                  {g}
                  <Link href={x.href} aria-current={active ? 'page' : undefined}>
                    <Svg d={x.icon} />
                    {x.label}
                    {n ? <span className={`count ${hot ? 'hot' : ''}`}>{n}</span> : null}
                  </Link>
                </span>
              );
            })}
          </nav>
        </aside>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </div>
      {toastText ? <div className="toast" role="status">{toastText}</div> : null}
      {idleWarn ? (
        <Modal title="Are you still there?" onClose={() => { lastActive.current = Date.now(); setIdleWarn(false); refresh(); }}
          footer={<button className="btn primary" onClick={() => { lastActive.current = Date.now(); setIdleWarn(false); refresh(); }}>Stay signed in</button>}>
          <p style={{ margin: 0 }}>For safety, the staff console signs you out after {me.idleMinutes} minutes without activity. You’ll be signed out in about two minutes.</p>
        </Modal>
      ) : null}
    </StaffCtx.Provider>
  );
}
