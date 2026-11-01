'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { Icon } from '@/components/Icon';

function SignIn() {
  const sp = useSearchParams();
  const business = sp.get('for') === 'business';
  const raw = sp.get('next');
  const next = raw && raw.startsWith('/') ? raw : business ? '/vendor' : '/saved';

  return (
    <div className="container-k grid max-w-4xl gap-10 py-12 md:grid-cols-[1.1fr_1fr]">
      <div>
        {business ? <p className="eyebrow text-brand">Karibu for businesses</p> : null}
        <h1 className="mt-1 font-display text-3xl font-extrabold">{business ? 'Sign in to list your business' : 'Sign in to Karibu'}</h1>
        <p className="mt-2 text-muted">
          {business
            ? 'Use your business mobile number or company email. It’s the same free Karibu account travellers use; your business tools appear once you add your business.'
            : 'One free account for planning trips and, if you run one, managing a business. Use your email or your mobile number.'}
        </p>
        <div className="mt-6">
          <AuthForm next={next} defaultMethod={business ? 'phone' : 'email'} emailLabel={business ? 'Company email' : 'Email'} emailPlaceholder={business ? 'bookings@yourcamp.co.ke' : 'you@example.com'} />
        </div>
        {!business ? (
          <p className="mt-8 border-t border-line pt-6 text-[14px]">
            Run a camp, a 4x4, a tour or a guiding business? <Link href="/signin?for=business" className="font-bold text-brand">Sign in to list it</Link>. It’s the same account.
          </p>
        ) : (
          <p className="mt-8 border-t border-line pt-6 text-[14px] text-muted">
            Already use Karibu for travel? Sign in with that account and add your business. You don’t need a second one.
          </p>
        )}
      </div>

      <aside className="rounded-[20px] bg-soft p-6">
        <h2 className="font-display text-xl font-extrabold">{business ? 'What happens next' : 'Do I need an account?'}</h2>
        {business ? (
          <ol className="mt-4 flex flex-col gap-4 text-[15px]">
            {[
              ['Sign in', 'With your business mobile or company email. A code or link proves it’s yours.'],
              ['Add your business', 'Name, WhatsApp and licence number. Your WhatsApp is verified straight away if it’s the number you signed in with.'],
              ['Add listings', 'Rooms, game drives, transfers or tours, with prices and what’s included.'],
              ['We verify you, free', 'Documents and, for some categories, a visit. Then you go live.'],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand font-bold text-white">{i + 1}</span>
                <span><strong>{t}</strong><span className="block text-muted">{b}</span></span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p className="mt-3 text-[15px]"><strong>No.</strong> Without an account you can search, read listings, message businesses on WhatsApp, check operators and prices, report problems and share what you paid.</p>
            <p className="mt-3 text-[15px] font-bold">An account adds:</p>
            <ul className="mt-2 flex flex-col gap-2 text-[15px]">
              {['Saved places on every device', 'Trip plans by day, with a map and share link', 'Your enquiry history and reference codes', 'Reviews of businesses you contacted'].map((x) => (
                <li key={x} className="flex gap-2"><Icon name="check" size={18} strokeWidth={3} className="mt-0.5 shrink-0 text-teal" />{x}</li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
