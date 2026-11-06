import Link from 'next/link';
import { getMe } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { Suspense } from 'react';
import { VendorDashboard } from './VendorDashboard';

export const metadata = { title: 'For businesses' };

export default async function VendorHome() {
  const me = await getMe();
  // Signed in: the dashboard, which starts with "Tell us about your business" if they don't have one yet.
  if (me.user) return <Suspense><VendorDashboard /></Suspense>;
  return (
    <div>
      <section className="bg-gradient-to-b from-brand-soft to-ground">
        <div className="container-k py-14">
          <p className="eyebrow text-brand">For camps, drivers, guides and tour operators</p>
          <h1 className="mt-2 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">Travellers are looking for you. Make it easy to trust you.</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">List free. Our team verifies you, then travellers message you directly on WhatsApp. No commission, ever.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signin?for=business&next=/vendor" className="btn-primary">Create your free listing</Link>
            <Link href="/vendor/plan" className="btn-outline">See plans</Link>
          </div>
        </div>
      </section>
      <section className="container-k mt-10 grid gap-4 md:grid-cols-4">
        {[
          ['phone', 'Create your account', 'With your business mobile or company email and a password.'],
          ['plus', 'Add your listing', 'Photos, prices, what’s included and your WhatsApp.'],
          ['shield', 'We verify you', 'Free checks of identity, licence and, for some, a visit.'],
          ['chat', 'Get enquiries', 'Travellers message you directly with a reference code.'],
        ].map(([icon, t, b]) => (
          <div key={t} className="card p-5">
            <Icon name={icon} className="text-brand" size={26} />
            <h2 className="mt-3 font-extrabold">{t}</h2>
            <p className="mt-1 text-muted">{b}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
