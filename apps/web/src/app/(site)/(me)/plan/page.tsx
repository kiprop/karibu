'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { call } from '@/lib/client-api';
import { loadProfile, localChecklist, profileQuery, saveProfile, setLocalStep, type Profile } from '@/lib/companion';
import { useSession } from '@/components/Session';
import { AreaHead, Panel } from '@/components/RailShell';
import { Icon } from '@/components/Icon';

type Step = { key: string; group: string; title: string; why: string; action?: { label: string; href: string; external?: boolean }; done: boolean };

/** The full checklist: "Before you go and when you land" for visitors, "Your first month" for people moving home. */
export default function PlanPage() {
  const { me } = useSession();
  const signedIn = !!me.user;
  const [p, setP] = useState<Profile | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [title, setTitle] = useState('');

  const load = useCallback(async (prof: Profile) => {
    const r = await call<{ checklist: { title: string; steps: Step[] } }>(`/companion?${signedIn ? '' : profileQuery(prof)}`);
    const local = new Set(localChecklist());
    setSteps(signedIn ? r.checklist.steps : r.checklist.steps.map((s) => ({ ...s, done: local.has(s.key) })));
    setTitle(r.checklist.title);
  }, [signedIn]);
  useEffect(() => {
    loadProfile(signedIn).then((prof) => { setP(prof); load(prof); });
  }, [signedIn, load]);

  async function toggle(s: Step) {
    const done = !s.done;
    setSteps((x) => x && x.map((y) => (y.key === s.key ? { ...y, done } : y)));
    setLocalStep(s.key, done);
    if (signedIn) await call(`/me/checklist/${encodeURIComponent(s.key)}`, { method: 'PUT', body: { done } }).catch(() => {});
  }
  async function switchMode(mode: 'visit' | 'settle') {
    const np = { ...(p ?? {}), mode };
    await saveProfile(signedIn, np);
    setP(np);
    setSteps(null);
    load(np);
  }

  const groups = steps ? [...new Set(steps.map((s) => s.group))] : [];
  const done = steps?.filter((s) => s.done).length ?? 0;
  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6">
      <AreaHead crumb="Companion" title={title || 'Your plan'}
        desc={p?.mode === 'settle' ? 'A first month back home or in a new city, week by week. Each step links to verified businesses or the official source.' : 'Everything to sort before you fly and in your first hours. Rules link to the official source, never to a copy.'}
        actions={
          <div className="inline-flex rounded-lg bg-soft p-1 text-[13px] font-semibold">
            {([['visit', 'Visiting'], ['settle', 'Moving home']] as const).map(([m, t]) => (
              <button key={m} onClick={() => switchMode(m)} aria-pressed={(p?.mode ?? 'visit') === m} className={`rounded-md px-3 py-1.5 ${(p?.mode ?? 'visit') === m ? 'bg-panel shadow-sm' : 'text-muted'}`}>{t}</button>
            ))}
          </div>
        } />
      {steps ? (
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          <span className="text-[13px] font-semibold tabular-nums">{done} of {steps.length}</span>
        </div>
      ) : null}
      {!signedIn ? <p className="text-[13px] text-muted">Your ticks are saved on this device. <Link href="/signin?next=/plan" className="font-semibold text-brand">Sign in</Link> to keep them on every device.</p> : null}
      {!steps ? <div className="h-64 animate-pulse rounded-xl bg-soft" /> : groups.map((g) => (
        <Panel key={g} title={g} meta={`${steps.filter((s) => s.group === g && s.done).length} of ${steps.filter((s) => s.group === g).length}`} pad={false}>
          <ul className="divide-y divide-line/70">
            {steps.filter((s) => s.group === g).map((s) => (
              <li key={s.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <button onClick={() => toggle(s)} role="checkbox" aria-checked={s.done} aria-label={s.title}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${s.done ? 'border-teal bg-teal text-white' : 'border-line bg-panel'}`}>
                  {s.done ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                </button>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14.5px] font-medium ${s.done ? 'text-muted line-through' : ''}`}>{s.title}</span>
                  <span className="block text-[13px] text-muted">{s.why}</span>
                </span>
                {s.action ? (
                  <a href={s.action.href} target={s.action.external ? '_blank' : undefined} rel={s.action.external ? 'noopener' : undefined} className="btn-outline h-8 min-h-0 shrink-0 px-3 text-[12.5px]">
                    {s.action.label}{s.action.external ? ' ↗' : ''}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
