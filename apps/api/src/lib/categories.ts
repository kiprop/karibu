import { z } from 'zod';

/** Sub-types and category-specific attributes. Attributes are stored in listings.attributes (jsonb). */
export const SUBTYPES = {
  stay: ['hotel', 'resort', 'safari lodge', 'tented camp', 'guesthouse', 'apartment', 'homestay'],
  safari: ['half-day game drive', 'full-day game drive', 'multi-day safari'],
  transport: ['airport transfer', 'driver for hire', '4x4 with driver-guide', 'bush flight desk', 'intercity'],
  guide: ['city walk', 'food walk', 'trekking guide', 'cultural guide'],
  experience: ['primate trek', 'cooking class', 'farm visit', 'workshop', 'day trip', 'wellness'],
  event: ['music', 'culture', 'food', 'festival', 'sport'],
  // Settle in: long stays and moving home
  home: ['furnished apartment', 'unfurnished apartment', 'serviced apartment', 'house', 'room in a shared home', 'letting agent'],
  furniture: ['furniture store', 'custom workshop', 'second-hand furniture', 'appliances', 'mattresses and bedding', 'home decor'],
  home_services: ['movers', 'cleaning', 'plumber', 'electrician', 'handyman', 'security and CCTV', 'gardener', 'pest control', 'house help agency', 'interior designer'],
  utilities: ['home internet', 'mobile network', 'electricity and prepaid tokens', 'water', 'cooking gas', 'solar and backup power', 'tv and streaming'],
  grooming: ['barber', 'hair salon', 'natural hair and braids', 'nail salon', 'spa and massage', 'beauty and makeup'],
} as const;

/** Visiting (short trips) versus Settle in (long stays and moving home). Used for navigation, not access. */
export const VISIT_CATEGORIES = ['stay', 'safari', 'transport', 'guide', 'experience', 'event'] as const;
export const SETTLE_CATEGORIES = ['home', 'furniture', 'home_services', 'utilities', 'grooming'] as const;

export type Category = keyof typeof SUBTYPES;
export const CATEGORIES = Object.keys(SUBTYPES) as Category[];

export const AMENITIES = [
  'hot_water', 'wifi', 'power_backup', 'solar', 'pool', 'breakfast', 'family_rooms', 'parking',
  'wheelchair_access', 'pop_top_roof', 'window_seats', 'vehicle_charging', 'vehicle_fridge', 'park_fees_included',
  'meals_included', 'airport_pickup', 'family_friendly',
  // Settle in
  'delivery', 'installation', 'card_payment', 'mpesa', 'pet_friendly', 'home_visits', 'walk_ins', 'gated_compound', 'backup_water',
] as const;

const months = z.array(z.number().int().min(1).max(12)).max(12);

const attrs = {
  stay: z.object({
    setting: z.enum(['city', 'bush', 'beach', 'lake', 'mountain']).optional(),
    hotWaterHours: z.string().max(60).optional(),
    wifiMbps: z.number().min(0).max(10000).optional(),
    nearestGate: z.string().max(80).optional(),
    rooms: z.number().int().min(1).max(2000).optional(),
  }),
  safari: z.object({
    park: z.string().min(2).max(80),
    format: z.enum(['shared', 'private']).optional(),
    vehicle: z.string().max(80).optional(),
    pickup: z.string().max(120).optional(),
    durationHours: z.number().min(1).max(24 * 21).optional(),
    guideLanguages: z.array(z.string().max(30)).max(10).optional(),
    bestMonths: months.optional(),
  }),
  transport: z.object({
    vehicle: z.string().max(80).optional(),
    seats: z.number().int().min(1).max(80).optional(),
    routes: z.array(z.object({ from: z.string().max(60), to: z.string().max(60), priceFrom: z.number().int().min(0), priceTo: z.number().int().min(0) })).max(30).optional(),
    baggageKg: z.number().min(0).max(100).optional(),
  }),
  guide: z.object({
    languages: z.array(z.string().max(30)).max(10).optional(),
    accreditation: z.string().max(120).optional(),
    maxGroup: z.number().int().min(1).max(100).optional(),
    durationHours: z.number().min(0.5).max(24).optional(),
  }),
  experience: z.object({
    durationHours: z.number().min(0.5).max(240).optional(),
    minAge: z.number().int().min(0).max(99).optional(),
    fitness: z.enum(['easy', 'moderate', 'hard']).optional(),
    permitNeeded: z.boolean().optional(),
  }),
  event: z.object({ venue: z.string().max(120).optional() }),
  home: z.object({
    bedrooms: z.number().int().min(0).max(20).optional(),
    bathrooms: z.number().int().min(0).max(20).optional(),
    furnished: z.enum(['furnished', 'semi', 'unfurnished']).optional(),
    minLeaseMonths: z.number().int().min(1).max(60).optional(),
    depositMonths: z.number().min(0).max(12).optional(),
    utilitiesIncluded: z.boolean().optional(),
    neighbourhood: z.string().max(80).optional(),
    availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  furniture: z.object({
    sells: z.enum(['new', 'used', 'both']).optional(),
    scale: z.enum(['workshop', 'shop', 'chain']).optional(),
    madeToOrder: z.boolean().optional(),
    leadTimeDays: z.number().int().min(0).max(365).optional(),
    warrantyMonths: z.number().int().min(0).max(120).optional(),
  }),
  home_services: z.object({
    serviceArea: z.string().max(120).optional(),
    calloutFee: z.number().int().min(0).optional(),
    staffVetted: z.boolean().optional(),
    insured: z.boolean().optional(),
    sameDay: z.boolean().optional(),
    hours: z.string().max(80).optional(),
  }),
  utilities: z.object({
    coverage: z.string().max(160).optional(),
    installDays: z.number().int().min(0).max(90).optional(),
    speedMbps: z.number().min(0).max(10000).optional(),
    contract: z.string().max(80).optional(),
  }),
  grooming: z.object({
    hairTypes: z.array(z.enum(['afro', 'curly', 'straight', 'all'])).max(4).optional(),
    services: z.array(z.string().max(40)).max(20).optional(),
    hours: z.string().max(80).optional(),
  }),
} satisfies Record<Category, z.ZodTypeAny>;

export function validateAttributes(category: Category, value: unknown) {
  return attrs[category].strict().parse(value ?? {});
}

export function isValidSubtype(category: Category, subtype: string) {
  return (SUBTYPES[category] as readonly string[]).includes(subtype);
}

export const PRICE_UNITS = [
  'per night', 'per person', 'per vehicle per day', 'per seat', 'per group', 'per ticket',
  'per month', 'per item', 'per visit', 'per hour', 'per job', 'per service',
] as const;
