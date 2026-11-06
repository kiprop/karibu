'use client';

import { Centered } from '@/components/Page';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { call, deviceId, guestFavourites, setGuestFavourites } from '@/lib/client-api';

function Verify() {
  const sp = useSearchParams();
  const token = sp.get('token');
  const next = sp.get('next');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;
    call('/auth/email/verify', { body: { token, deviceId: deviceId(), favourites: guestFavourites() } })
      .then(() => {
        setGuestFavourites([]);
        // Full reload so the header and session state pick up the new cookie.
        window.location.replace(next && next.startsWith('/') ? next : '/today');
      })
      .catch((e) => setError((e as Error).message));
  }, [token, next]);

  return (
    <Centered crumbs={[{ label: 'Sign in', href: '/signin' }, { label: 'Email link' }]}>
      <div className="card p-6">
        {error || !token ? (
          <>
            <h1 className="area-title">That link didn’t work</h1>
            <p className="mt-2 text-muted">{error ?? 'The link is missing its code.'}</p>
            <Link href="/signin" className="btn-primary mt-5">Sign in another way</Link>
          </>
        ) : (
          <p role="status" className="text-[16px]">Signing you in…</p>
        )}
      </div>
    </Centered>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
