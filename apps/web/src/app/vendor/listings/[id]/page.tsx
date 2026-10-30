'use client';

import { use, useEffect, useState } from 'react';
import { call } from '@/lib/client-api';
import { ListingForm, type ListingValues } from '../ListingForm';

export default function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [initial, setInitial] = useState<ListingValues | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    call<{ listing: any }>(`/vendor/listings/${id}`)
      .then(({ listing: l }) =>
        setInitial({
          cityId: l.cityId, category: l.category, subtype: l.subtype, title: l.title, summary: l.summary, description: l.description ?? '',
          lat: l.lat, lon: l.lon, locationIsPrivate: l.locationIsPrivate, budgetTier: l.budgetTier ?? undefined, priceFrom: l.priceFrom ?? undefined,
          priceTo: l.priceTo ?? undefined, priceUnit: l.priceUnit, attributes: l.attributes ?? {}, amenities: l.amenities ?? [], photos: l.photos ?? [],
        }),
      )
      .catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="container-k py-12 text-danger">{err}</div>;
  if (!initial) return <div className="container-k py-12 text-muted">Loading…</div>;
  return <ListingForm id={id} initial={initial} />;
}
