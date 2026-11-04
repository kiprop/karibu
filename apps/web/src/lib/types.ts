export type Category = 'stay' | 'safari' | 'transport' | 'guide' | 'experience' | 'event' | 'home' | 'furniture' | 'home_services' | 'utilities' | 'grooming';

/** Visiting (short trips) and Settle in (long stays and moving home). */
export const VISIT_CATEGORIES: Category[] = ['stay', 'safari', 'transport', 'guide', 'experience', 'event'];
export const SETTLE_CATEGORIES: Category[] = ['home', 'furniture', 'home_services', 'utilities', 'grooming'];
export const isSettle = (c: Category) => SETTLE_CATEGORIES.includes(c);

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
  vendorSlug: string;
  recommendAnswers: number;
  recommendYes: number;
  contactedCount: number;
  reviews: Experience[];
  ratingBreakdown: Record<string, number>;
  travellerTypes: { type: string; n: number }[];
  mentions: { word: string; count: number }[];
  highlights: { id: string; body: string; author: string }[];
  citySlug: string;
  /** What travellers reported paying here ("I paid this much"), most-reported currency only. */
  paid: { currency: string; reports: number; median: number; minAmount: number; maxAmount: number; latest: { item: string; amount: number; unit: string | null; paidOn: string }[] } | null;
}

export interface Me {
  /** role marks staff only (reviewer, admin). Business access comes from vendors, not from role. */
  user: { id: string; email: string | null; phone: string | null; displayName: string | null; role: 'traveller' | 'reviewer' | 'admin' } | null;
  vendors?: { id: string; name: string; slug: string; plan: string; verificationLevel: number }[];
  signIn?: { email: string | null; emailVerified: boolean; phone: string | null; phoneVerified: boolean; google: boolean; hasPassword?: boolean; passwordChangedAt?: string | null };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  stay: 'Stays',
  safari: 'Game drives & safaris',
  transport: 'Transport',
  guide: 'Local guides',
  experience: 'Experiences',
  event: 'Events',
  home: 'Long-stay homes',
  furniture: 'Furniture & home',
  home_services: 'Home services',
  utilities: 'Internet & utilities',
  grooming: 'Hair & grooming',
};

export const CATEGORY_SINGULAR: Record<Category, string> = {
  stay: 'Stay',
  safari: 'Game drive',
  transport: 'Transport',
  guide: 'Local guide',
  experience: 'Experience',
  event: 'Event',
  home: 'Long-stay home',
  furniture: 'Furniture & home',
  home_services: 'Home service',
  utilities: 'Internet & utilities',
  grooming: 'Hair & grooming',
};

export const LEVEL_LABEL: Record<number, string> = { 1: 'Contact verified', 2: 'Licensed', 3: 'Visited' };

export const AMENITY_LABEL: Record<string, string> = {
  hot_water: 'Hot water', wifi: 'Wi-Fi', power_backup: 'Power backup', solar: 'Solar power', pool: 'Pool', breakfast: 'Breakfast',
  family_rooms: 'Family rooms', parking: 'Parking', wheelchair_access: 'Wheelchair access', pop_top_roof: 'Pop-top roof',
  window_seats: 'Window seat for all', vehicle_charging: 'Charging in vehicle', vehicle_fridge: 'Fridge in vehicle',
  park_fees_included: 'Park fees included', meals_included: 'Meals included', airport_pickup: 'Airport pickup', family_friendly: 'Family friendly',
  delivery: 'Delivery', installation: 'Installation or assembly', card_payment: 'Card payment', mpesa: 'M-Pesa', pet_friendly: 'Pets welcome',
  home_visits: 'Home visits', walk_ins: 'Walk-ins welcome', gated_compound: 'Gated compound', backup_water: 'Backup water',
};

export const TRAVELLER_TYPE_LABEL: Record<string, string> = {
  solo: 'Solo', couple: 'Couple', family: 'Family', friends: 'Friends', business: 'Business',
  long_stay: 'Long stay', moving_home: 'Moving home',
};

/** A traveller's experience with a business: stars, recommend or not, what they paid, what happened. */
export interface Experience {
  id: string;
  rating: number;
  recommend: boolean | null;
  body: string | null;
  visitedOn: string | null;
  vendorReply?: string | null;
  createdAt: string;
  author: string;
  /** True when the traveller contacted this business through Karibu (has a reference code). */
  contacted: boolean;
  travellerType?: string | null;
  helpful?: number;
  paid: { item: string; amount: number; currency: string; unit: string | null; feel?: string | null } | null;
  listingTitle?: string;
  listingSlug?: string;
  city?: string;
}
