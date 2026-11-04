'use client';

import dynamic from 'next/dynamic';
import type { MapPoint } from '@/components/MapView';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse rounded-2xl bg-soft" />,
});

export function ExploreMap({ items }: { items: MapPoint[] }) {
  return <MapView points={items} height={520} />;
}
