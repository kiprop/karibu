/**
 * Plain-language search for Karibu. Turns "quiet tented camp in the mara under 20k with hot water in march"
 * into filters the person can see and remove. Deterministic and explainable: no model, no guessing about businesses.
 *
 * Knows English, Swahili and Kenyan everyday words (matatu, boda, kinyozi, mama fua, fundi, nyumba),
 * common place nicknames (NRB, MSA, the Mara) and forgives small typos.
 */
import type { Category } from './categories.js';

export type Place = { slug: string; name: string; country: string };
export type Understood = {
  filters: {
    city?: string; country?: string; category?: Category; subtype?: string; mode?: 'visit' | 'settle';
    budget?: 'budget' | 'mid' | 'premium'; priceMax?: number; amenities: string[]; bedrooms?: number;
    furnished?: 'furnished' | 'unfurnished'; month?: number; guests?: number; near?: boolean; travellerType?: string;
  };
  chips: { key: string; label: string }[];
  corrections: { from: string; to: string }[];
  rest: string;
};

// Place nicknames and alternative spellings → city slug.
const PLACE_ALIASES: Record<string, string> = {
  nrb: 'nairobi', nbi: 'nairobi', nairobbi: 'nairobi', 'nai': 'nairobi',
  msa: 'mombasa', mara: 'maasai-mara', 'masai mara': 'maasai-mara', 'maasai mara': 'maasai-mara', 'the mara': 'maasai-mara', 'masai-mara': 'maasai-mara',
  ukunda: 'diani', 'diani beach': 'diani', 'lake naivasha': 'naivasha', 'lake nakuru': 'nakuru', znz: 'zanzibar', unguja: 'zanzibar', 'stone town': 'zanzibar',
  addis: 'addis-ababa',
};

type Hit = { category?: Category; subtype?: string; mode?: 'visit' | 'settle'; amenity?: string; travellerType?: string; label: string };
// Longest phrases first so "tented camp" wins over "camp". Labels are what the chip shows.
const PHRASES: [string, Hit][] = [
  // Stays
  ['tented camp', { category: 'stay', subtype: 'tented camp', label: 'Tented camp' }],
  ['safari lodge', { category: 'stay', subtype: 'safari lodge', label: 'Safari lodge' }],
  ['guest house', { category: 'stay', subtype: 'guesthouse', label: 'Guesthouse' }],
  ['guesthouse', { category: 'stay', subtype: 'guesthouse', label: 'Guesthouse' }],
  ['homestay', { category: 'stay', subtype: 'homestay', label: 'Homestay' }],
  ['airbnb', { category: 'stay', subtype: 'apartment', label: 'Apartment stay' }],
  ['resort', { category: 'stay', subtype: 'resort', label: 'Resort' }],
  ['hotel', { category: 'stay', label: 'Stays' }],
  ['lodge', { category: 'stay', subtype: 'safari lodge', label: 'Safari lodge' }],
  ['camp', { category: 'stay', subtype: 'tented camp', label: 'Tented camp' }],
  ['place to stay', { category: 'stay', label: 'Stays' }],
  ['accommodation', { category: 'stay', label: 'Stays' }],
  ['stay', { category: 'stay', label: 'Stays' }],
  ['malazi', { category: 'stay', label: 'Stays' }],
  // Safaris
  ['game drive', { category: 'safari', label: 'Game drives' }],
  ['game drives', { category: 'safari', label: 'Game drives' }],
  ['safari', { category: 'safari', label: 'Game drives' }],
  ['migration', { category: 'safari', label: 'Game drives' }],
  // Transport
  ['airport transfer', { category: 'transport', subtype: 'airport transfer', label: 'Airport transfer' }],
  ['airport pickup', { category: 'transport', subtype: 'airport transfer', label: 'Airport transfer' }],
  ['airport taxi', { category: 'transport', subtype: 'airport transfer', label: 'Airport transfer' }],
  ['driver', { category: 'transport', subtype: 'driver for hire', label: 'Driver for hire' }],
  ['taxi', { category: 'transport', label: 'Transport' }],
  ['cab', { category: 'transport', label: 'Transport' }],
  ['uber', { category: 'transport', label: 'Transport' }],
  ['matatu', { category: 'transport', subtype: 'intercity', label: 'Matatu and buses' }],
  ['shuttle', { category: 'transport', subtype: 'intercity', label: 'Shuttles and buses' }],
  ['bus', { category: 'transport', subtype: 'intercity', label: 'Shuttles and buses' }],
  ['boda', { category: 'transport', label: 'Transport' }],
  ['4x4', { category: 'transport', subtype: '4x4 with driver-guide', label: '4x4 with driver-guide' }],
  ['car hire', { category: 'transport', label: 'Transport' }],
  ['transfer', { category: 'transport', subtype: 'airport transfer', label: 'Airport transfer' }],
  // Guides and experiences
  ['food walk', { category: 'guide', subtype: 'food walk', label: 'Food walk' }],
  ['walking tour', { category: 'guide', subtype: 'city walk', label: 'City walk' }],
  ['tour guide', { category: 'guide', label: 'Local guides' }],
  ['guide', { category: 'guide', label: 'Local guides' }],
  ['cooking class', { category: 'experience', subtype: 'cooking class', label: 'Cooking class' }],
  ['gorilla', { category: 'experience', subtype: 'primate trek', label: 'Primate trek' }],
  ['chimp', { category: 'experience', subtype: 'primate trek', label: 'Primate trek' }],
  ['day trip', { category: 'experience', subtype: 'day trip', label: 'Day trip' }],
  ['experience', { category: 'experience', label: 'Experiences' }],
  ['things to do', { category: 'experience', label: 'Experiences' }],
  ['concert', { category: 'event', subtype: 'music', label: 'Music events' }],
  ['festival', { category: 'event', subtype: 'festival', label: 'Festivals' }],
  ['event', { category: 'event', label: 'Events' }],
  // Settle in: homes
  ['furnished apartment', { category: 'home', subtype: 'furnished apartment', label: 'Furnished apartment' }],
  ['serviced apartment', { category: 'home', subtype: 'serviced apartment', label: 'Serviced apartment' }],
  ['bedsitter', { category: 'home', label: 'Long-stay homes' }],
  ['to let', { category: 'home', label: 'Long-stay homes' }],
  ['for rent', { category: 'home', label: 'Long-stay homes' }],
  ['rent', { category: 'home', label: 'Long-stay homes' }],
  ['nyumba', { category: 'home', label: 'Long-stay homes' }],
  ['house', { category: 'home', subtype: 'house', label: 'House' }],
  ['apartment', { category: 'home', label: 'Long-stay homes' }],
  ['flat', { category: 'home', label: 'Long-stay homes' }],
  ['letting agent', { category: 'home', subtype: 'letting agent', label: 'Letting agent' }],
  // Furniture
  ['second hand', { category: 'furniture', subtype: 'second-hand furniture', label: 'Second-hand furniture' }],
  ['fundi wa mbao', { category: 'furniture', subtype: 'custom workshop', label: 'Custom workshop' }],
  ['carpenter', { category: 'furniture', subtype: 'custom workshop', label: 'Custom workshop' }],
  ['mattress', { category: 'furniture', subtype: 'mattresses and bedding', label: 'Mattresses and bedding' }],
  ['fridge', { category: 'furniture', subtype: 'appliances', label: 'Appliances' }],
  ['cooker', { category: 'furniture', subtype: 'appliances', label: 'Appliances' }],
  ['appliances', { category: 'furniture', subtype: 'appliances', label: 'Appliances' }],
  ['sofa', { category: 'furniture', label: 'Furniture' }],
  ['couch', { category: 'furniture', label: 'Furniture' }],
  ['furniture', { category: 'furniture', label: 'Furniture' }],
  ['bed', { category: 'furniture', label: 'Furniture' }],
  // Home services
  ['mama fua', { category: 'home_services', subtype: 'cleaning', label: 'Cleaning' }],
  ['house help', { category: 'home_services', subtype: 'house help agency', label: 'House help agency' }],
  ['househelp', { category: 'home_services', subtype: 'house help agency', label: 'House help agency' }],
  ['cleaner', { category: 'home_services', subtype: 'cleaning', label: 'Cleaning' }],
  ['cleaning', { category: 'home_services', subtype: 'cleaning', label: 'Cleaning' }],
  ['plumber', { category: 'home_services', subtype: 'plumber', label: 'Plumber' }],
  ['fundi wa maji', { category: 'home_services', subtype: 'plumber', label: 'Plumber' }],
  ['electrician', { category: 'home_services', subtype: 'electrician', label: 'Electrician' }],
  ['fundi wa stima', { category: 'home_services', subtype: 'electrician', label: 'Electrician' }],
  ['handyman', { category: 'home_services', subtype: 'handyman', label: 'Handyman' }],
  ['fundi', { category: 'home_services', subtype: 'handyman', label: 'Handyman' }],
  ['movers', { category: 'home_services', subtype: 'movers', label: 'Movers' }],
  ['moving', { category: 'home_services', subtype: 'movers', label: 'Movers' }],
  ['cctv', { category: 'home_services', subtype: 'security and CCTV', label: 'Security and CCTV' }],
  ['security', { category: 'home_services', subtype: 'security and CCTV', label: 'Security and CCTV' }],
  ['gardener', { category: 'home_services', subtype: 'gardener', label: 'Gardener' }],
  ['pest control', { category: 'home_services', subtype: 'pest control', label: 'Pest control' }],
  ['fumigation', { category: 'home_services', subtype: 'pest control', label: 'Pest control' }],
  ['interior designer', { category: 'home_services', subtype: 'interior designer', label: 'Interior designer' }],
  // Utilities
  ['home internet', { category: 'utilities', subtype: 'home internet', label: 'Home internet' }],
  ['fibre', { category: 'utilities', subtype: 'home internet', label: 'Home internet' }],
  ['fiber', { category: 'utilities', subtype: 'home internet', label: 'Home internet' }],
  ['internet', { category: 'utilities', subtype: 'home internet', label: 'Home internet' }],
  ['sim card', { category: 'utilities', subtype: 'mobile network', label: 'Mobile network' }],
  ['sim', { category: 'utilities', subtype: 'mobile network', label: 'Mobile network' }],
  ['tokens', { category: 'utilities', subtype: 'electricity and prepaid tokens', label: 'Electricity and tokens' }],
  ['electricity', { category: 'utilities', subtype: 'electricity and prepaid tokens', label: 'Electricity and tokens' }],
  ['stima', { category: 'utilities', subtype: 'electricity and prepaid tokens', label: 'Electricity and tokens' }],
  ['cooking gas', { category: 'utilities', subtype: 'cooking gas', label: 'Cooking gas' }],
  ['gas', { category: 'utilities', subtype: 'cooking gas', label: 'Cooking gas' }],
  ['solar', { category: 'utilities', subtype: 'solar and backup power', label: 'Solar and backup power' }],
  ['dstv', { category: 'utilities', subtype: 'tv and streaming', label: 'TV and streaming' }],
  // Grooming
  ['kinyozi', { category: 'grooming', subtype: 'barber', label: 'Barber' }],
  ['barber', { category: 'grooming', subtype: 'barber', label: 'Barber' }],
  ['haircut', { category: 'grooming', subtype: 'barber', label: 'Barber' }],
  ['braids', { category: 'grooming', subtype: 'natural hair and braids', label: 'Natural hair and braids' }],
  ['natural hair', { category: 'grooming', subtype: 'natural hair and braids', label: 'Natural hair and braids' }],
  ['locs', { category: 'grooming', subtype: 'natural hair and braids', label: 'Natural hair and braids' }],
  ['salon', { category: 'grooming', subtype: 'hair salon', label: 'Hair salon' }],
  ['nails', { category: 'grooming', subtype: 'nail salon', label: 'Nail salon' }],
  ['manicure', { category: 'grooming', subtype: 'nail salon', label: 'Nail salon' }],
  ['massage', { category: 'grooming', subtype: 'spa and massage', label: 'Spa and massage' }],
  ['spa', { category: 'grooming', subtype: 'spa and massage', label: 'Spa and massage' }],
  ['makeup', { category: 'grooming', subtype: 'beauty and makeup', label: 'Beauty and makeup' }],
  // Amenities
  ['hot water', { amenity: 'hot_water', label: 'Hot water' }],
  ['maji moto', { amenity: 'hot_water', label: 'Hot water' }],
  ['hot shower', { amenity: 'hot_water', label: 'Hot water' }],
  ['wifi', { amenity: 'wifi', label: 'Wi-Fi' }],
  ['wi fi', { amenity: 'wifi', label: 'Wi-Fi' }],
  ['swimming pool', { amenity: 'pool', label: 'Pool' }],
  ['pool', { amenity: 'pool', label: 'Pool' }],
  ['breakfast', { amenity: 'breakfast', label: 'Breakfast' }],
  ['parking', { amenity: 'parking', label: 'Parking' }],
  ['wheelchair', { amenity: 'wheelchair_access', label: 'Wheelchair access' }],
  ['accessible', { amenity: 'wheelchair_access', label: 'Wheelchair access' }],
  ['pet friendly', { amenity: 'pet_friendly', label: 'Pets allowed' }],
  ['pets', { amenity: 'pet_friendly', label: 'Pets allowed' }],
  ['dog', { amenity: 'pet_friendly', label: 'Pets allowed' }],
  ['cat', { amenity: 'pet_friendly', label: 'Pets allowed' }],
  ['backup power', { amenity: 'power_backup', label: 'Backup power' }],
  ['generator', { amenity: 'power_backup', label: 'Backup power' }],
  ['backup water', { amenity: 'backup_water', label: 'Backup water' }],
  ['borehole', { amenity: 'backup_water', label: 'Backup water' }],
  ['gated', { amenity: 'gated_compound', label: 'Gated compound' }],
  ['m pesa', { amenity: 'mpesa', label: 'Takes M-Pesa' }],
  ['mpesa', { amenity: 'mpesa', label: 'Takes M-Pesa' }],
  ['card payment', { amenity: 'card_payment', label: 'Takes cards' }],
  ['delivery', { amenity: 'delivery', label: 'Delivers' }],
  ['pop top', { amenity: 'pop_top_roof', label: 'Pop-top roof' }],
  ['park fees included', { amenity: 'park_fees_included', label: 'Park fees included' }],
  ['meals included', { amenity: 'meals_included', label: 'Meals included' }],
  ['full board', { amenity: 'meals_included', label: 'Meals included' }],
  ['home visit', { amenity: 'home_visits', label: 'Comes to your home' }],
  ['comes to my house', { amenity: 'home_visits', label: 'Comes to your home' }],
  ['walk in', { amenity: 'walk_ins', label: 'Walk-ins welcome' }],
  // Who's going
  ['family', { amenity: 'family_friendly', travellerType: 'family', label: 'Family friendly' }],
  ['kids', { amenity: 'family_friendly', travellerType: 'family', label: 'Family friendly' }],
  ['children', { amenity: 'family_friendly', travellerType: 'family', label: 'Family friendly' }],
  ['honeymoon', { travellerType: 'couple', label: 'For couples' }],
  ['romantic', { travellerType: 'couple', label: 'For couples' }],
  ['solo', { travellerType: 'solo', label: 'Travelling solo' }],
  // Modes
  ['moving home', { mode: 'settle', label: 'Settle in' }],
  ['relocating', { mode: 'settle', label: 'Settle in' }],
  ['long stay', { mode: 'settle', label: 'Settle in' }],
];
const BUDGET_WORDS: [string, 'budget' | 'mid' | 'premium', string][] = [
  ['cheap', 'budget', 'Budget'], ['affordable', 'budget', 'Budget'], ['budget', 'budget', 'Budget'], ['bei rahisi', 'budget', 'Budget'], ['backpacker', 'budget', 'Budget'],
  ['mid range', 'mid', 'Mid-range'], ['midrange', 'mid', 'Mid-range'], ['moderate', 'mid', 'Mid-range'],
  ['luxury', 'premium', 'Premium'], ['luxurious', 'premium', 'Premium'], ['high end', 'premium', 'Premium'], ['premium', 'premium', 'Premium'], ['5 star', 'premium', 'Premium'], ['five star', 'premium', 'Premium'],
];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FILLER = new Set(('a an the in at on to for of with and or near around me my i we us our need want looking find show some any good best nice please that which is are be can '
  + 'quiet place places somewhere where what who get has have kenya under below less than max maximum up from about around within per night month day people '
  + 'months month weeks week year years long term short may also really very just like nice cool great '
  + 'na kwa ya wa za la karibu nataka natafuta tafuta').split(' '));

const norm = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '')
    .replace(/(\d)[,.](\d)/g, '$1~$2') // keep 1,500 and 2.5 together
    .replace(/[^a-z0-9$~\s<-]/g, ' ').replace(/~/g, ',').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const fuzzyOk = (typed: string, word: string) => typed.length >= 4 && typed[0] === word[0] && lev(typed, word) <= (word.length >= 7 ? 2 : 1);

export function money(n: number) {
  return n.toLocaleString('en-US');
}

export function understand(input: string, places: Place[], opts: { usdToKes?: number } = {}): Understood {
  const out: Understood = { filters: { amenities: [] }, chips: [], corrections: [], rest: '' };
  let text = ` ${norm(input)} `;
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], ' ');
    return m;
  };

  // ---- Money: "under 20k", "below KES 5,000", "less than $100", "max 15000", "<20k" ----
  const priceRe = /\s(?:under|below|less than|max(?:imum)?|up to|upto|cheaper than|within|chini ya|<)\s*(kes|ksh|kshs|sh|\$|usd)?\s*([\d,.]+)\s*(k|m|thousand|elfu)?\s*(kes|ksh|kshs|bob|usd|dollars|\$)?(?=\s)/;
  const pm = take(priceRe);
  if (pm) {
    let n = parseFloat(pm[2].replace(/,/g, ''));
    const mult = pm[3];
    if (mult === 'k' || mult === 'thousand' || mult === 'elfu') n *= 1000;
    if (mult === 'm') n *= 1_000_000;
    const usd = [pm[1], pm[4]].some((c) => c === '$' || c === 'usd' || c === 'dollars');
    if (n > 0) {
      if (usd) {
        const kes = Math.round(n * (opts.usdToKes ?? 129));
        out.filters.priceMax = kes;
        out.chips.push({ key: 'priceMax', label: `Under US$${money(n)} (about KES ${money(kes)})` });
      } else {
        out.filters.priceMax = Math.round(n);
        out.chips.push({ key: 'priceMax', label: `Under KES ${money(Math.round(n))}` });
      }
    }
  }

  // ---- Bedrooms: "2 bedroom", "2br", "3-bed", "two bedroom" ----
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const br = take(/\s(\d|one|two|three|four|five)\s*(?:bed ?rooms?|bedroom|br|bed|bdr)(?=\s)/);
  if (br) {
    const n = Number(br[1]) || words[br[1]];
    out.filters.bedrooms = n;
    out.filters.category = 'home';
    out.chips.push({ key: 'bedrooms', label: `${n}+ bedroom${n === 1 ? '' : 's'}` });
  }
  if (take(/\s(?:fully\s)?furnished(?=\s)/)) {
    out.filters.furnished = 'furnished';
    out.chips.push({ key: 'furnished', label: 'Furnished' });
  } else if (take(/\sunfurnished(?=\s)/)) {
    out.filters.furnished = 'unfurnished';
    out.filters.category ??= 'home';
    out.chips.push({ key: 'furnished', label: 'Unfurnished' });
  }

  // ---- Guests: "2 adults", "for 4", "4 people", "family of 5" ----
  const g = take(/\s(?:for\s)?(\d{1,2})\s*(?:adults?|people|persons|pax|guests|of us)(?=\s)/) ?? take(/\sfamily of (\d{1,2})(?=\s)/);
  if (g) {
    out.filters.guests = Number(g[1]);
    out.chips.push({ key: 'guests', label: `${g[1]} people` });
  }

  // ---- Month: "in march", "august", "dec" ----
  for (let i = 0; i < 12; i++) {
    // "may" is also an ordinary word, so it only counts as a month after "in".
    const re = MONTHS[i] === 'may' ? /\sin\smay(?=\s)/ : new RegExp(`\\s(?:in\\s)?(?:${MONTHS[i]}|${MONTHS[i].slice(0, 3)})(?=\\s)`);
    if (take(re)) {
      out.filters.month = i + 1;
      out.chips.push({ key: 'month', label: MONTH_NAMES[i] });
      break;
    }
  }

  // ---- Near me ----
  if (take(/\s(?:near me|nearby|close to me|around me|karibu nami)(?=\s)/)) {
    out.filters.near = true;
    out.chips.push({ key: 'near', label: 'Near you' });
  }

  // ---- Budget words ----
  for (const [w, tier, label] of BUDGET_WORDS) {
    if (out.filters.budget) break;
    if (take(new RegExp(`\\s${w}(?=\\s)`))) {
      out.filters.budget = tier;
      out.chips.push({ key: 'budget', label });
    }
  }

  // ---- Places (aliases, names, then typos) ----
  const byName = new Map(places.map((p) => [norm(p.name), p]));
  const bySlug = new Map(places.map((p) => [p.slug, p]));
  const placeTerms = [...Object.keys(PLACE_ALIASES), ...byName.keys()].sort((a, b) => b.length - a.length);
  for (const t of placeTerms) {
    if (out.filters.city) break;
    if (take(new RegExp(`\\s${t.replace(/\s/g, '\\s')}(?=\\s)`))) {
      const p = bySlug.get(PLACE_ALIASES[t] ?? '') ?? byName.get(t);
      if (p) {
        out.filters.city = p.slug;
        out.chips.push({ key: 'city', label: p.name });
      }
    }
  }

  // ---- Categories, sub-types, amenities, who's going (longest phrase first) ----
  const setHit = (h: Hit) => {
    if (h.amenity) {
      if (!out.filters.amenities.includes(h.amenity)) {
        out.filters.amenities.push(h.amenity);
        out.chips.push({ key: `amenity:${h.amenity}`, label: h.label });
      }
      if (h.travellerType) out.filters.travellerType = h.travellerType;
      return;
    }
    if (h.travellerType) {
      out.filters.travellerType ??= h.travellerType;
      if (!out.chips.some((c) => c.key === 'travellerType')) out.chips.push({ key: 'travellerType', label: h.label });
      return;
    }
    if (h.mode && !h.category) {
      out.filters.mode = h.mode;
      if (!out.chips.some((c) => c.key === 'mode')) out.chips.push({ key: 'mode', label: h.label });
      return;
    }
    // "apartment" for a few nights means a stay; with months, bedrooms or rent it means a home.
    if (h.category && !out.filters.category) {
      out.filters.category = h.category;
      if (h.subtype) out.filters.subtype = h.subtype;
      out.chips.push({ key: 'category', label: h.label });
    } else if (h.category === out.filters.category && h.subtype && !out.filters.subtype) {
      out.filters.subtype = h.subtype;
      const c = out.chips.find((x) => x.key === 'category');
      if (c) c.label = h.label;
    }
  };
  const sorted = [...PHRASES].sort((a, b) => b[0].length - a[0].length);
  const longStay = /\s(months?|year|lease|long term|relocat|moving)/.test(text);
  for (const [phrase, hit] of sorted) {
    const re = new RegExp(`\\s${phrase.replace(/\s/g, '\\s')}s?(?=\\s)`);
    if (re.test(text)) {
      text = text.replace(re, ' ');
      if (phrase === 'apartment' && !longStay && !out.filters.bedrooms) setHit({ category: 'stay', subtype: 'apartment', label: 'Apartment stay' });
      else setHit(hit);
    }
  }
  if (out.filters.bedrooms && out.filters.category === 'home' && !out.chips.some((c) => c.key === 'category')) out.chips.push({ key: 'category', label: 'Long-stay homes' });

  // ---- Typos: try leftover words against place names and category words ----
  const vocab: [string, () => void][] = [];
  for (const p of places) vocab.push([norm(p.name).split(' ')[0], () => { if (!out.filters.city) { out.filters.city = p.slug; out.chips.push({ key: 'city', label: p.name }); } }]);
  for (const [phrase, hit] of PHRASES) if (!phrase.includes(' ') && phrase.length >= 4) vocab.push([phrase, () => setHit(hit)]);
  const leftovers = text.split(' ').filter(Boolean);
  const keep: string[] = [];
  for (const w of leftovers) {
    if (FILLER.has(w) || /^\d+$/.test(w)) continue;
    const hit = vocab.find(([v]) => v !== w && fuzzyOk(w, v));
    if (hit) {
      out.corrections.push({ from: w, to: hit[0] });
      hit[1]();
    } else keep.push(w);
  }
  out.rest = keep.join(' ').trim();
  if (out.filters.category) {
    const settle = ['home', 'furniture', 'home_services', 'utilities', 'grooming'].includes(out.filters.category);
    out.filters.mode = settle ? 'settle' : 'visit';
  }
  return out;
}
