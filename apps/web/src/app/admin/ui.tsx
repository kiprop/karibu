'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------------- API ----------------
export class StaffApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Calls the API through the same-origin /api proxy. A lost staff session sends the person back to sign in. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.code === 'staff_unauthenticated' && typeof window !== 'undefined' && !location.pathname.startsWith('/admin/login')) {
    location.replace(`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}&expired=1`);
  }
  if (!res.ok) throw new StaffApiError(res.status, json.error ?? `Request failed (${res.status})`, json.code);
  return json as T;
}

export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setErr(null);
    api<T>(path).then((d) => live && setData(d)).catch((e) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [path, tick]);
  return { data, err, reload: useCallback(() => setTick((t) => t + 1), []) };
}

// ---------------- Who is signed in ----------------
export type Perm = string;
export interface StaffMe {
  staff: { id: string; email: string; displayName: string; role: string; roleLabel: string; country: string | null; perms: Perm[] };
  counts: Record<string, number>;
  idleMinutes: number;
}
type Ctx = { me: StaffMe; can: (...p: Perm[]) => boolean; refresh: () => void; toast: (t: string) => void };
export const StaffCtx = createContext<Ctx | null>(null);
export function useStaff() {
  const c = useContext(StaffCtx);
  if (!c) throw new Error('useStaff must be used inside the staff console');
  return c;
}

// ---------------- Formatting ----------------
export const fmt = (n: number | string | null | undefined) => (n === null || n === undefined || n === '' ? '—' : Math.round(Number(n)).toLocaleString('en-US'));
export const COUNTRY: Record<string, string> = { KE: 'Kenya', TZ: 'Tanzania', UG: 'Uganda', RW: 'Rwanda', ET: 'Ethiopia' };
export const countryName = (c: string | null | undefined) => (c ? COUNTRY[c.trim()] ?? c : 'All countries');
export function ago(d: string | null | undefined) {
  if (!d) return '—';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.round(f / 60)} min`;
    if (f < 86400) return `in ${Math.round(f / 3600)} h`;
    return `in ${Math.round(f / 86400)} d`;
  }
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 2) return 'yesterday';
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const when = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export function waited(d: string | null | undefined) {
  if (!d) return { text: '—', late: false };
  const h = (Date.now() - new Date(d).getTime()) / 3600e3;
  return { text: h < 24 ? `${Math.max(1, Math.round(h))} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`, late: h > 48 };
}
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const CATEGORY: Record<string, string> = {
  stay: 'Stay', safari: 'Game drive', transport: 'Transport', guide: 'Guide', experience: 'Experience', event: 'Event',
  home: 'Long-stay home', furniture: 'Furniture and home', home_services: 'Home service', utilities: 'Internet and utilities', grooming: 'Hair and grooming',
};

// ---------------- Icons ----------------
export const ICON: Record<string, string> = {
  overview: 'M3 11l9-7 9 7M5 9.5V20h14V9.5',
  queue: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
  approvals: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  visits: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  reports: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  experiences: 'M12 2.5l2.9 6.2 6.6.6-5 4.5 1.5 6.6L12 17l-6 3.4 1.5-6.6-5-4.5 6.6-.6z',
  prices: 'M3 12V4h8l10 10-8 8zM7.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  content: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  businesses: 'M3 8h18v12H3zM8 8V5h8v3',
  billing: 'M3 6h18v12H3zM3 10h18',
  team: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 20c1-3.5 3.5-5 6-5s5 1.5 6 5M16 6a3 3 0 1 1 0 6M18 15c2 .6 3.5 2.2 4 5',
  audit: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};
export function Svg({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ---------------- Building blocks ----------------
export function PageHead({ crumb, title, desc, actions }: { crumb?: string; title: string; desc?: React.ReactNode; actions?: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Karibu staff`;
  }, [title]);
  return (
    <div className="hello">
      <div>
        {crumb ? <div className="crumb">{crumb}</div> : null}
        <h1>{title}</h1>
        {desc ? <p>{desc}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, meta, children, pad = false, className = '' }: { title?: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="ch">
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
      ) : null}
      {pad ? <div className="pad">{children}</div> : children}
    </section>
  );
}

export function Stat({ k, v, d, alert = false }: { k: string; v: React.ReactNode; d?: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`card stat ${alert ? 'alert' : ''}`}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {d ? <span className="d">{d}</span> : null}
    </div>
  );
}

export function Delta({ now, prev, label }: { now: number; prev: number; label: string }) {
  if (!prev && !now) return <span>No activity yet</span>;
  if (!prev) return <span><span className="up">new</span> {label}</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  return <span><span className={pct >= 0 ? 'up' : 'down'}>{pct >= 0 ? '↑' : '↓'} {Math.abs(pct)}%</span> {label}</span>;
}

/** A button that only works for roles with the permission. Others see it locked, so they know the action exists and who does it. */
export function Btn({ perm, why, kind = '', onClick, children, disabled, type = 'button', title }: {
  perm?: Perm | Perm[]; why?: string; kind?: string; onClick?: () => void | Promise<void>; children: React.ReactNode; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  const { can } = useStaff();
  const [busy, setBusy] = useState(false);
  const allowed = !perm || can(...(Array.isArray(perm) ? perm : [perm]));
  if (!allowed) {
    return (
      <button type="button" className={`btn ${kind}`} disabled title={why ?? 'Your role can’t do this'}>
        <Svg d={ICON.lock} size={13} />
        {children}
      </button>
    );
  }
  return (
    <button type={type} title={title} className={`btn ${kind}`} disabled={disabled || busy}
      onClick={onClick ? async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } } : undefined}>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorNote({ err }: { err: string | null }) {
  return err ? <div className="banner bad" role="alert"><Svg d={ICON.reports} /><span>{err}</span></div> : null;
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="ch"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="pad stack">{children}</div>
        {footer ? <div className="ft">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Asks for a reason before doing something that changes what travellers or businesses see. */
export function useReason() {
  const [state, setState] = useState<{ title: string; label: string; cta: string; min: number; run: (r: string) => Promise<void> } | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const ask = (o: { title: string; label?: string; cta?: string; min?: number; run: (r: string) => Promise<void> }) => {
    setText('');
    setErr(null);
    setState({ label: 'Reason (recorded in the audit log)', cta: 'Confirm', min: 5, ...o });
  };
  const node = state ? (
    <Modal title={state.title} onClose={() => setState(null)} footer={
      <>
        <button className="btn" onClick={() => setState(null)}>Cancel</button>
        <button className="btn primary" disabled={text.trim().length < state.min} onClick={async () => {
          try { await state.run(text.trim()); setState(null); } catch (e) { setErr((e as Error).message); }
        }}>{state.cta}</button>
      </>
    }>
      <label className="f" htmlFor="reason">{state.label}</label>
      <textarea id="reason" className="in" value={text} onChange={(e) => setText(e.target.value)} />
      {err ? <p className="err">{err}</p> : null}
    </Modal>
  ) : null;
  return { ask, node };
}

export function Legend({ items }: { items: [string, string][] }) {
  return <div className="legend">{items.map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</div>;
}

export function Bars({ rows, color = 'var(--s1)', fmtV = fmt }: { rows: { label: React.ReactNode; value: number; color?: string; key?: string }[]; color?: string; fmtV?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="footnote">No data yet for this period.</p>;
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div className="bar" key={r.key ?? i}>
          <span>{r.label}</span>
          <span className="track"><i style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} /></span>
          <span className="num" style={{ textAlign: 'right' }}>{fmtV(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Simple, crisp SVG line chart (no library). Labels stay readable because the canvas is wide. */
export function LineChart({ labels, series, height = 200, yfmt = (v: number) => fmt(v), area = true }: {
  labels: string[]; series: { name: string; color: string; values: number[]; fill?: boolean }[]; height?: number; yfmt?: (v: number) => string; area?: boolean;
}) {
  const W = 1000, H = Math.round(height * 1.4), L = 52, R = 12, T = 12, B = 28;
  const n = labels.length;
  if (n < 2) return <p className="footnote">Not enough data yet.</p>;
  const all = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...all);
  const max = Math.max(1, ...all) * 1.1;
  const x = (i: number) => L + i * ((W - L - R) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (max - lo));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (max - lo));
  const step = Math.ceil(n / 7);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(', ')}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line className="gl" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end">{yfmt(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % step === 0 || i === n - 1 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{l}</text> : null))}
      {series.map((s) => {
        const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        return (
          <g key={s.name}>
            {area && s.fill !== false ? <path d={`${d} L${x(n - 1)} ${y(lo)} L${x(0)} ${y(lo)}Z`} fill={s.color} opacity={0.08} /> : null}
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r={3.5} fill={s.color} />
          </g>
        );
      })}
    </svg>
  );
}

export function LockedNote({ children }: { children: React.ReactNode }) {
  return <div className="banner lock"><Svg d={ICON.lock} /><span>{children}</span></div>;
}

export function NoAccess() {
  return (
    <div className="wrap">
      <PageHead title="Not part of your role" desc="This section belongs to another role. If you need it, ask an Owner to change your role." />
      <Link className="btn" href="/admin">Back to overview</Link>
    </div>
  );
}

export const PERM_LABEL: Record<string, string> = {
  'queue.view': 'See review queue', 'queue.decide': 'Approve levels 1 and 2', 'level3.request': 'Request level 3', 'level3.approve': 'Give second approval',
  'visits.view': 'See field visits', 'visits.assign': 'Book field visits', 'visits.submit': 'Submit visit reports', 'reports.view': 'See reports', 'reports.act': 'Act on reports',
  'listing.suspend': 'Suspend listings', 'vendor.suspend': 'Suspend businesses', 'suspension.confirm': 'Confirm or reverse suspensions', 'reviews.moderate': 'Moderate experiences',
  'prices.moderate': 'Moderate prices', 'content.edit': 'Edit official links and price checks', 'advisories.publish': 'Publish advisories', 'businesses.view': 'See businesses',
  'businesses.support': 'Onboard businesses', 'billing.view': 'See billing', 'billing.manage': 'Change plans', 'insights.view': 'See insights', 'insights.export': 'Export insights',
  'staff.manage': 'Manage staff', 'audit.view': 'See audit log',
};
