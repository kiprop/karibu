import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { AMENITIES, CATEGORIES, SETTLE_CATEGORIES, SUBTYPES, VISIT_CATEGORIES } from '../lib/categories.js';
import { HttpError, badRequest, notFound, whatsappUrl } from '../lib/util.js';
import { understand, type Place } from '../lib/understand.js';

export const TRAVELLER_TYPES = ['solo', 'couple', 'family', 'friends', 'business', 'long_stay', 'moving_home'] as const;

/** One experience as shown publicly. $1 is the listing id; the voter key (for "you found this helpful") is passed separately. */
const EXPERIENCE_FIELDS = `
  r.id, r.rating, r.body, r.vendor_reply AS "vendorReply", r.created_at AS "createdAt",
  coalesce(split_part(u.display_name, ' ', 1), 'Traveller') AS author,
  r.recommend, r.visited_on AS "visitedOn", (r.enquiry_id IS NOT NULL) AS contacted, r.traveller_type AS "travellerType",
  (SELECT count(*)::int FROM review_votes v WHERE v.review_id = r.id) AS helpful,
  CASE WHEN p.id IS NOT NULL AND NOT p.is_hidden THEN json_build_object('item', p.item, 'amount', p.amount, 'currency', p.currency, 'unit', p.unit, 'feel', p.feel) END AS paid`;
const EXPERIENCE_FROM = `FROM reviews r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN price_reports p ON p.id = r.price_report_id`;

// Words too common to be a useful "popular mention".
const STOPWORDS = new Set(('the and was were with that this they them their there have had has for from very also just but not are you your our ours its into then than too out about would could will what when which who how all any some more most much many really well even only over after before again here what were been being being able good great nice place time back again went come came made make take took get got lot lots day days one two three four five'
  ).split(' '));

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
  /** visit = short-trip categories, settle = long stays and moving home. */
  mode: z.enum(['visit', 'settle']).optional(),
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
  /** nl=1: read q as plain language ("tented camp in the mara under 20k") and turn it into filters. */
  nl: z.enum(['0', '1']).optional(),
  bedrooms: z.coerce.number().int().min(1).max(10).optional(),
  furnished: z.enum(['furnished', 'unfurnished']).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
});

export async function publicRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await q('SELECT 1');
    return { ok: true };
  });

  app.get('/meta', async () => ({ categories: SUBTYPES, amenities: AMENITIES, groups: { visit: VISIT_CATEGORIES, settle: SETTLE_CATEGORIES } }));

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

  type F = z.infer<typeof searchQuery>;

  /** Run one search. `soft` words only help ranking; they never remove results. */
  async function runSearch(f: F, soft: string | null = null) {
    const where: string[] = [];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    if (f.country) where.push(`pl.country_code = ${p(f.country)}`);
    if (f.city) where.push(`pl.city_slug = ${p(f.city)}`);
    if (f.category) where.push(`pl.category = ${p(f.category)}::listing_category`);
    else if (f.mode) where.push(`pl.category = ANY(${p(f.mode === 'settle' ? [...SETTLE_CATEGORIES] : [...VISIT_CATEGORIES])}::listing_category[])`);
    if (f.subtype) where.push(`pl.subtype = ${p(f.subtype)}`);
    if (f.budget) where.push(`pl.budget_tier = ${p(f.budget)}::budget_tier`);
    if (f.ids) {
      const ids = f.ids.split(',').filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 50);
      where.push(`pl.id = ANY(${p(ids)}::uuid[])`);
    }
    if (f.minLevel) where.push(`pl.verification_level >= ${p(f.minLevel)}`);
    if (f.priceMax !== undefined) where.push(`pl.price_from <= ${p(f.priceMax)}`);
    if (f.bedrooms) where.push(`coalesce((pl.attributes->>'bedrooms')::int, 0) >= ${p(f.bedrooms)}`);
    if (f.furnished === 'furnished') where.push(`pl.attributes->>'furnished' IN ('furnished','semi')`);
    if (f.furnished === 'unfurnished') where.push(`pl.attributes->>'furnished' = 'unfurnished'`);
    if (f.amenities) {
      const list = f.amenities.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.some((a) => !(AMENITIES as readonly string[]).includes(a))) throw badRequest('Unknown amenity filter');
      if (list.length) where.push(`pl.amenities @> ${p(list)}::text[]`);
    }
    let tsq = '';
    let match = '';
    if (f.q) {
      tsq = p(f.q);
      // Every word must match, as a prefix ("sofa" finds "sofas") or by English stem ("furnished" finds "furnish").
      const words = (f.q.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 8);
      const prefix = words.length ? p(words.map((w) => `${w}:*`).join(' & ')) : null;
      match = prefix
        ? `(to_tsquery('simple', ${prefix}) || websearch_to_tsquery('english', unaccent(${tsq})))`
        : `websearch_to_tsquery('simple', unaccent(${tsq}))`;
      where.push(`(pl.search_doc @@ ${prefix ? `to_tsquery('simple', ${prefix})` : match} OR pl.search_doc @@ websearch_to_tsquery('english', unaccent(${tsq}))
                  OR pl.title % ${tsq} OR pl.city_name ILIKE '%' || ${tsq} || '%')`);
    }
    // Leftover words from plain-language search ("quiet", "kilimani") lift matching listings without excluding others.
    let softRank = '0';
    if (soft) {
      const words = (soft.match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2).slice(0, 8);
      if (words.length) softRank = `ts_rank(pl.search_doc, to_tsquery('simple', ${p(words.map((w) => `${w}:*`).join(' | '))})) * 3`;
    }
    const monthRank = f.month ? `CASE WHEN pl.attributes->'bestMonths' @> to_jsonb(${p(f.month)}::int) THEN 0.5 ELSE 0 END` : '0';
    let dist = 'NULL::float';
    if (f.lat !== undefined && f.lon !== undefined) {
      const pt = `ST_SetSRID(ST_MakePoint(${p(f.lon)}, ${p(f.lat)}), 4326)::geography`;
      dist = `ST_Distance(pl.location, ${pt})`;
      if (f.radiusKm) where.push(`ST_DWithin(pl.location, ${pt}, ${p(f.radiusKm * 1000)})`);
    } else if (f.sort === 'distance') {
      throw badRequest('Distance sort needs lat and lon');
    }
    const relevance = tsq ? `ts_rank(pl.search_doc, ${match}) * 2 + similarity(pl.title, ${tsq})` : '0';
    // Organic score: relevance, verification, freshness and rating. Payment never changes organic order.
    const score = `(${relevance}) + (${softRank}) + (${monthRank}) + pl.verification_level * 0.3
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
    const { rows } = await q(
      `SELECT ${CARD_FIELDS}, ${dist} AS "distanceM", count(*) OVER() AS total
         FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id
         ${whereSql}
         ORDER BY ${order}, pl.id
         LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const total = Number(rows[0]?.total ?? 0);
    const results = rows.map(({ total: _t, ...r }) => ({ ...r, rating: (r.reviewCount ?? 0) >= 3 ? r.rating : null }));
    return { total, results };
  }

  let placeCache: { at: number; places: Place[] } | null = null;
  async function places() {
    if (!placeCache || Date.now() - placeCache.at > 5 * 60e3) {
      const { rows } = await q(`SELECT slug, name, country_code AS country FROM cities`);
      placeCache = { at: Date.now(), places: rows };
    }
    return placeCache.places;
  }

  /** The URL parameters that reproduce a set of filters, so the page can show and remove each one. */
  const toParams = (f: Partial<F>) => {
    const out: Record<string, string> = {};
    for (const k of ['q', 'country', 'city', 'category', 'mode', 'subtype', 'budget', 'minLevel', 'priceMax', 'amenities', 'bedrooms', 'furnished', 'month'] as const) {
      const v = f[k];
      if (v !== undefined && v !== null && v !== '') out[k] = String(v);
    }
    return out;
  };

  app.get('/listings', async (req) => {
    const f = searchQuery.parse(req.query);
    const original = f.q;
    let understood: (ReturnType<typeof understand> & { params: Record<string, string> }) | null = null;
    let soft: string | null = null;

    if (f.nl === '1' && f.q) {
      const u = understand(f.q, await places(), { usdToKes: Number(process.env.USD_TO_KES ?? 129) });
      const uf = u.filters;
      // Anything the person set explicitly wins over what we read from the words.
      f.city ??= uf.city;
      f.category ??= uf.category;
      f.subtype ??= f.category === uf.category ? uf.subtype : undefined;
      f.mode ??= uf.mode;
      f.budget ??= uf.budget;
      f.priceMax ??= uf.priceMax;
      f.bedrooms ??= uf.bedrooms;
      f.furnished ??= uf.furnished;
      f.month ??= uf.month;
      if (uf.amenities.length) f.amenities = [...new Set([...(f.amenities ?? '').split(',').filter(Boolean), ...uf.amenities])].join(',');
      const structured = u.chips.length > 0;
      // With filters found, leftover words only help ranking. Without, keep a normal text search.
      f.q = structured ? undefined : u.rest || undefined;
      soft = structured ? u.rest || null : null;
      understood = { ...u, params: toParams({ ...f, q: u.rest || undefined }) };
    }

    const { total, results } = await runSearch(f, soft);
    // Featured: labelled, capped at 2, shown separately from organic results and still verified.
    const featured = f.page === 1 ? results.filter((r) => r.isFeatured).slice(0, 2) : [];

    // No dead ends: when nothing matches, loosen one thing at a time and say which.
    let relaxed: { without: string; params: Record<string, string>; total: number; results: unknown[] } | null = null;
    let didYouMean: string | null = null;
    if (total === 0 && f.page === 1 && !f.ids) {
      const label = (k: string, fallback: string) => understood?.chips.find((c) => c.key === k || c.key.startsWith(`${k}:`))?.label ?? fallback;
      const steps: [string, Partial<F>][] = [
        ...(f.amenities ? [[label('amenity', 'the must-haves'), { amenities: undefined }] as [string, Partial<F>]] : []),
        ...(f.furnished ? [[label('furnished', 'furnished'), { furnished: undefined }] as [string, Partial<F>]] : []),
        ...(f.bedrooms ? [[label('bedrooms', `${f.bedrooms}+ bedrooms`), { bedrooms: undefined }] as [string, Partial<F>]] : []),
        ...(f.priceMax !== undefined ? [[label('priceMax', 'the price limit'), { priceMax: undefined }] as [string, Partial<F>]] : []),
        ...(f.budget ? [[label('budget', 'the budget'), { budget: undefined }] as [string, Partial<F>]] : []),
        ...(f.minLevel ? [['the verification level', { minLevel: undefined }] as [string, Partial<F>]] : []),
        ...(f.subtype ? [[label('category', f.subtype), { subtype: undefined }] as [string, Partial<F>]] : []),
        ...(f.q ? [[`“${f.q}”`, { q: undefined }] as [string, Partial<F>]] : []),
        ...(f.city ? [[label('city', 'that place'), { city: undefined }] as [string, Partial<F>]] : []),
      ];
      let cur: F = { ...f, page: 1, pageSize: 6 };
      const dropped: string[] = [];
      for (const [what, patch] of steps) {
        cur = { ...cur, ...patch };
        dropped.push(what);
        const r = await runSearch(cur, soft);
        if (r.total > 0) {
          relaxed = { without: dropped.join(', '), params: toParams(cur), total: r.total, results: r.results };
          break;
        }
      }
      if (original && !understood?.chips.length) {
        const dm = await q(
          `SELECT t FROM (SELECT name AS t, similarity(name, $1) AS s FROM cities UNION ALL SELECT title, similarity(title, $1) FROM public_listings) x
            WHERE s > 0.3 ORDER BY s DESC LIMIT 1`,
          [original],
        );
        didYouMean = dm.rows[0]?.t ?? null;
      }
    }

    // Remember what was searched (not who searched) so the team can see demand and gaps.
    if (f.page === 1 && !f.ids && (original || f.city || f.category || f.mode)) {
      q(
        `INSERT INTO search_log (device_id, query, country_code, city_slug, category, mode, results)
         VALUES ($1, $2, coalesce($3, (SELECT country_code FROM cities WHERE slug = $4)), $4, $5, $6, $7)`,
        [req.deviceId, original?.slice(0, 120) ?? null, f.country ?? null, f.city ?? null, f.category ?? null,
         f.mode ?? (f.category ? ((SETTLE_CATEGORIES as readonly string[]).includes(f.category) ? 'settle' : 'visit') : null), total],
      ).catch(() => {});
    }
    return { total, page: f.page, pageSize: f.pageSize, featured, results, understood, relaxed, didYouMean };
  });

  /** "Tell us you need this": a search that found nothing becomes a request the team can act on. */
  app.post('/demand', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const b = z.object({
      query: z.string().trim().min(2).max(200), city: z.string().max(80).optional(), category: z.string().max(40).optional(),
      contact: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    await q(
      `INSERT INTO demand_requests (query, city_slug, category, contact, note, device_id, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [b.query, b.city ?? null, b.category ?? null, b.contact ?? null, b.note ?? null, req.deviceId, req.user?.id ?? null],
    );
    return { ok: true };
  });

  /**
   * The verification receipt: exactly what Karibu checked for this listing and when. Never names staff or shows documents.
   */
  async function receipt(listingId: string) {
    const { rows } = await q(
      `SELECT v.verification_level AS level, v.verified_at AS "verifiedAt", v.reverify_due AS "reverifyDue",
              v.whatsapp_verified_at AS "whatsappConfirmedAt", v.email_verified_at AS "emailConfirmedAt", v.licence_number IS NOT NULL AS "hasLicence",
              l.last_confirmed_at AS "lastConfirmedAt", l.published_at AS "publishedAt",
              (SELECT json_agg(json_build_object('type', d.doc_type, 'checkedAt', d.reviewed_at) ORDER BY d.reviewed_at DESC)
                 FROM vendor_documents d WHERE d.vendor_id = v.id AND d.result = 'accepted') AS documents,
              (SELECT max(f.submitted_at) FROM field_visits f WHERE f.listing_id = l.id AND f.status = 'submitted') AS "visitedAt",
              (SELECT max(a.decided_at) FROM staff_approvals a WHERE a.target_id = l.id AND a.kind = 'level3' AND a.status = 'approved') AS "secondApprovalAt"
         FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.id = $1`,
      [listingId],
    );
    const r = rows[0];
    if (!r) return null;
    const checks = [
      { key: 'contact', label: 'Contact confirmed: WhatsApp or company email belongs to the business', done: !!(r.whatsappConfirmedAt || r.emailConfirmedAt), at: r.whatsappConfirmedAt ?? r.emailConfirmedAt },
      { key: 'identity', label: 'Owner identity and business registration checked', done: r.level >= 1, at: r.verifiedAt },
      { key: 'licence', label: 'Licence and documents checked with the issuer', done: r.level >= 2 || (r.documents?.length ?? 0) > 0, at: r.documents?.[0]?.checkedAt ?? (r.level >= 2 ? r.verifiedAt : null) },
      { key: 'visit', label: 'Visited in person by our team, then approved by a second person', done: r.level >= 3, at: r.secondApprovalAt ?? r.visitedAt ?? (r.level >= 3 ? r.verifiedAt : null) },
      { key: 'accurate', label: 'Business confirmed the details are still accurate', done: !!r.lastConfirmedAt, at: r.lastConfirmedAt },
    ];
    return { level: r.level, verifiedAt: r.verifiedAt, reverifyDue: r.reverifyDue, checks, documentTypes: (r.documents ?? []).map((d: { type: string }) => d.type) };
  }

  app.get('/listings/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().max(120) }).parse(req.params);
    const { rows } = await q(
      `SELECT ${CARD_FIELDS}, pl.description, pl.attributes, pl.location_is_private AS "locationIsPrivate",
              pl.vendor_slug AS "vendorSlug", pl.whatsapp_e164 AS whatsapp, pl.vendor_phone AS phone, pl.vendor_email AS email,
              pl.published_at AS "publishedAt",
              coalesce(r.recommend_answers, 0) AS "recommendAnswers", coalesce(r.recommend_yes, 0) AS "recommendYes", coalesce(r.contacted_count, 0) AS "contactedCount"
         FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id
        WHERE pl.slug = $1`,
      [slug],
    );
    const l = rows[0];
    if (!l) throw notFound('This listing is not available. It may be under review or no longer verified.');
    q(`INSERT INTO listing_views (listing_id) VALUES ($1) ON CONFLICT (listing_id, day) DO UPDATE SET views = listing_views.views + 1`, [l.id]).catch(() => {});
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
        `SELECT ${EXPERIENCE_FIELDS} ${EXPERIENCE_FROM}
          WHERE r.listing_id = $1 AND r.status = 'published' ORDER BY r.created_at DESC LIMIT 10`,
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
    const [breakdown, types, words, highlights] = await Promise.all([
      q(`SELECT rating, count(*)::int AS n FROM reviews WHERE listing_id = $1 AND status = 'published' GROUP BY rating`, [l.id]),
      q(`SELECT traveller_type AS type, count(*)::int AS n FROM reviews WHERE listing_id = $1 AND status = 'published' AND traveller_type IS NOT NULL GROUP BY traveller_type ORDER BY n DESC`, [l.id]),
      q(
        `SELECT w, count(DISTINCT r.id)::int AS n
           FROM reviews r, regexp_split_to_table(lower(coalesce(r.body, '')), '[^a-z]+') AS w
          WHERE r.listing_id = $1 AND r.status = 'published' AND length(w) >= 4
          GROUP BY w HAVING count(DISTINCT r.id) >= 2 ORDER BY n DESC, w LIMIT 30`,
        [l.id],
      ),
      // "Why travellers like it": the two most recent warm experiences with something to say.
      q(
        `SELECT r.id, r.body, coalesce(split_part(u.display_name, ' ', 1), 'Traveller') AS author
           FROM reviews r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.listing_id = $1 AND r.status = 'published' AND r.rating >= 4 AND length(coalesce(r.body, '')) >= 40
          ORDER BY r.created_at DESC LIMIT 2`,
        [l.id],
      ),
    ]);
    const ratingBreakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of breakdown.rows) ratingBreakdown[r.rating] = r.n;
    const mentions = words.rows.filter((r: any) => !STOPWORDS.has(r.w)).slice(0, 8).map((r: any) => ({ word: r.w, count: r.n }));
    return {
      listing: {
        ...l, photos: photos.rows, dates: dates.rows, reviews: reviews.rows, paid: paid.rows[0] ?? null,
        ratingBreakdown, travellerTypes: types.rows, mentions, highlights: highlights.rows, receipt: await receipt(l.id),
      },
    };
  });

  // ---- Experiences for one listing: filter by stars, traveller type and words; sort; page ----
  app.get('/listings/:slug/experiences', async (req) => {
    const { slug } = z.object({ slug: z.string().max(120) }).parse(req.params);
    const f = z
      .object({
        rating: z.coerce.number().int().min(1).max(5).optional(),
        type: z.enum(TRAVELLER_TYPES).optional(),
        q: z.string().trim().min(2).max(60).optional(),
        sort: z.enum(['recent', 'highest', 'lowest', 'helpful']).default('recent'),
        page: z.coerce.number().int().min(1).max(500).default(1),
      })
      .parse(req.query);
    const l = await q<{ id: string }>(`SELECT id FROM public_listings WHERE slug = $1`, [slug]);
    if (!l.rows[0]) throw notFound('This listing is not available');
    const params: unknown[] = [l.rows[0].id];
    const where = [`r.listing_id = $1`, `r.status = 'published'`];
    if (f.rating) { params.push(f.rating); where.push(`r.rating = $${params.length}`); }
    if (f.type) { params.push(f.type); where.push(`r.traveller_type = $${params.length}`); }
    if (f.q) { params.push(`%${f.q.replace(/[%_\\]/g, (m) => '\\' + m)}%`); where.push(`r.body ILIKE $${params.length}`); }
    const order = { recent: 'r.created_at DESC', highest: 'r.rating DESC, r.created_at DESC', lowest: 'r.rating ASC, r.created_at DESC', helpful: 'helpful DESC, r.created_at DESC' }[f.sort];
    const pageSize = 10;
    const [rows, total] = await Promise.all([
      q(`SELECT ${EXPERIENCE_FIELDS} ${EXPERIENCE_FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(f.page - 1) * pageSize}`, params),
      q(`SELECT count(*)::int AS n FROM reviews r WHERE ${where.join(' AND ')}`, params),
    ]);
    return { total: total.rows[0].n, page: f.page, pageSize, experiences: rows.rows };
  });

  // "Was this helpful?" Anyone can vote once (signed in or by device); voting again removes the vote.
  app.post('/experiences/:id/helpful', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const voter = req.user ? `u:${req.user.id}` : req.deviceId ? `d:${req.deviceId}` : null;
    if (!voter) throw badRequest('Missing device id');
    const own = await q(`SELECT 1 FROM reviews WHERE id = $1 AND user_id IS NOT DISTINCT FROM $2`, [id, req.user?.id ?? '00000000-0000-0000-0000-000000000000']);
    if (own.rows[0]) throw badRequest('You can’t vote on your own experience');
    const exists = await q(`SELECT 1 FROM reviews WHERE id = $1 AND status = 'published'`, [id]);
    if (!exists.rows[0]) throw notFound();
    const del = await q(`DELETE FROM review_votes WHERE review_id = $1 AND voter = $2`, [id, voter]);
    if (!del.rowCount) await q(`INSERT INTO review_votes (review_id, voter) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, voter]);
    const n = await q<{ n: number }>(`SELECT count(*)::int AS n FROM review_votes WHERE review_id = $1`, [id]);
    return { voted: !del.rowCount, helpful: n.rows[0].n };
  });

  // ---- "You might also like": same category nearby, best rated first ----
  app.get('/listings/:slug/similar', async (req) => {
    const { slug } = z.object({ slug: z.string().max(120) }).parse(req.params);
    const l = await q(`SELECT id, category, city_id, location FROM public_listings WHERE slug = $1`, [slug]);
    if (!l.rows[0]) throw notFound();
    const { rows } = await q(
      `SELECT ${CARD_FIELDS} FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id
        WHERE pl.id <> $1 AND pl.category = $2
        ORDER BY (pl.city_id = $3) DESC, coalesce(r.rating, 0) DESC, ST_Distance(pl.location, $4) LIMIT 6`,
      [l.rows[0].id, l.rows[0].category, l.rows[0].city_id, l.rows[0].location],
    );
    return { listings: rows.map((r: any) => ({ ...r, rating: (r.reviewCount ?? 0) >= 3 ? r.rating : null })) };
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

  // ---- Latest traveller experiences across Karibu (the Share page feed) ----
  app.get('/experiences/recent', async (req) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(req.query);
    const { rows } = await q(
      `SELECT r.id, r.rating, r.recommend, r.body, r.visited_on AS "visitedOn", r.created_at AS "createdAt", (r.enquiry_id IS NOT NULL) AS contacted,
              coalesce(split_part(u.display_name, ' ', 1), 'Traveller') AS author,
              pl.title AS "listingTitle", pl.slug AS "listingSlug", pl.city_name AS city, pl.category,
              CASE WHEN p.id IS NOT NULL AND NOT p.is_hidden THEN json_build_object('item', p.item, 'amount', p.amount, 'currency', p.currency, 'unit', p.unit) END AS paid
         FROM reviews r JOIN public_listings pl ON pl.id = r.listing_id
         LEFT JOIN users u ON u.id = r.user_id LEFT JOIN price_reports p ON p.id = r.price_report_id
        WHERE r.status = 'published' ORDER BY r.created_at DESC LIMIT $1`,
      [limit],
    );
    return { experiences: rows };
  });

  // ---- Shareable business page and live badge ----
  // Only verified, active businesses get a public page. Anyone following an old link or QR code to a business
  // that is suspended or lapsed sees that it isn't verified now, which is the point of a live page.
  async function publicVendor(slug: string) {
    const { rows } = await q(
      `SELECT v.id, v.name, v.slug, v.about, v.website, v.country_code AS country, v.verification_level AS "verificationLevel",
              v.verified_at AS "verifiedAt", v.created_at AS "since", v.email_verified_at IS NOT NULL AS "emailVerified",
              v.whatsapp_verified_at IS NOT NULL AS "whatsappVerified", co.name AS "countryName",
              (NOT v.is_suspended AND v.verification_level >= 1 AND (v.reverify_due IS NULL OR v.reverify_due >= current_date)) AS active
         FROM vendors v JOIN countries co ON co.code = v.country_code WHERE v.slug = $1`,
      [slug],
    );
    return rows[0] ?? null;
  }

  app.get('/businesses/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string().max(140) }).parse(req.params);
    const v = await publicVendor(slug);
    if (!v) throw notFound('We couldn’t find that business on Karibu');
    if (!v.active) throw new HttpError(404, `${v.name} isn’t verified on Karibu right now. Be careful before paying.`, 'not_verified');
    const [listings, agg] = await Promise.all([
      q(`SELECT ${CARD_FIELDS} FROM public_listings pl LEFT JOIN listing_ratings r ON r.listing_id = pl.id WHERE pl.vendor_id = $1 ORDER BY pl.title`, [v.id]),
      q(
        `SELECT coalesce(sum(r.review_count),0)::int AS reviews, round(sum(r.rating * r.review_count) / nullif(sum(r.review_count),0), 1)::float AS rating,
                coalesce(sum(r.recommend_answers),0)::int AS "recommendAnswers", coalesce(sum(r.recommend_yes),0)::int AS "recommendYes"
           FROM listing_ratings r JOIN listings l ON l.id = r.listing_id WHERE l.vendor_id = $1`,
        [v.id],
      ),
    ]);
    const a = agg.rows[0];
    const { id: _id, active: _a, ...vendor } = v;
    return {
      business: { ...vendor, reviews: a.reviews, rating: a.reviews >= 3 ? a.rating : null, recommendAnswers: a.recommendAnswers, recommendYes: a.recommendYes },
      listings: listings.rows.map((r: any) => ({ ...r, rating: (r.reviewCount ?? 0) >= 3 ? r.rating : null })),
    };
  });

  // Live SVG badge for a business's own website or email signature. Turns into a warning if verification lapses.
  app.get('/businesses/:slug/badge.svg', async (req, reply) => {
    const { slug } = z.object({ slug: z.string().max(140) }).parse(req.params);
    const v = await publicVendor(slug);
    const ok = !!v?.active;
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
    const levels = ['', 'Contact checked', 'Documents checked', 'Visited'];
    const line1 = ok ? 'Verified on Karibu' : 'Not verified on Karibu';
    const line2 = ok ? `${levels[v.verificationLevel]} · ${new Date(v.verifiedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : 'Check before you pay';
    const bg = ok ? '#0A7D70' : '#B42318';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="52" viewBox="0 0 220 52" role="img" aria-label="${esc(line1)}: ${esc(line2)}">
  <rect width="220" height="52" rx="12" fill="${bg}"/>
  <path d="M26 12l11 4v8c0 7-5 12-11 15-6-3-11-8-11-15v-8z" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
  ${ok ? '<path d="M21 25l4 4 7-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' : '<path d="M26 19v7M26 31v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>'}
  <text x="48" y="23" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">${esc(line1)}</text>
  <text x="48" y="40" font-family="Helvetica,Arial,sans-serif" font-size="11.5" fill="#fff" opacity=".92">${esc(line2)}</text>
</svg>`;
    reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'public, max-age=3600').header('cross-origin-resource-policy', 'cross-origin');
    return svg;
  });

  app.get('/countries/:code/info', async (req) => {
    const { code } = z.object({ code: z.string().length(2).toUpperCase() }).parse(req.params);
    const [country, pages, contacts, advisories, links] = await Promise.all([
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
      q(
        `SELECT topic, title, url, description, warning, last_checked_on AS "lastCheckedOn", last_checked_on < current_date - 90 AS stale
           FROM country_links WHERE country_code = $1 AND is_active
          ORDER BY array_position(ARRAY['entry','business_check','parks','transport','health','safety','embassies','complaints','tourism'], topic), position`,
        [code],
      ),
    ]);
    if (!country.rows[0]) throw notFound('Unknown country');
    return { country: country.rows[0], pages: pages.rows, contacts: contacts.rows, advisories: advisories.rows, links: links.rows };
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
