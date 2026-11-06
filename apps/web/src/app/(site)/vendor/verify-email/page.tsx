'use client';

import { Centered } from '@/components/Page';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { call } from '@/lib/client-api';
import { Icon } from '@/components/Icon';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<{ ok: true; business: string; email: string } | { ok: false; error: string } | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return setState({ ok: false, error: 'The link is missing its code.' });
    call<{ business: string; email: string }>('/vendor/email/verify', { body: { token } })
      .then((r) => setState({ ok: true, business: r.business, email: r.email }))
      .catch((e) => setState({ ok: false, error: (e as Error).message }));
  }, [token]);

  return (
    <Centered crumbs={[{ label: 'My business', href: '/vendor' }, { label: 'Confirm email' }]}>
      <div className="card p-6">
      {!state ? <p role="status">Confirming…</p> : state.ok ? (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-teal text-white"><Icon name="check" strokeWidth={3} /></span>
          <h1 className="mt-4 area-title">Email confirmed</h1>
          <p className="mt-2 text-muted"><strong>{state.email}</strong> is now confirmed as {state.business}’s email on Karibu.</p>
          <Link href="/vendor" className="btn-primary mt-6">Go to your business</Link>
        </>
      ) : (
        <>
          <h1 className="area-title">That link didn’t work</h1>
          <p className="mt-2 text-muted">{state.error}</p>
          <Link href="/vendor" className="btn-primary mt-6">Back to your business</Link>
        </>
      )}
      </div>
    </Centered>
  );
}

export default function Page() {
  return <Suspense><Verify /></Suspense>;
}
