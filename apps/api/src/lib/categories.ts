import { z } from 'zod';

/** Sub-types and category-specific attributes. Attributes are stored in listings.attributes (jsonb). */
export const SUBTYPES = {
  stay: ['hotel', 'resort', 'safari lodge', 'tented camp', 'guesthouse', 'apartment', 'homestay'],
  safari: ['half-day game drive', 'full-day game drive', 'multi-day safari'],
  transport: ['airport transfer', 'driver for hire', '4x4 with driver-guide', 'bush flight desk', 'intercity'],
  guide: ['city walk', 'food walk', 'trekking guide', 'cultural guide'],
  experience: ['primate trek', 'cooking class', 'farm visit', 'workshop', 'day trip', 'wellness'],
  event: ['music', 'culture', 'food', 'festival', 'sport'],
} as const;

export type Category = keyof typeof SUBTYPES;
export const CATEGORIES = Object.keys(SUBTYPES) as Category[];

export const AMENITIES = [
  'hot_water', 'wifi', 'power_backup', 'solar', 'pool', 'breakfast', 'family_rooms', 'parking',
  'wheelchair_access', 'pop_top_roof', 'window_seats', 'vehicle_charging', 'vehicle_fridge', 'park_fees_included',
  'meals_included', 'airport_pickup', 'family_friendly',
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
} satisfies Record<Category, z.ZodTypeAny>;

export function validateAttributes(category: Category, value: unknown) {
  return attrs[category].strict().parse(value ?? {});
}

export function isValidSubtype(category: Category, subtype: string) {
  return (SUBTYPES[category] as readonly string[]).includes(subtype);
}
