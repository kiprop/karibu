export type Category = 'stay' | 'safari' | 'transport' | 'guide' | 'experience' | 'event';

export interface ListingCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: Category;
  subtype: string;
  budgetTier: 'budget' | 'mid' | 'premium' | null;
  currency: string;
  priceFrom: number | null;
  priceTo: number | null;
  priceUnit: string;
  city: string;
  citySlug: string;
  country: string;
  vendorName: string;
  verificationLevel: number;
  verifiedAt: string | null;
  isFeatured: boolean;
  isSample: boolean;
  amenities: string[];
  lastConfirmedAt: string | null;
  lat: number;
  lon: number;
  photoUrl: string | null;
  rating: number | null;
  reviewCount: number;
  distanceM?: number | null;
}

export interface ListingDetail extends ListingCard {
  description: string | null;
  attributes: Record<string, any>;
  locationIsPrivate: boolean;
  whatsapp: string;
  phone: string | null;
  email: string | null;
  photos: { url: string; alt: string }[];
  dates: { id: string; startsAt: string; endsAt: string; confirmed: boolean; ticketUrl: string | null }[];
  reviews: { id: string; rating: number; body: string | null; vendorReply: string | null; createdAt: string; author: string }[];
  /** What travellers reported paying here ("I paid this much"), most-reported currency only. */
  paid: { currency: string; reports: number; median: number; minAmount: number; maxAmount: number; latest: { item: string; amount: number; unit: string | null; paidOn: string }[] } | null;
}

export interface Me {
  user: { id: string; email: string | null; phone: string | null; displayName: string | null; role: 'traveller' | 'vendor' | 'reviewer' | 'admin' } | null;
  vendors?: { id: string; name: string; slug: string; plan: string; verificationLevel: number }[];
}

export const CATEGORY_LABEL: Record<Category, string> = {
  stay: 'Stays',
  safari: 'Game drives & safaris',
  transport: 'Transport',
  guide: 'Local guides',
  experience: 'Experiences',
  event: 'Events',
};

export const CATEGORY_SINGULAR: Record<Category, string> = {
  stay: 'Stay',
  safari: 'Game drive',
  transport: 'Transport',
  guide: 'Local guide',
  experience: 'Experience',
  event: 'Event',
};

export const LEVEL_LABEL: Record<number, string> = { 1: 'Contact verified', 2: 'Licensed', 3: 'Visited' };

export const AMENITY_LABEL: Record<string, string> = {
  hot_water: 'Hot water', wifi: 'Wi-Fi', power_backup: 'Power backup', solar: 'Solar power', pool: 'Pool', breakfast: 'Breakfast',
  family_rooms: 'Family rooms', parking: 'Parking', wheelchair_access: 'Wheelchair access', pop_top_roof: 'Pop-top roof',
  window_seats: 'Window seat for all', vehicle_charging: 'Charging in vehicle', vehicle_fridge: 'Fridge in vehicle',
  park_fees_included: 'Park fees included', meals_included: 'Meals included', airport_pickup: 'Airport pickup', family_friendly: 'Family friendly',
};
