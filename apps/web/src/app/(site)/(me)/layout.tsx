'use client';

import { RailShell, type RailItem } from '@/components/RailShell';
import { useSession } from '@/components/Session';

/** "My Karibu": the traveller's companion area, laid out like the staff console. Works for guests too. */
export default function MeLayout({ children }: { children: React.ReactNode }) {
  const { me, favourites } = useSession();
  const hasBusiness = (me.vendors?.length ?? 0) > 0;
  const items: RailItem[] = [
    { href: '/today', label: 'Today', icon: 'compass', group: 'Companion' },
    { href: '/ask', label: 'Ask Karibu', icon: 'chat', group: 'Companion' },
    { href: '/plan', label: 'Your plan', icon: 'check', group: 'Companion' },
    { href: '/saved', label: 'Saved', icon: 'heart', count: me.user ? favourites.size : null, group: 'Your things' },
    { href: '/trips', label: 'Trips', icon: 'cal', group: 'Your things' },
    { href: '/account', label: me.user ? 'Account' : 'Sign in', icon: 'user', group: 'Account' },
    ...(hasBusiness ? [{ href: '/vendor', label: 'My business', icon: 'briefcase', group: 'Account' }] : []),
  ];
  const name = me.user?.displayName?.split(' ')[0];
  return (
    <RailShell items={items} head={
      <div className="mb-2 rounded-lg bg-soft px-3 py-2.5">
        <div className="text-[13px] font-semibold">{name ? `Karibu, ${name}` : 'Karibu'}</div>
        <div className="text-[12px] text-muted">{me.user ? 'Your companion for this trip' : 'Saved on this device. Sign in to keep it everywhere.'}</div>
      </div>
    }>
      {children}
    </RailShell>
  );
}
