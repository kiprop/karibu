'use client';

import { useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from './Icon';

/** "Helpful" on an experience. One vote per account or device; tapping again takes it back. */
export function HelpfulButton({ id, count }: { id: string; count: number }) {
  const [n, setN] = useState(count);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function vote() {
    setErr(null);
    try {
      const r = await call<{ voted: boolean; helpful: number }>(`/experiences/${id}/helpful`, { body: {} });
      setOn(r.voted);
      setN(r.helpful);
    } catch (x) {
      setErr((x as Error).message);
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={vote} aria-pressed={on} className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold ${on ? 'border-teal bg-teal-soft text-teal' : 'border-line text-muted hover:text-ink'}`}>
        <Icon name="thumb" size={15} />Helpful{n ? ` · ${n}` : ''}
      </button>
      {err ? <span className="text-[12px] text-danger">{err}</span> : null}
    </span>
  );
}
