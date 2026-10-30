'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { id: string; lat: number; lon: number; label: string; href?: string; sub?: string };

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ?? '&copy; OpenStreetMap contributors';

/** Map of listings or trip stops. Uses OpenStreetMap tiles by default; set NEXT_PUBLIC_TILE_URL for a paid tile host in production. */
export function MapView({ points, height = 420, route = false }: { points: MapPoint[]; height?: number; route?: boolean }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
      const latlngs: [number, number][] = [];
      for (const p of points) {
        const ll: [number, number] = [p.lat, p.lon];
        latlngs.push(ll);
        const marker = L.circleMarker(ll, { radius: 9, color: '#ffffff', weight: 2, fillColor: '#E64B24', fillOpacity: 1 }).addTo(map);
        const div = document.createElement('div');
        const a = document.createElement(p.href ? 'a' : 'strong');
        a.textContent = p.label;
        if (p.href) (a as HTMLAnchorElement).href = p.href;
        div.appendChild(a);
        if (p.sub) {
          const s = document.createElement('div');
          s.textContent = p.sub;
          div.appendChild(s);
        }
        marker.bindPopup(div);
      }
      if (route && latlngs.length > 1) L.polyline(latlngs, { color: '#E64B24', weight: 3, dashArray: '6 6' }).addTo(map);
      if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs).pad(0.25), { maxZoom: 12 });
      else map.setView([-1.2864, 36.8172], 6);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, route]);

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl border border-line" role="region" aria-label="Map" />;
}
