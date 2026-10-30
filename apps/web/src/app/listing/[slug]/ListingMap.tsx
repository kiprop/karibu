'use client';

import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-2xl bg-soft" />,
});

export function ListingMap({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  return <MapView points={[{ id: 'x', lat, lon, label }]} height={260} />;
}
