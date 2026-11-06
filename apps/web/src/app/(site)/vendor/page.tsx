import Link from 'next/link';
import { getMe } from '@/lib/server-api';
import { Icon } from '@/components/Icon';
import { Hero } from '@/components/Page';
import { Media } from '@/components/bits';
import { Suspense } from 'react';
import { VendorDashboard } from './VendorDashboard';

export const metadata = { title: 'For businesses' };

export default async function VendorHome() {
  const me = await getMe();
  // Signed in: the dashboard, which starts with "Tell us about your business" if they don't have one yet.
  if (me.user) return <Suspense><VendorDashboard /></Suspense>;
  return (
    <div>
      <Hero crumbs={[{ label: 'For businesses' }]} eyebrow="For camps, drivers, guides, tour operators and local services"
        title="Travellers are looking for you. Make it easy to trust you."
        desc="List free. Our team verifies you, then travellers message you directly on WhatsApp. No commission, ever."
        picture={
          <div className="grid grid-cols-2 gap-3">
            {(['stay', 'safari', 'transport', 'grooming'] as const).map((c) => <Media key={c} category={c} className="aspect-[4/3] rounded-xl" />)}
          </div>
        }>
        <div className="flex flex-wrap gap-3">
          <Link href="/signin?for=business&next=/vendor" className="btn-primary">Create your free listing</Link>
          <Link href="/vendor/plan" className="btn-outline">See plans</Link>
        </div>
      </Hero>
      <section className="container-k mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['phone', 'Create your account', 'With your business mobile or company email and a password.'],
          ['camera', 'Add your listing', 'Your own photos, prices, what’s included and your WhatsApp.'],
          ['shield', 'We verify you', 'Free checks of identity, licence and, for some, a visit.'],
          ['chat', 'Get enquiries', 'Travellers message you directly with a reference code.'],
        ].map(([icon, t, b], i) => (
          <div key={t} className="card p-5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={icon} size={20} /></span>
            <h2 className="mt-3 section-title"><span className="text-muted">{i + 1}.</span> {t}</h2>
            <p className="mt-1 text-[14.5px] text-muted">{b}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
