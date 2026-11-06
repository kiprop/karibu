'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PasswordAuth } from '@/components/PasswordAuth';
import { Icon } from '@/components/Icon';
import { Page as KPage, SideCard, Steps } from '@/components/Page';

function SignIn() {
  const sp = useSearchParams();
  const business = sp.get('for') === 'business';
  const raw = sp.get('next');
  const next = raw && raw.startsWith('/') ? raw : business ? '/vendor' : '/today';
  const mode = sp.get('mode') === 'create' ? 'create' : sp.get('mode') === 'forgot' ? 'forgot' : 'signin';

  const steps = [
    <><b>Create your account</b> with your business mobile or company email and a password. A one-time code proves it’s yours.</>,
    <><b>Add your business</b>: name, WhatsApp and licence number. Your WhatsApp is verified straight away if it’s the number you signed in with.</>,
    <><b>Add listings</b>: rooms, game drives, transfers or tours, with photos, prices and what’s included.</>,
    <><b>We verify you, free.</b> Documents and, for some categories, a visit. Then you go live.</>,
  ];
  return (
    <KPage crumbs={business ? [{ label: 'For businesses', href: '/vendor' }, { label: 'Sign in' }] : [{ label: 'Sign in' }]}
      eyebrow={business ? 'Karibu for businesses' : undefined}
      title={business ? 'Sign in to list your business' : 'Sign in to Karibu'}
      desc={business
        ? 'Use your business mobile number or company email and a password. It’s the same free Karibu account travellers use; your business tools appear once you add your business.'
        : 'One free account for planning trips and, if you run one, managing a business. Sign in with your email or mobile number and password.'}
      aside={business ? (
        <SideCard title="What happens next"><Steps items={steps} /></SideCard>
      ) : (
        <SideCard title="Do I need an account?">
          <p className="text-muted"><b className="text-ink">No.</b> Without one you can search, read listings, message businesses on WhatsApp, check operators and prices, report problems and share what you paid.</p>
          <p className="mt-3 font-semibold">An account adds:</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {['Saved places on every device', 'Trip plans by day, with a map and share link', 'Your enquiry history and reference codes', 'Reviews of businesses you contacted'].map((x) => (
              <li key={x} className="flex gap-2 text-muted"><Icon name="check" size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-teal" />{x}</li>
            ))}
          </ul>
        </SideCard>
      )}>
      <div className="card max-w-xl p-5 sm:p-6">
        <PasswordAuth next={next} business={business} initialMode={mode} />
        <p className="mt-6 border-t border-line pt-4 text-[14px] text-muted">
          {business
            ? 'Already use Karibu for travel? Sign in with that account and add your business. You don’t need a second one.'
            : <>Run a camp, a 4x4, a tour or a guiding business? <Link href="/signin?for=business" className="font-semibold text-brand">Sign in to list it</Link>. It’s the same account.</>}
        </p>
      </div>
    </KPage>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
