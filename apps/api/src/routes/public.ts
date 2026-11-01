import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { AMENITIES, CATEGORIES, SUBTYPES } from '../lib/categories.js';
import { badRequest, notFound, whatsappUrl } from '../lib/util.js';

const CARD_FIELDS = `
  pl.id, pl.slug, pl.title, pl.summary, pl.category, pl.subtype, pl.budget_tier AS "budgetTier",
  pl.currency, pl.price_from AS "priceFrom", pl.price_to AS "priceTo", pl.price_unit AS "priceUnit",
  pl.city_name AS "city", pl.city_slug AS "citySlug", pl.country_code AS "country",
  pl.vendor_name AS "vendorName", pl.verification_level AS "verificationLevel", pl.verified_at AS "verifiedAt",
  pl.is_featured AS "isFeatured", pl.is_sample AS "isSample", pl.amenities, pl.last_confirmed_at AS "lastConfirmedAt",
  ST_Y(pl.location::geometry) AS lat, ST_X(pl.location::geometry) AS lon,
  (SELECT url FROM listing_photos p WHERE p.listing_id = pl.id ORDER BY position LIMIT 1) AS "photoUrl",
  r.rating, coalesce(r.review_count, 0) AS "reviewCount"`;

const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  city: z.string().max(80).optional(),
  category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
  subtype: z.string().max(60).optional(),
  budget: z.enum(['budget', 'mid', 'premium']).optional(),
  minLevel: z.coerce.number().int().min(1).max(3).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  amenities: z.string().max(300).optional(), // comma-separated
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  ids: z.string().max(2000).optional(), // comma-separated listing ids (guest favourites)
  sort: z.enum(['relevance', 'rating', 'price', 'distance', 'newest']).default('relevance'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
});

export async function publicRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await q('SELECT 1');
    return { ok: true };
  });

  app.get('/meta', async () => ({ categories: SUBTYPES, amenities: AMENITIES }));

  app.get('/countries', async () => {
    const { rows } = await q(
      `SELECT code, name, currency, time_zone AS "timeZone", languages, is_live AS "isLive", launch_wave AS "launchWave"
         FROM countries ORDER BY launch_wave, name`,
    );
    return { countries: rows };
  });

  app.get('/cities', async (req) => {
    const { country } = z.object({ country: z.string().length(2).toUpperCase().optional() }).parse(req.query);
    const { rows } = await q(
      `SELECT c.id, c.name, c.slug, c.kind, c.country_code AS country, c.is_live AS "isLive",
              ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lon,
              (SELECT count(*) FROM public_listings pl WHERE pl.city_id = c.id) AS "listingCount"
         FROM cities c WHERE ($1::text IS NULL OR c.country_code = $1) ORDER BY c.is_live DESC, c.name`,
      [country ?? null],
    );
    return { cities: rows };
  });

  app.get('/listings', async (req) => {
    const f = searchQuery.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.country) where.push(`pl.country_code = ${p(f.country)}`);
    if (f.city) where.push(`pl.city_slug = ${p(f.city)}`);
    if (f.category) where.push(`pl.category = ${p(f.category)}::listing_category`);
    if (f.subtype) where.push(`pl.subtype = ${p(f.subtype)}`);
    if (f.budget) where.push(`pl.budget_tier = ${p(f.budget)}::budget_tier`);
    if (f.ids) {
      const ids = f.ids.split(',').filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 50);
      where.push(`pl.id = ANY(${p(ids)}::uuid[])`);
    }
    if (f.minLevel) where.push(`pl.verification_level >= ${p(f.minLevel)}`);
    if (f.priceMax !== undefined) where.push(`pl.price_from <= ${p(f.priceMax)}`);
    if (f.amenities) {
      const list = f.amenities.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.some((a) => !(AMENITIES as readonly string[]).includes(a))) throw badRequest('Unknown amenity filter');
      if (list.length) where.push(`pl.amenities @> ${p(list)}::text[]`);
    }
    let tsq = '';
    if (f.q) {
      tsq = p(f.q);
      where.push(`(pl.search_doc @@ websearch_to_tsquery('simple', unaccent(${tsq})) OR pl.title % ${tsq} OR pl.city_name ILIKE '%' || ${tsq} || '%')`);
    }
    let dist = 'NULL::float';
    if (f.lat !== undefined && f.lon !== undefined) {
      const pt = `ST_SetSRID(ST_MakePoint(${p(f.lon)}, ${p(f.lat)}), 4326)::geography`;
      dist = `ST_Distance(pl.location, ${pt})`;
      if (f.radiusKm) where.push(`ST_DWithin(pl.location, ${pt}, ${p(f.radiusKm * 1000)})`);
    } else if (f.sort === 'distance') {
      throw badRequest('Distance sort needs lat and lon');
    }
    const relevance = tsq
      ? `ts_rank(pl.search_doc, websearch_to_tsquery('simple', unaccent(${tsq}))) * 2 + similarity(pl.title, ${tsq})`
      : '0';
    // Organic score: relevance, verification, freshness and rating. Payment never changes organic order.
    const score = `(${relevance}) + pl.verification_level * 0.3
      + CASE WHEN pl.last_confirmed_at > now() - interval '90 days' THEN 0.3 ELSE 0 END
      + CASE WHEN coalesce(r.review_count,0) >= 3 THEN coalesce(r.rating,0) * 0.1 ELSE 0 END`;
    const order = {
      relevance: `${score} DESC`,
      rating: `CASE WHEN coalesce(r.review_count,0) >= 3 THEN r.rating END DESC NULLS LAST, ${score} DESC`,
      price: 'pl.price_from ASC NULLS LAST',
      distance: `${dist} ASC`,
      newest: 'pl.published_at DESC',
    }[f.sort];
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = p(f.pageSize);
    const offset = p((f.page - 1) * f.pageSize);
    const sql = `
      SELECT ${CARD_FIELDS}, ${dist} AS "distanceM", count(*) OVER() AS total
        FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id
        ${whereSql}
        ORDER BY ${order}, pl.id
        LIMIT ${limit} OFFSET ${offset}`;
    const { rows } = await q(sql, params);
    const total = rows[0]?.total ?? 0;
    const results = rows.map(({ total: _t, ...r }) => ({ ...r, rating: (r.reviewCount ?? 0) >= 3 ? r.rating : null }));
    // Featured: labelled, capped at 2, shown separately from organic results and still verified.
    const featured = f.page === 1 ? results.filter((r) => r.isFeatured).slice(0, 2) : [];
    return { total, page: f.page, pageSize: f.pageSize, featured, results };
  });

  app.get('/listings/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().max(120) }).parse(req.params);
    const { rows } = await q(
      `SELECT ${CARD_FIELDS}, pl.description, pl.attributes, pl.location_is_private AS "locationIsPrivate",
              pl.vendor_slug AS "vendorSlug", pl.whatsapp_e164 AS whatsapp, pl.vendor_phone AS phone, pl.vendor_email AS email,
              pl.published_at AS "publishedAt"
         FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id
        WHERE pl.slug = $1`,
      [slug],
    );
    const l = rows[0];
    if (!l) throw notFound('This listing is not available. It may be under review or no longer verified.');
    if (l.locationIsPrivate) {
      // Home-based hosts: only an approximate area is public.
      l.lat = Math.round(l.lat * 100) / 100;
      l.lon = Math.round(l.lon * 100) / 100;
    }
    if (l.reviewCount < 3) l.rating = null;
    const [photos, dates, reviews, paid] = await Promise.all([
      q(`SELECT url, alt FROM listing_photos WHERE listing_id = $1 ORDER BY position`, [l.id]),
      q(
        `SELECT id, starts_at AS "startsAt", ends_at AS "endsAt", confirmed_at IS NOT NULL AS confirmed, ticket_url AS "ticketUrl"
           FROM event_dates WHERE listing_id = $1 AND NOT is_cancelled AND ends_at > now() ORDER BY starts_at LIMIT 12`,
        [l.id],
      ),
      q(
        `SELECT r.id, r.rating, r.body, r.vendor_reply AS "vendorReply", r.created_at AS "createdAt",
                coalesce(split_part(u.display_name, ' ', 1), 'Traveller') AS author
           FROM reviews r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.listing_id = $1 AND r.status = 'published' ORDER BY r.created_at DESC LIMIT 20`,
        [l.id],
      ),
      // "I paid this much" reports at this business, for the most-reported currency.
      q(
        `SELECT currency, count(*)::int AS reports,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY amount))::int AS median, min(amount) AS "minAmount", max(amount) AS "maxAmount",
                (array_agg(json_build_object('item', item, 'amount', amount, 'unit', unit, 'paidOn', paid_on) ORDER BY created_at DESC))[1:3] AS latest
           FROM price_reports WHERE listing_id = $1 AND NOT is_hidden AND paid_on > current_date - 365
          GROUP BY currency ORDER BY count(*) DESC LIMIT 1`,
        [l.id],
      ),
    ]);
    return { listing: { ...l, photos: photos.rows, dates: dates.rows, reviews: reviews.rows, paid: paid.rows[0] ?? null } };
  });

  // ---- Enquiries: record first, then hand the traveller to WhatsApp ----
  app.post('/enquiries', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const body = z
      .object({
        listingId: z.string().uuid(),
        channel: z.enum(['whatsapp', 'phone', 'email']).default('whatsapp'),
        requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        reminderContact: z.string().trim().max(120).optional(),
        sourceCode: z.string().regex(/^[A-Za-z0-9_-]{2,32}$/).optional(),
      })
      .parse(req.body);
    const { rows } = await q(`SELECT id, vendor_id, title, whatsapp_e164 FROM public_listings WHERE id = $1`, [body.listingId]);
    const l = rows[0];
    if (!l) throw notFound('This listing is not available');
    const ins = await q(
      `INSERT INTO enquiries (ref_code, listing_id, vendor_id, user_id, device_id, channel, requested_date, reminder_contact, source_code)
       VALUES (new_ref_code(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, ref_code AS "refCode", created_at AS "createdAt"`,
      [l.id, l.vendor_id, req.user?.id ?? null, req.deviceId, body.channel, body.requestedDate ?? null, body.reminderContact || null, body.sourceCode ?? null],
    );
    const e = ins.rows[0];
    const when = body.requestedDate
      ? ` Is it available on ${new Date(body.requestedDate + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}?`
      : ' Is it available?';
    const message = `Hi! I found "${l.title}" on Karibu (ref ${e.refCode}).${when}`;
    return { enquiry: e, message, whatsappUrl: whatsappUrl(l.whatsapp_e164, message) };
  });

  // ---- Safety and information ----
  app.get('/operators/check', { config: { rateLimit: { max: 40, timeWindow: '10 minutes' } } }, async (req) => {
    const { query } = z.object({ query: z.string().trim().min(2).max(100) }).parse(req.query);
    const phone = query.replace(/[\s-]/g, '');
    const isPhone = /^\+?\d{9,15}$/.test(phone);
    const watch = await q(
      `SELECT name, reason FROM operator_watchlist
        WHERE ($2 AND phone_e164 = $3) OR similarity(name, $1) > 0.5 OR name ILIKE $1 ORDER BY similarity(name, $1) DESC LIMIT 1`,
      [query, isPhone, phone.startsWith('+') ? phone : `+${phone}`],
    );
    const vendors = await q(
      `SELECT v.name, v.slug, v.verification_level AS level, v.verified_at AS "verifiedAt", v.is_suspended AS suspended,
              v.country_code AS country, (v.reverify_due IS NULL OR v.reverify_due >= current_date) AS current,
              EXISTS (SELECT 1 FROM public_listings pl WHERE pl.vendor_id = v.id) AS "hasPublicListings"
         FROM vendors v
        WHERE ($2 AND (v.whatsapp_e164 = $3 OR v.phone_e164 = $3)) OR v.licence_number = $1
           OR similarity(v.name, $1) > 0.45 OR v.name ILIKE $1
        ORDER BY similarity(v.name, $1) DESC LIMIT 3`,
      [query, isPhone, phone.startsWith('+') ? phone : `+${phone}`],
    );
    let result: 'watchlist' | 'verified' | 'listed_unverified' | 'not_found' = 'not_found';
    if (watch.rows[0]) result = 'watchlist';
    else if (vendors.rows.some((v) => v.level >= 1 && v.current && !v.suspended)) result = 'verified';
    else if (vendors.rows.length) result = 'listed_unverified';
    await q('INSERT INTO operator_lookups (query, result) VALUES ($1, $2)', [query.slice(0, 100), result]);
    return { result, watchlist: watch.rows[0] ?? null, matches: vendors.rows };
  });

  app.get('/countries/:code/info', async (req) => {
    const { code } = z.object({ code: z.string().length(2).toUpperCase() }).parse(req.params);
    const [country, pages, contacts, advisories] = await Promise.all([
      q(`SELECT code, name, currency, time_zone AS "timeZone", languages, is_live AS "isLive" FROM countries WHERE code = $1`, [code]),
      q(
        `SELECT slug, title, body_md AS body, source_urls AS sources, last_reviewed_on AS "lastReviewedOn",
                last_reviewed_on < current_date - 90 AS stale
           FROM country_pages WHERE country_code = $1 ORDER BY array_position(ARRAY['entry','health','money','sim','getting-around','safety'], slug)`,
        [code],
      ),
      q(
        `SELECT kind, label, value, nationality, source_url AS "sourceUrl", last_reviewed_on AS "lastReviewedOn"
           FROM emergency_contacts WHERE country_code = $1 ORDER BY kind, label`,
        [code],
      ),
      q(
        `SELECT a.id, a.message, a.starts_at AS "startsAt", a.ends_at AS "endsAt", c.name AS city
           FROM advisories a LEFT JOIN cities c ON c.id = a.city_id
          WHERE a.country_code = $1 AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now())
          ORDER BY a.starts_at DESC`,
        [code],
      ),
    ]);
    if (!country.rows[0]) throw notFound('Unknown country');
    return { country: country.rows[0], pages: pages.rows, contacts: contacts.rows, advisories: advisories.rows };
  });

  app.post('/reports', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const body = z
      .object({
        listingId: z.string().uuid().optional(),
        subject: z.string().trim().max(120).optional(),
        category: z.enum(['safety', 'scam', 'overcharged', 'wrong_info', 'other']),
        body: z.string().trim().min(5).max(4000),
        contact: z.string().trim().max(120).optional(),
      })
      .refine((b) => b.listingId || b.subject, 'Say which listing or business this is about')
      .parse(req.body);
    const { rows } = await q(
      `INSERT INTO reports (listing_id, subject, category, body, contact, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at AS "createdAt"`,
      [body.listingId ?? null, body.subject ?? null, body.category, body.body, body.contact || null, req.user?.id ?? null],
    );
    return { report: rows[0] };
  });

  app.post('/recommendations', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const body = z
      .object({ business: z.string().trim().min(2).max(120), contact: z.string().trim().max(120).optional(), city: z.string().trim().max(80).optional(), why: z.string().trim().max(1000).optional() })
      .parse(req.body);
    const { rows } = await q(`INSERT INTO recommendations (user_id, business, contact, city, why) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [
      req.user?.id ?? null,
      body.business,
      body.contact ?? null,
      body.city ?? null,
      body.why ?? null,
    ]);
    return { recommendation: rows[0] };
  });

  app.get('/trips/shared/:token', async (req) => {
    const { token } = z.object({ token: z.string().min(16).max(64) }).parse(req.params);
    const t = await q(`SELECT id, title, starts_on AS "startsOn", ends_on AS "endsOn", notes FROM trips WHERE share_token = $1`, [token]);
    if (!t.rows[0]) throw notFound('This shared trip link is no longer active');
    const items = await q(
      `SELECT ti.id, ti.day, ti.time_label AS "timeLabel", ti.note, pl.slug, pl.title, pl.city_name AS city,
              ST_Y(pl.location::geometry) AS lat, ST_X(pl.location::geometry) AS lon
         FROM trip_items ti LEFT JOIN public_listings pl ON pl.id = ti.listing_id
        WHERE ti.trip_id = $1 ORDER BY ti.day NULLS LAST, ti.position`,
      [t.rows[0].id],
    );
    return { trip: { ...t.rows[0], items: items.rows } };
  });
}
