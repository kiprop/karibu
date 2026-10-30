/**
 * Development and demo seed data. Every business, phone number and price here is an invented
 * example (listings are flagged is_sample, prices is_example) and must be replaced by field-team data.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from './pool.js';

const countries = [
  ['KE', 'Kenya', 'KES', 'Africa/Nairobi', ['en', 'sw'], true, 1],
  ['TZ', 'Tanzania', 'TZS', 'Africa/Dar_es_Salaam', ['sw', 'en'], false, 3],
  ['UG', 'Uganda', 'UGX', 'Africa/Kampala', ['en', 'sw'], false, 4],
  ['RW', 'Rwanda', 'RWF', 'Africa/Kigali', ['rw', 'en', 'fr'], false, 4],
  ['ET', 'Ethiopia', 'ETB', 'Africa/Addis_Ababa', ['am', 'en'], false, 5],
] as const;

// [country, name, slug, kind, lat, lon, live]
const cities: Array<[string, string, string, string, number, number, boolean]> = [
  ['KE', 'Nairobi', 'nairobi', 'city', -1.2864, 36.8172, true],
  ['KE', 'Maasai Mara', 'maasai-mara', 'park', -1.4061, 35.017, true],
  ['KE', 'Amboseli', 'amboseli', 'park', -2.6527, 37.2606, true],
  ['KE', 'Samburu', 'samburu', 'park', 0.615, 37.53, true],
  ['KE', 'Naivasha', 'naivasha', 'town', -0.7167, 36.4333, true],
  ['KE', 'Nakuru', 'nakuru', 'town', -0.3031, 36.08, true],
  ['KE', 'Mombasa', 'mombasa', 'city', -4.0435, 39.6682, false],
  ['KE', 'Diani', 'diani', 'beach', -4.2795, 39.594, false],
  ['KE', 'Lamu', 'lamu', 'town', -2.2717, 40.902, false],
  ['TZ', 'Arusha', 'arusha', 'city', -3.3869, 36.683, false],
  ['TZ', 'Zanzibar', 'zanzibar', 'beach', -6.1622, 39.1921, false],
  ['UG', 'Kampala', 'kampala', 'city', 0.3476, 32.5825, false],
  ['UG', 'Bwindi', 'bwindi', 'park', -1.05, 29.7, false],
  ['RW', 'Kigali', 'kigali', 'city', -1.9441, 30.0619, false],
  ['ET', 'Addis Ababa', 'addis-ababa', 'city', 9.03, 38.74, false],
];

type L = {
  vendor: string; city: string; category: string; subtype: string; title: string; summary: string; description: string;
  lat: number; lon: number; budget?: string; from?: number; to?: number; unit: string; attributes: object; amenities: string[];
  level: number; featured?: boolean; private?: boolean;
};

const listings: L[] = [
  { vendor: 'Malaika Lake Camps', city: 'naivasha', category: 'stay', subtype: 'tented camp', title: 'Lakeside tented camp at Naivasha',
    summary: 'Canvas tents on the lake shore with hot showers, solar power and hippos at dusk.',
    description: 'A family-run camp 90 minutes from Nairobi. Each tent has an en-suite bathroom, a private deck and solar charging. Boat trips to Crescent Island and cycling in Hell’s Gate can be arranged.',
    lat: -0.7696, lon: 36.3653, budget: 'mid', from: 12000, to: 16000, unit: 'per night',
    attributes: { setting: 'lake', hotWaterHours: '24 hours (solar with gas backup)', wifiMbps: 12, rooms: 14 }, amenities: ['hot_water', 'wifi', 'solar', 'breakfast', 'parking', 'family_rooms'], level: 3 },
  { vendor: 'Ewaso River Lodge', city: 'samburu', category: 'stay', subtype: 'safari lodge', title: 'Riverside cottages in Samburu',
    summary: 'Stone cottages on the Ewaso Nyiro river, a quieter alternative to the Mara.',
    description: 'Twelve cottages with river views, full board, and game drives in the reserve for the "Samburu Special Five".',
    lat: 0.5679, lon: 37.5415, budget: 'mid', from: 18000, to: 26000, unit: 'per night',
    attributes: { setting: 'bush', hotWaterHours: '6am to 10pm', nearestGate: 'Archer’s Post Gate, 15 min', rooms: 12 }, amenities: ['hot_water', 'power_backup', 'pool', 'meals_included'], level: 2 },
  { vendor: 'Talek Plains Camp', city: 'maasai-mara', category: 'stay', subtype: 'tented camp', title: 'Mid-range tented camp near Talek Gate',
    summary: 'Comfortable tents close to the reserve, with reliable hot water and Wi-Fi in the lounge.',
    description: 'A good-value base for the Mara: 20 tents, all meals, and early starts for game drives from the gate.',
    lat: -1.4423, lon: 35.2224, budget: 'mid', from: 15000, to: 22000, unit: 'per night',
    attributes: { setting: 'bush', hotWaterHours: '24 hours', wifiMbps: 8, nearestGate: 'Talek Gate, 5 min' }, amenities: ['hot_water', 'wifi', 'power_backup', 'meals_included', 'family_rooms'], level: 2, featured: true },
  { vendor: 'Westlands Garden Suites', city: 'nairobi', category: 'stay', subtype: 'hotel', title: 'Garden hotel in Westlands',
    summary: 'Quiet rooms near restaurants and offices, 35 minutes from the airport off-peak.',
    description: 'A 40-room hotel with a garden, airport pickups and a backup generator.',
    lat: -1.2648, lon: 36.8045, budget: 'mid', from: 9500, to: 14000, unit: 'per night',
    attributes: { setting: 'city', wifiMbps: 40, rooms: 40 }, amenities: ['hot_water', 'wifi', 'power_backup', 'breakfast', 'airport_pickup', 'parking'], level: 2 },
  { vendor: 'Amboseli View Resort', city: 'amboseli', category: 'stay', subtype: 'resort', title: 'Resort with Kilimanjaro views',
    summary: 'Pool, spa and family rooms facing Kilimanjaro, outside Kimana Gate.',
    description: 'A larger resort for families who want comfort between game drives.',
    lat: -2.7967, lon: 37.5237, budget: 'premium', from: 32000, to: 48000, unit: 'per night',
    attributes: { setting: 'bush', nearestGate: 'Kimana Gate, 10 min', rooms: 60 }, amenities: ['hot_water', 'wifi', 'pool', 'family_rooms', 'meals_included', 'power_backup'], level: 2 },
  { vendor: 'Mara Pop-Top Safaris', city: 'maasai-mara', category: 'safari', subtype: 'full-day game drive', title: 'Full-day Mara game drive, private pop-top',
    summary: 'Private Land Cruiser with a licensed driver-guide, picnic lunch and window seats for all.',
    description: 'Pickup from camps around Talek and Sekenani. Park fees are paid separately at the gate and are not included.',
    lat: -1.4423, lon: 35.2224, from: 25000, to: 30000, unit: 'per vehicle per day',
    attributes: { park: 'Maasai Mara National Reserve', format: 'private', vehicle: 'Pop-top Land Cruiser, 6 seats', pickup: 'Camps near Talek and Sekenani', durationHours: 9, guideLanguages: ['English', 'Swahili', 'German'], bestMonths: [7, 8, 9, 10] },
    amenities: ['pop_top_roof', 'window_seats', 'vehicle_charging', 'vehicle_fridge'], level: 2 },
  { vendor: 'City Park Safaris', city: 'nairobi', category: 'safari', subtype: 'half-day game drive', title: 'Half-day Nairobi National Park drive',
    summary: 'Lions and rhinos with the city skyline behind them, back in time for lunch.',
    description: 'Hotel pickup at 6am, about four hours in the park. Park entry fees are extra.',
    lat: -1.3733, lon: 36.8589, from: 9000, to: 12000, unit: 'per person',
    attributes: { park: 'Nairobi National Park', format: 'shared', vehicle: 'Safari van with pop-top', pickup: 'Nairobi hotels', durationHours: 4.5, guideLanguages: ['English', 'Swahili'] },
    amenities: ['pop_top_roof', 'window_seats'], level: 2 },
  { vendor: 'Rift Overland', city: 'nairobi', category: 'safari', subtype: 'multi-day safari', title: '4-day Mara and Naivasha safari',
    summary: 'Shared or private trip with mid-range camps, park fees and meals included.',
    description: 'Day 1 Nairobi to the Mara, day 2 full-day drive, day 3 Naivasha boat trip, day 4 back to Nairobi.',
    lat: -1.2921, lon: 36.8219, from: 95000, to: 140000, unit: 'per person',
    attributes: { park: 'Maasai Mara and Lake Naivasha', format: 'shared', vehicle: 'Pop-top Land Cruiser', pickup: 'Nairobi hotels or airport', durationHours: 96, guideLanguages: ['English'], bestMonths: [1, 2, 6, 7, 8, 9, 10, 12] },
    amenities: ['pop_top_roof', 'window_seats', 'park_fees_included', 'meals_included'], level: 3 },
  { vendor: 'Wanjiru Rides', city: 'nairobi', category: 'transport', subtype: 'airport transfer', title: 'Airport transfers and city rides',
    summary: 'Licensed, insured driver with a 7-seat van. Meets you in arrivals with a name board.',
    description: 'JKIA and Wilson Airport pickups, day hire in Nairobi, and trips to Naivasha.',
    lat: -1.2921, lon: 36.8219, from: 2500, to: 4500, unit: 'per group',
    attributes: { vehicle: 'Toyota Noah', seats: 7, routes: [{ from: 'JKIA', to: 'Westlands', priceFrom: 2500, priceTo: 3500 }, { from: 'JKIA', to: 'Karen', priceFrom: 3000, priceTo: 4500 }] },
    amenities: ['airport_pickup'], level: 2 },
  { vendor: 'Rift Valley Air Desk', city: 'nairobi', category: 'transport', subtype: 'bush flight desk', title: 'Bush flight seats from Wilson Airport',
    summary: 'Help booking scheduled flights to the Mara, Samburu, Amboseli and Lamu in one message.',
    description: 'We check seats with scheduled carriers and confirm in writing. Soft bags only on light aircraft.',
    lat: -1.3217, lon: 36.8148, from: 23000, to: 45000, unit: 'per seat',
    attributes: { baggageKg: 15 }, amenities: [], level: 2 },
  { vendor: 'Grace Walks Nairobi', city: 'nairobi', category: 'guide', subtype: 'food walk', title: 'Street food walk with a local friend',
    summary: 'Three hours of nyama choma, mutura and market stalls, with prices agreed up front.',
    description: 'Small groups, vegetarian options, and tips on what things should cost.',
    lat: -1.2833, lon: 36.8219, from: 3000, to: 3000, unit: 'per person',
    attributes: { languages: ['English', 'Swahili'], maxGroup: 6, durationHours: 3 }, amenities: ['family_friendly'], level: 2 },
  { vendor: 'Kilimani Kitchen Table', city: 'nairobi', category: 'experience', subtype: 'cooking class', title: 'Home cooking class: Swahili coast dishes',
    summary: 'Cook pilau and coconut fish with a home chef. Exact address shared after you message.',
    description: 'Hands-on class for up to six people, ending with lunch together.',
    lat: -1.2921, lon: 36.7836, from: 6500, to: 6500, unit: 'per person',
    attributes: { durationHours: 3, minAge: 8, fitness: 'easy' }, amenities: ['family_friendly'], level: 3, private: true },
  { vendor: 'Ngong Ridge Guides', city: 'nairobi', category: 'experience', subtype: 'day trip', title: 'Ngong Hills sunrise hike',
    summary: 'Guided ridge walk with transport from Nairobi and breakfast at the top.',
    description: 'Moderate hike of about 4 hours with a ranger-escorted section.',
    lat: -1.395, lon: 36.6403, from: 4500, to: 4500, unit: 'per person',
    attributes: { durationHours: 7, minAge: 10, fitness: 'moderate', permitNeeded: false }, amenities: [], level: 2 },
  { vendor: 'Westlands Jazz Collective', city: 'nairobi', category: 'event', subtype: 'music', title: 'Thursday Afro-jazz session',
    summary: 'Live Afro-jazz quartet in a small venue, food available.',
    description: 'Weekly session; dates confirmed by the organiser each week.',
    lat: -1.2676, lon: 36.8108, from: 1500, to: 2500, unit: 'per ticket',
    attributes: { venue: 'Westlands' }, amenities: [], level: 2 },
];

export async function seed() {
  await tx(async (c) => {
    for (const [code, name, cur, tz, langs, live, wave] of countries) {
      await c.query(
        `INSERT INTO countries (code, name, currency, time_zone, languages, is_live, launch_wave) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (code) DO UPDATE SET is_live = EXCLUDED.is_live, launch_wave = EXCLUDED.launch_wave`,
        [code, name, cur, tz, langs, live, wave],
      );
    }
    for (const [cc, name, slug, kind, lat, lon, live] of cities) {
      await c.query(
        `INSERT INTO cities (country_code, name, slug, kind, location, is_live) VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($6,$5),4326)::geography, $7)
         ON CONFLICT (slug) DO UPDATE SET is_live = EXCLUDED.is_live`,
        [cc, name, slug, kind, lat, lon, live],
      );
    }
    const admin = await c.query(
      `INSERT INTO users (email, display_name, role) VALUES ('admin@karibu.example', 'Karibu Admin', 'admin')
       ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id`,
    );
    const adminId = admin.rows[0].id;
    await c.query(`SELECT set_config('app.actor', $1, true)`, [adminId]);

    let n = 0;
    for (const l of listings) {
      n++;
      const slug = l.vendor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const phone = `+2547000001${String(n).padStart(2, '0')}`;
      const v = await c.query(
        `INSERT INTO vendors (name, slug, country_code, whatsapp_e164, phone_e164, email, verification_level, verified_at, reverify_due, plan)
         VALUES ($1,$2,'KE',$3,$3,$4,$5, now(), (current_date + interval '12 months')::date, $6)
         ON CONFLICT (slug) DO UPDATE SET verification_level = EXCLUDED.verification_level RETURNING id`,
        [l.vendor, slug, phone, `hello+${slug}@example.com`, l.level, l.featured ? 'featured' : 'free'],
      );
      const city = await c.query(`SELECT id FROM cities WHERE slug = $1`, [l.city]);
      const lslug = l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const exists = await c.query(`SELECT id FROM listings WHERE slug = $1`, [lslug]);
      if (exists.rows[0]) continue;
      const ins = await c.query(
        `INSERT INTO listings (vendor_id, city_id, category, subtype, title, slug, summary, description, location, location_is_private, budget_tier,
                               currency, price_from, price_to, price_unit, attributes, amenities, is_sample, featured_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_MakePoint($9,$10),4326)::geography, $11, $12, 'KES', $13, $14, $15, $16, $17, true, $18)
         RETURNING id`,
        [v.rows[0].id, city.rows[0].id, l.category, l.subtype, l.title, lslug, l.summary, l.description, l.lon, l.lat, l.private ?? false,
         l.budget ?? null, l.from ?? null, l.to ?? null, l.unit, JSON.stringify(l.attributes), l.amenities, l.featured ? new Date(Date.now() + 30 * 86400e3) : null],
      );
      const id = ins.rows[0].id;
      await c.query(`UPDATE listings SET status = 'submitted' WHERE id = $1`, [id]);
      await c.query(`UPDATE listings SET status = 'in_review' WHERE id = $1`, [id]);
      await c.query(`UPDATE listings SET status = 'live' WHERE id = $1`, [id]);
      if (l.category === 'event') {
        for (let w = 0; w < 4; w++) {
          await c.query(
            `INSERT INTO event_dates (listing_id, starts_at, ends_at, confirmed_at)
             VALUES ($1, (date_trunc('week', now() AT TIME ZONE 'Africa/Nairobi') + make_interval(days => 3 + 7*$2, hours => 19, mins => 30)) AT TIME ZONE 'Africa/Nairobi',
                         (date_trunc('week', now() AT TIME ZONE 'Africa/Nairobi') + make_interval(days => 3 + 7*$2, hours => 23)) AT TIME ZONE 'Africa/Nairobi', now())`,
            [id, w],
          );
        }
      }
    }

    // A pending vendor submission so the admin queue has work in it.
    const pending = await c.query(
      `INSERT INTO vendors (name, slug, country_code, whatsapp_e164) VALUES ('Gigiri Supper Club','gigiri-supper-club','KE','+254700000199')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const nbo = await c.query(`SELECT id FROM cities WHERE slug = 'nairobi'`);
    const pend = await c.query(
      `INSERT INTO listings (vendor_id, city_id, category, subtype, title, slug, summary, location, currency, price_from, price_to, price_unit, is_sample)
       VALUES ($1,$2,'event','food','Rooftop supper club','rooftop-supper-club','Five-course tasting menu on a rooftop.', ST_SetSRID(ST_MakePoint(36.8044,-1.2335),4326)::geography,'KES',7000,9000,'per ticket',true)
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [pending.rows[0].id, nbo.rows[0].id],
    );
    if (pend.rows[0]) await c.query(`UPDATE listings SET status = 'submitted' WHERE id = $1`, [pend.rows[0].id]);

    await c.query(`DELETE FROM country_pages WHERE country_code = 'KE'`);
    const pages: Array<[string, string, string, string[]]> = [
      ['entry', 'Entry and eTA',
        'Most visitors need an approved Electronic Travel Authorisation (eTA) before boarding a flight to Kenya, and airlines check it at check-in. Many African nationals and East African Community citizens are exempt. Apply only on the official government portal; other sites charge extra fees.',
        ['https://www.etakenya.go.ke']],
      ['health', 'Health',
        'Check vaccination requirements for your route with a travel clinic, including whether you need a yellow fever certificate if you arrive from or transit through a country with yellow fever. Malaria is present in many areas outside Nairobi; ask a clinic about prevention.',
        []],
      ['money', 'Money and M-Pesa',
        'Cards work in hotels and malls. Small businesses, drivers and markets prefer M-Pesa or cash in Kenyan shillings. Ask the price before you order or ride. Never pay a booking to a personal mobile money number you cannot verify; use Check an operator first.',
        []],
      ['sim', 'SIM and data',
        'You can buy a local SIM at the airport or in town with your passport, or use an eSIM. Mobile data is widely available in towns; coverage in parks varies.',
        []],
      ['getting-around', 'Getting around',
        'Use a verified driver, a ride-hailing app or a hotel taxi, especially at night. Agree fares before you set off. Scheduled bush flights have soft-bag baggage limits.',
        []],
      ['safety', 'Safety',
        'Keep valuables out of sight, use verified transport at night, and meet people you know only from online in busy public places. In an emergency call 999 or 112.',
        []],
    ];
    for (const [slug, title, body, src] of pages) {
      await c.query(`INSERT INTO country_pages (country_code, slug, title, body_md, source_urls, last_reviewed_on) VALUES ('KE',$1,$2,$3,$4, current_date)`, [slug, title, body, src]);
    }
    await c.query(`DELETE FROM emergency_contacts WHERE country_code = 'KE'`);
    const contacts: Array<[string, string, string, string | null, string | null]> = [
      ['emergency', 'Police, fire and ambulance', '999', null, null],
      ['emergency', 'Emergency, any network', '112', null, null],
      ['embassy', 'Embassy of the United States, Nairobi', 'https://ke.usembassy.gov', 'US', 'https://ke.usembassy.gov'],
      ['embassy', 'British High Commission, Nairobi', 'https://www.gov.uk/world/kenya', 'GB', 'https://www.gov.uk/world/kenya'],
    ];
    for (const [kind, label, value, nat, src] of contacts) {
      await c.query(
        `INSERT INTO emergency_contacts (country_code, kind, label, value, nationality, source_url, last_reviewed_on) VALUES ('KE',$1,$2,$3,$4,$5, current_date)`,
        [kind, label, value, nat, src],
      );
    }
    await c.query(`DELETE FROM price_checks WHERE is_example`);
    const prices: Array<[string, string, string, number, number]> = [
      ['food', 'Plate of ugali with stew', 'Street stall', 150, 350],
      ['food', 'Chapati', 'Street stall', 20, 50],
      ['food', 'Soda, 500 ml', 'Kiosk', 60, 100],
      ['food', 'Local beer', 'Bar, Westlands', 300, 450],
      ['transport', 'Boda ride, about 2 km', 'Within a neighbourhood', 100, 200],
      ['transport', 'Matatu ride in town', 'CBD routes', 50, 100],
      ['transport', 'Ride-hail car, CBD to Westlands', 'Off-peak', 350, 600],
      ['transport', 'Airport taxi to Westlands', 'Agree before you leave', 2500, 3500],
    ];
    for (const [g, item, area, lo, hi] of prices) {
      await c.query(`INSERT INTO price_checks (city_id, group_name, item, area, currency, low, high, checked_on, is_example) VALUES ($1,$2,$3,$4,'KES',$5,$6, current_date, true)`, [nbo.rows[0].id, g, item, area, lo, hi]);
    }
    await c.query(
      `INSERT INTO operator_watchlist (name, reason, added_by) SELECT 'Splendor Holiday', 'Travellers reported requests for payment to a personal mobile money number for Mara bookings (example entry).', $1
       WHERE NOT EXISTS (SELECT 1 FROM operator_watchlist WHERE name = 'Splendor Holiday')`,
      [adminId],
    );
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed()
    .then(() => {
      console.log('seeded');
      return pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
