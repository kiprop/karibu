import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { requireUser } from '../auth.js';
import { ALL_STEPS, BEFORE_YOU_GO, SETTLE_IN } from '../lib/checklists.js';
import { SETTLE_CATEGORIES } from '../lib/categories.js';
import { TRAVELLER_TYPES } from './public.js';
import { notFound } from '../lib/util.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const profileShape = z.object({
  mode: z.enum(['visit', 'settle']).nullable().optional(),
  passportCountry: z.string().length(2).toUpperCase().nullable().optional(),
  arrivingOn: isoDate.nullable().optional(),
  leavingOn: isoDate.nullable().optional(),
  baseCity: z.string().max(80).nullable().optional(),
  travellerType: z.enum(TRAVELLER_TYPES).nullable().optional(),
  partySize: z.coerce.number().int().min(1).max(30).nullable().optional(),
  budget: z.enum(['budget', 'mid', 'premium']).nullable().optional(),
  language: z.enum(['en', 'sw']).optional(),
});
type Profile = z.infer<typeof profileShape>;

const CARD = `pl.id, pl.slug, pl.title, pl.summary, pl.category, pl.subtype, pl.currency, pl.price_from AS "priceFrom", pl.price_to AS "priceTo",
  pl.price_unit AS "priceUnit", pl.city_name AS city, pl.city_slug AS "citySlug", pl.verification_level AS "verificationLevel", pl.is_sample AS "isSample",
  (SELECT url FROM listing_photos p WHERE p.listing_id = pl.id ORDER BY position LIMIT 1) AS "photoUrl"`;

async function loadProfile(req: FastifyRequest): Promise<Profile> {
  // Guests send their (device-only) profile as query parameters; signed-in people have it stored.
  const fromQuery = profileShape.partial().parse(req.query ?? {});
  if (!req.user) return fromQuery;
  const { rows } = await q(
    `SELECT mode, passport_country AS "passportCountry", to_char(arriving_on, 'YYYY-MM-DD') AS "arrivingOn", to_char(leaving_on, 'YYYY-MM-DD') AS "leavingOn",
            base_city AS "baseCity", traveller_type AS "travellerType", party_size AS "partySize", budget, language
       FROM traveller_profiles WHERE user_id = $1`,
    [req.user.id],
  );
  return { ...fromQuery, ...Object.fromEntries(Object.entries(rows[0] ?? {}).filter(([, v]) => v !== null)) };
}

/** Where someone is in their journey, from their dates. */
function phaseOf(p: Profile, today: string) {
  if (p.mode === 'settle') return p.arrivingOn && p.arrivingOn > today ? 'moving_soon' : 'settling';
  if (!p.arrivingOn) return 'planning';
  if (p.arrivingOn > today) {
    const days = Math.round((Date.parse(p.arrivingOn) - Date.parse(today)) / 864e5);
    return days <= 14 ? 'arriving_soon' : 'planning';
  }
  if (!p.leavingOn || p.leavingOn >= today) return 'here';
  return 'home_again';
}

function monthsBetween(a?: string | null, b?: string | null) {
  const now = new Date();
  if (!a) return [now.getMonth() + 1];
  const start = new Date(a);
  const end = b ? new Date(b) : start;
  const out = new Set<number>();
  for (let d = new Date(start); d <= end && out.size < 12; d.setMonth(d.getMonth() + 1)) out.add(d.getMonth() + 1);
  out.add(end.getMonth() + 1);
  return [...out];
}

export async function companionRoutes(app: FastifyInstance) {
  // ---------------- Profile ----------------
  app.get('/me/profile', async (req) => {
    requireUser(req);
    return { profile: await loadProfile(req) };
  });

  app.put('/me/profile', async (req) => {
    const u = requireUser(req);
    const b = profileShape.parse(req.body);
    if (b.arrivingOn && b.leavingOn && b.leavingOn < b.arrivingOn) throw notFound('Leaving must be on or after arriving');
    await q(
      `INSERT INTO traveller_profiles (user_id, mode, passport_country, arriving_on, leaving_on, base_city, traveller_type, party_size, budget, language, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,'en'), now())
       ON CONFLICT (user_id) DO UPDATE SET mode = $2, passport_country = $3, arriving_on = $4, leaving_on = $5, base_city = $6,
              traveller_type = $7, party_size = $8, budget = $9, language = coalesce($10, traveller_profiles.language), updated_at = now()`,
      [u.id, b.mode ?? null, b.passportCountry ?? null, b.arrivingOn ?? null, b.leavingOn ?? null, b.baseCity ?? null, b.travellerType ?? null, b.partySize ?? null, b.budget ?? null, b.language ?? null],
    );
    return { ok: true };
  });

  app.put('/me/checklist/:key', async (req) => {
    const u = requireUser(req);
    const { key } = z.object({ key: z.string().max(60) }).parse(req.params);
    const { done } = z.object({ done: z.boolean() }).parse(req.body);
    if (!ALL_STEPS.some((s) => s.key === key)) throw notFound('Unknown step');
    if (done) await q(`INSERT INTO checklist_progress (user_id, step_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [u.id, key]);
    else await q(`DELETE FROM checklist_progress WHERE user_id = $1 AND step_key = $2`, [u.id, key]);
    return { ok: true };
  });

  // ---------------- The companion: what matters to this person today ----------------
  app.get('/companion', async (req) => {
    const p = await loadProfile(req);
    const country = 'KE';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const phase = phaseOf(p, today);
    const steps = p.mode === 'settle' ? SETTLE_IN : BEFORE_YOU_GO;
    const done = req.user ? (await q(`SELECT step_key FROM checklist_progress WHERE user_id = $1`, [req.user.id])).rows.map((r) => r.step_key as string) : [];
    const who = req.user ? { col: 'e.user_id', val: req.user.id } : req.deviceId ? { col: 'e.device_id', val: req.deviceId } : null;

    const [todayPlan, next, advisories, howWasIt, seasons, emergency, airport, city] = await Promise.all([
      req.user
        ? q(
            `SELECT ti.id, ti.time_label AS "timeLabel", ti.note, l.slug, l.title, l.category, c.name AS city, v.whatsapp_e164 AS whatsapp, t.title AS trip, t.id AS "tripId"
               FROM trip_items ti JOIN trips t ON t.id = ti.trip_id LEFT JOIN listings l ON l.id = ti.listing_id
               LEFT JOIN cities c ON c.id = l.city_id LEFT JOIN vendors v ON v.id = l.vendor_id
              WHERE ti.day = $2 AND (t.owner_id = $1 OR EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = t.id AND m.user_id = $1))
              ORDER BY ti.position`,
            [req.user.id, today],
          )
        : Promise.resolve({ rows: [] }),
      req.user
        ? q(
            `SELECT ti.day, ti.time_label AS "timeLabel", ti.note, l.slug, l.title, c.name AS city, t.title AS trip, t.id AS "tripId"
               FROM trip_items ti JOIN trips t ON t.id = ti.trip_id LEFT JOIN listings l ON l.id = ti.listing_id LEFT JOIN cities c ON c.id = l.city_id
              WHERE ti.day > $2 AND (t.owner_id = $1 OR EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id = t.id AND m.user_id = $1))
              ORDER BY ti.day, ti.position LIMIT 5`,
            [req.user.id, today],
          )
        : Promise.resolve({ rows: [] }),
      q(
        `SELECT a.id, a.message, c.name AS city FROM advisories a LEFT JOIN cities c ON c.id = a.city_id
          WHERE a.country_code = $1 AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now()) ORDER BY a.starts_at DESC LIMIT 5`,
        [country],
      ),
      // "How was it?" two days after messaging a business, if they haven't shared an experience yet.
      who
        ? q(
            `SELECT DISTINCT ON (e.listing_id) e.id AS "enquiryId", e.ref_code AS ref, e.created_at AS "contactedAt", l.slug, l.title, v.name AS vendor
               FROM enquiries e JOIN listings l ON l.id = e.listing_id JOIN vendors v ON v.id = e.vendor_id
              WHERE ${who.col} = $1 AND e.created_at < now() - interval '2 days' AND e.created_at > now() - interval '60 days'
                AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.listing_id = e.listing_id AND (r.enquiry_id = e.id OR ($2::uuid IS NOT NULL AND r.user_id = $2)))
              ORDER BY e.listing_id, e.created_at DESC LIMIT 3`,
            [who.val, req.user?.id ?? null],
          )
        : Promise.resolve({ rows: [] }),
      q(
        `SELECT s.note, s.kind, s.months, s.category, c.name AS city, s.city_slug AS "citySlug" FROM season_notes s LEFT JOIN cities c ON c.slug = s.city_slug
          WHERE s.country_code = $1 AND s.months && $2::smallint[]
          ORDER BY (s.city_slug = $3) DESC NULLS LAST, s.city_slug IS NULL DESC, s.kind LIMIT 4`,
        [country, monthsBetween(p.arrivingOn, p.leavingOn), p.baseCity ?? null],
      ),
      q(`SELECT kind, label, value FROM emergency_contacts WHERE country_code = $1 AND kind IN ('emergency','police','ambulance','tourist_police') ORDER BY kind LIMIT 4`, [country]),
      q(
        `SELECT p.item, p.low, p.high, p.currency, c.name AS city, p.checked_on AS "checkedOn" FROM price_checks p JOIN cities c ON c.id = p.city_id
          WHERE c.country_code = $1 AND p.item ILIKE '%airport%' ORDER BY p.checked_on DESC LIMIT 2`,
        [country],
      ),
      p.baseCity ? q(`SELECT name, slug FROM cities WHERE slug = $1`, [p.baseCity]) : Promise.resolve({ rows: [] }),
    ]);

    const daysToGo = p.arrivingOn ? Math.round((Date.parse(p.arrivingOn) - Date.parse(today)) / 864e5) : null;
    return {
      today,
      phase,
      profile: p,
      daysToGo,
      city: city.rows[0] ?? null,
      plan: { today: todayPlan.rows, next: next.rows },
      advisories: advisories.rows,
      howWasIt: howWasIt.rows,
      seasons: seasons.rows,
      emergency: emergency.rows,
      fairPrices: airport.rows,
      checklist: {
        title: p.mode === 'settle' ? 'Your first month' : 'Before you go and when you land',
        steps: steps.map((s) => ({ ...s, done: done.includes(s.key) })),
        saved: !!req.user,
      },
    };
  });

  // ---------------- Suggestions, each with the reason it's shown ----------------
  app.get('/suggestions', async (req) => {
    const f = z.object({
      saved: z.string().max(2000).optional(), // guest favourites, comma-separated ids
      mode: z.enum(['visit', 'settle']).optional(),
      city: z.string().max(80).optional(),
      exclude: z.string().max(2000).optional(),
      limit: z.coerce.number().int().min(1).max(12).default(8),
    }).parse(req.query);
    const p = await loadProfile(req);
    const mode = f.mode ?? p.mode ?? 'visit';
    const city = f.city ?? p.baseCity ?? null;
    const savedIds = req.user
      ? (await q(`SELECT listing_id FROM favourites WHERE user_id = $1`, [req.user.id])).rows.map((r) => r.listing_id as string)
      : (f.saved ?? '').split(',').filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 50);
    const exclude = new Set([...savedIds, ...(f.exclude ?? '').split(',').filter(Boolean)]);
    const out: { listing: Record<string, unknown>; reason: string; kind: string }[] = [];
    const add = (rows: Record<string, any>[], reason: (r: Record<string, any>) => string, kind: string) => {
      for (const r of rows) {
        if (out.length >= f.limit || exclude.has(r.id)) continue;
        exclude.add(r.id);
        out.push({ listing: r, reason: reason(r), kind });
      }
    };
    const settleCats = [...SETTLE_CATEGORIES];
    const modeFilter = mode === 'settle' ? `pl.category = ANY($9::listing_category[])` : `NOT (pl.category = ANY($9::listing_category[]))`;
    const base = (extra: string) => `SELECT ${CARD} ${extra} FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id`;

    // 1. Like what you saved: same kind of place in the same area.
    if (savedIds.length) {
      const { rows } = await q(
        `WITH s AS (SELECT id, title, category, city_slug, subtype FROM public_listings WHERE id = ANY($1::uuid[]))
         ${base(`, (SELECT title FROM s WHERE s.category = pl.category ORDER BY (s.city_slug = pl.city_slug) DESC, (s.subtype = pl.subtype) DESC LIMIT 1) AS "because"`)}
          WHERE pl.category IN (SELECT category FROM s) AND NOT pl.id = ANY($1::uuid[])
          ORDER BY (pl.city_slug IN (SELECT city_slug FROM s)) DESC, (pl.subtype IN (SELECT subtype FROM s)) DESC, pl.verification_level DESC, r.rating DESC NULLS LAST
          LIMIT 6`,
        [savedIds],
      );
      add(rows, (r) => `Because you saved ${r.because}`, 'saved');
    }

    // 2. People who contacted the same businesses also contacted these.
    if (savedIds.length || req.user || req.deviceId) {
      const { rows } = await q(
        `WITH mine AS (
           SELECT listing_id FROM enquiries WHERE ($1::uuid IS NOT NULL AND user_id = $1) OR ($2::text IS NOT NULL AND device_id = $2)
           UNION SELECT unnest($3::uuid[])),
         others AS (SELECT DISTINCT coalesce(user_id::text, device_id) AS who FROM enquiries WHERE listing_id IN (SELECT listing_id FROM mine) AND coalesce(user_id::text, device_id) IS NOT NULL
                      AND NOT (($1::uuid IS NOT NULL AND user_id = $1) OR ($2::text IS NOT NULL AND device_id = $2)))
         ${base(`, count(*) OVER (PARTITION BY pl.id) AS n`)}
          JOIN enquiries e ON e.listing_id = pl.id AND coalesce(e.user_id::text, e.device_id) IN (SELECT who FROM others)
          WHERE pl.id NOT IN (SELECT listing_id FROM mine WHERE listing_id IS NOT NULL)
          ORDER BY n DESC LIMIT 12`,
        [req.user?.id ?? null, req.deviceId, savedIds],
      );
      const seen = new Set<string>();
      add(rows.filter((r) => !seen.has(r.id) && seen.add(r.id) && Number(r.n) >= 2), () => 'Travellers who contacted the same places also contacted this', 'together');
    }

    // 3. In season for their dates.
    const months = monthsBetween(p.arrivingOn, p.leavingOn);
    const season = await q(
      `SELECT DISTINCT ON (s.category, s.city_slug) s.note, s.category, s.city_slug FROM season_notes s
        WHERE s.country_code = 'KE' AND s.kind = 'highlight' AND s.months && $1::smallint[] AND s.category IS NOT NULL`,
      [months],
    );
    for (const sn of season.rows) {
      const { rows } = await q(
        `${base('')} WHERE pl.category = $1::listing_category AND ($2::text IS NULL OR pl.city_slug = $2)
          ORDER BY pl.verification_level DESC, r.rating DESC NULLS LAST LIMIT 3`,
        [sn.category, sn.city_slug],
      );
      add(rows, () => sn.note, 'season');
    }

    // 4. Loved by people like them.
    if (p.travellerType) {
      const { rows } = await q(
        `WITH t AS (SELECT listing_id, round(avg(rating), 1) AS rating FROM reviews WHERE status = 'published' AND traveller_type = $1
                     GROUP BY listing_id HAVING avg(rating) >= 4)
         ${base(`, t.rating AS "typeRating"`)} JOIN t ON t.listing_id = pl.id ORDER BY t.rating DESC LIMIT 4`,
        [p.travellerType],
      );
      const label = { solo: 'solo travellers', couple: 'couples', family: 'families', friends: 'groups of friends', business: 'business travellers', long_stay: 'people staying long', moving_home: 'people moving home' }[p.travellerType];
      add(rows, (r) => `Rated ${r.typeRating} by ${label}`, 'people');
    }

    // 5. Next on their settle-in plan.
    if (mode === 'settle' && req.user) {
      const done = (await q(`SELECT step_key FROM checklist_progress WHERE user_id = $1`, [req.user.id])).rows.map((r) => r.step_key);
      const nextStep = SETTLE_IN.find((s) => !done.includes(s.key) && s.action?.href.startsWith('/explore'));
      if (nextStep) {
        const u = new URLSearchParams(nextStep.action!.href.split('?')[1]);
        const { rows } = await q(
          `${base('')} WHERE pl.category = $1::listing_category AND ($2::text IS NULL OR pl.subtype = $2) AND ($3::text IS NULL OR pl.city_slug = $3)
            ORDER BY pl.verification_level DESC, r.rating DESC NULLS LAST LIMIT 3`,
          [u.get('category'), u.get('subtype'), city],
        );
        add(rows, () => `Next on your first-month plan: ${nextStep.title.toLowerCase()}`, 'plan');
      }
    }

    // 6. The best-checked places nearby, so there's always something useful.
    const { rows: top } = await q(
      `${base('')} WHERE ($1::text IS NULL OR pl.city_slug = $1) AND ${modeFilter.replace('$9', '$2')}
        ORDER BY pl.verification_level DESC, coalesce(r.review_count, 0) >= 3 DESC, r.rating DESC NULLS LAST, pl.last_confirmed_at DESC LIMIT 8`,
      [city, settleCats],
    );
    add(top, (r) => (r.verificationLevel >= 3 ? `Visited in person by our team${city ? ` in ${r.city}` : ''}` : `Checked by our team${city ? ` in ${r.city}` : ''}`), 'checked');

    return { suggestions: out, note: 'Suggestions never include paid placement. Featured listings are labelled separately.' };
  });
}
