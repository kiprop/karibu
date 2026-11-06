'use client';

import { usePathname } from 'next/navigation';
import { RailShell, type RailItem } from '@/components/RailShell';
import { useSession } from '@/components/Session';

/** The business console: same frame as the staff console and My Karibu, for people who run a business. */
export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me } = useSession();
  const biz = me.vendors?.[0];
  if (!me.user || !biz || path.startsWith('/vendor/signin') || path.startsWith('/vendor/verify-email')) return <>{children}</>;
  const v = (view: string | null) => (p: string, cur: string | null) => p === '/vendor' && (cur ?? null) === view;
  const items: RailItem[] = [
    { href: '/vendor', label: 'Overview', icon: 'compass', group: biz.name, match: v(null) },
    { href: '/vendor?view=listings', label: 'Listings', icon: 'stay', group: biz.name, match: (p, cur) => (p === '/vendor' && cur === 'listings') || p.startsWith('/vendor/listings') },
    { href: '/vendor?view=enquiries', label: 'Enquiries', icon: 'chat', group: biz.name, match: v('enquiries') },
    { href: '/vendor?view=experiences', label: 'Experiences', icon: 'star', group: biz.name, match: v('experiences') },
    { href: '/vendor?view=insights', label: 'Insights', icon: 'tag', group: 'Grow', match: v('insights') },
    { href: '/vendor?view=verification', label: 'Verification', icon: 'shield', group: 'Trust', match: v('verification') },
    { href: '/vendor?view=profile', label: 'Public page', icon: 'briefcase', group: 'Trust', match: v('profile') },
    { href: '/vendor/plan', label: 'Plan', icon: 'cash', group: 'Account', match: (p) => p.startsWith('/vendor/plan') },
    { href: '/today', label: 'Back to My Karibu', icon: 'back', group: 'Account', match: () => false },
  ];
  return (
    <RailShell items={items} head={
      <div className="mb-2 rounded-lg bg-soft px-3 py-2.5">
        <div className="truncate text-[13px] font-semibold">{biz.name}</div>
        <div className="text-[12px] text-muted">Business console · {biz.plan} plan</div>
      </div>
    }>
      {children}
    </RailShell>
  );
}
