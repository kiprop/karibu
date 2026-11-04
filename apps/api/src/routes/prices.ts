import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { audit, requireStaff } from '../lib/staff.js';
import { HttpError, badRequest, notFound } from '../lib/util.js';

/*
 * "I paid this much": travellers report what they paid, and everyone can check a quote against
 * the team's checked prices and what other travellers paid. Closes the "mzungu price" gap.
 */

export const PRICE_GROUPS = ['food', 'drink', 'transport', 'stay', 'activity', 'shopping', 'other', 'home', 'services', 'utilities', 'grooming'] as const;
export const CURRENCIES = ['KES', 'TZS', 'UGX', 'RWF', 'ETB', 'USD'] as const;
/** Community ranges count as "typical" only from this many non-rip-off reports; fewer are "early reports". */
export const MIN_REPORTS = 3;

type Checked = { item: string; low: number; high: number; checkedOn: string; isExample: boolean; score: number };
type Community = { item: string; reports: number; typicalReports: number; p25: number; median: number; p75: number; minAmount: number; maxAmount: number; ripoffShare: number; score: number };
export type Verdict = 'low' | 'fair' | 'high' | 'very_high' | 'unknown';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Find the closest checked price and community summary for an item. Word similarity lets "ugali" match "Plate of ugali with stew". */
async function references(cityId: number, item: string, currency: string) {
  const key = norm(item);
  const [checked, community] = await Promise.all([
    q<Checked>(
      `SELECT item, low, high, checked_on AS "checkedOn", is_example AS "isExample", greatest(similarity(lower(item), $2), word_similarity($2, lower(item))) AS score
         FROM price_checks WHERE city_id = $1 AND currency = $3 AND greatest(similarity(lower(item), $2), word_similarity($2, lower(item))) >= 0.5
        ORDER BY score DESC, checked_on DESC LIMIT 1`,
      [cityId, key, currency],
    ),
    q<Community>(
      `SELECT item, reports, typical_reports AS "typicalReports", p25, median, p75, min_amount AS "minAmount", max_amount AS "maxAmount", ripoff_share::float AS "ripoffShare",
              greatest(similarity(item_key, $2), word_similarity($2, item_key)) AS score
         FROM price_report_summary WHERE city_id = $1 AND currency = $3 AND greatest(similarity(item_key, $2), word_similarity($2, item_key)) >= 0.5
        ORDER BY score DESC, reports DESC LIMIT 1`,
      [cityId, key, currency],
    ),
  ]);
  return { checked: checked.rows[0] ?? null, community: community.rows[0] ?? null };
}

/**
 * Compare an amount with what's typical. The fair ceiling is the higher of the team's checked high
 * and the community's upper quartile (when there are enough reports), with 15% grace for normal variation.
 */
export function judge(amount: number, checked: Checked | null, community: Community | null) {
  const enough = community && community.typicalReports >= MIN_REPORTS ? community : null;
  const lows = [checked?.low, enough?.p25].filter((x): x is number => x != null);
  const highs = [checked?.high, enough?.p75].filter((x): x is number => x != null);
  if (!highs.length) return { verdict: 'unknown' as Verdict, typicalLow: null, typicalHigh: null, times: null };
  const typicalLow = Math.min(...lows);
  const typicalHigh = Math.max(...highs);
  const times = Math.round((amount / typicalHigh) * 10) / 10;
  let verdict: Verdict = 'fair';
  if (amount > typicalHigh * 2) verdict = 'very_high';
  else if (amount > typicalHigh * 1.15) verdict = 'high';
  else if (amount < typicalLow * 0.7) verdict = 'low';
  return { verdict, typicalLow, typicalHigh, times };
}

async function cityBySlug(slug: string) {
  const { rows } = await q<{ id: number; name: string; currency: string }>(
    `SELECT c.id, c.name, co.currency FROM cities c JOIN countries co ON co.code = c.country_code WHERE c.slug = $1`,
    [slug],
  );
  if (!rows[0]) throw notFound('We don’t cover that place yet');
  return rows[0];
}

export async function priceRoutes(app: FastifyInstance) {
  // ---- Is this price fair? ----
  app.get('/prices/fair', async (req) => {
    const p = z
      .object({ city: z.string().max(80), item: z.string().trim().min(2).max(80), amount: z.coerce.number().int().positive().max(99_999_999), currency: z.enum(CURRENCIES).optional() })
      .parse(req.query);
    const city = await cityBySlug(p.city);
    const currency = p.currency ?? city.currency;
    const { checked, community } = await references(city.id, p.item, currency);
    return { item: p.item, amount: p.amount, currency, city: city.name, ...judge(p.amount, checked, community), checked, community, minReports: MIN_REPORTS };
  });

  // ---- City price board: checked prices, community ranges, recent reports ----
  app.get('/cities/:slug/prices', async (req) => {
    const { slug } = z.object({ slug: z.string().max(80) }).parse(req.params);
    const city = await cityBySlug(slug);
    const [checked, community, recent] = await Promise.all([
      q(
        `SELECT group_name AS "group", item, area, currency, low, high, checked_on AS "checkedOn", is_example AS "isExample"
           FROM price_checks WHERE city_id = $1 ORDER BY group_name, item`,
        [city.id],
      ),
      q(
        `SELECT item, group_name AS "group", unit, currency, reports, typical_reports AS "typicalReports", p25, median, p75, min_amount AS "minAmount", max_amount AS "maxAmount",
                ripoff_share::float AS "ripoffShare", last_paid AS "lastPaid", has_examples AS "hasExamples"
           FROM price_report_summary WHERE city_id = $1 ORDER BY reports DESC, item LIMIT 80`,
        [city.id],
      ),
      q(
        `SELECT r.id, r.item, r.group_name AS "group", r.amount, r.currency, r.unit, r.area, r.paid_on AS "paidOn", r.feel, r.negotiated,
                r.note, r.is_example AS "isExample", r.created_at AS "createdAt", pl.title AS "listingTitle", pl.slug AS "listingSlug"
           FROM price_reports r LEFT JOIN public_listings pl ON pl.id = r.listing_id
          WHERE r.city_id = $1 AND NOT r.is_hidden ORDER BY r.created_at DESC LIMIT 15`,
        [city.id],
      ),
    ]);
    return { city: { slug, name: city.name, currency: city.currency }, prices: checked.rows, community: community.rows, recent: recent.rows, minReports: MIN_REPORTS };
  });

  // ---- "I paid this much" ----
  app.post('/prices/reports', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const b = z
      .object({
        city: z.string().max(80).optional(),
        listingSlug: z.string().max(120).optional(),
        group: z.enum(PRICE_GROUPS),
        item: z.string().trim().min(2).max(80),
        area: z.string().trim().max(80).optional(),
        amount: z.number().int().positive().max(99_999_999),
        currency: z.enum(CURRENCIES).optional(),
        unit: z.string().trim().max(40).optional(),
        paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        feel: z.enum(['fair', 'high', 'ripoff']).optional(),
        negotiated: z.boolean().optional(),
        note: z.string().trim().max(280).optional(),
      })
      .refine((v) => v.city || v.listingSlug, 'Say where you paid this')
      .parse(req.body);

    if (!req.user && !req.deviceId) throw badRequest('Missing device id');
    const recentCount = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM price_reports WHERE created_at > now() - interval '1 day' AND (user_id = $1 OR device_id = $2)`,
      [req.user?.id ?? null, req.deviceId],
    );
    if (recentCount.rows[0].n >= 30) throw new HttpError(429, 'Thanks for all the reports! You can add more tomorrow.', 'too_many');

    let cityId: number;
    let listingId: string | null = null;
    let currency: string;
    if (b.listingSlug) {
      const l = await q<{ id: string; city_id: number; currency: string }>(`SELECT id, city_id, currency FROM public_listings WHERE slug = $1`, [b.listingSlug]);
      if (!l.rows[0]) throw notFound('That listing isn’t available');
      ({ id: listingId, city_id: cityId } = l.rows[0]);
      currency = b.currency ?? l.rows[0].currency;
    } else {
      const c = await cityBySlug(b.city!);
      cityId = c.id;
      currency = b.currency ?? c.currency;
    }
    if (b.paidOn) {
      const d = new Date(b.paidOn);
      if (Number.isNaN(+d) || d.getTime() > Date.now() + 86_400_000) throw badRequest('That date is in the future');
      if (d.getTime() < Date.now() - 2 * 365 * 86_400_000) throw badRequest('We only take prices paid in the last two years');
    }

    // Compare with what was known before this report, so the answer isn't skewed by itself.
    const { checked, community } = await references(cityId, b.item, currency);
    const comparison = judge(b.amount, checked, community);

    const { rows } = await q(
      `INSERT INTO price_reports (city_id, listing_id, group_name, item, area, amount, currency, unit, paid_on, feel, negotiated, note, user_id, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::date, current_date),$10,$11,$12,$13,$14)
       RETURNING id, paid_on AS "paidOn"`,
      [cityId, listingId, b.group, b.item, b.area || null, b.amount, currency, b.unit || null, b.paidOn ?? null, b.feel ?? null, b.negotiated ?? null,
       b.note || null, req.user?.id ?? null, req.user ? null : req.deviceId],
    );
    return { report: rows[0], currency, ...comparison, checked, community, minReports: MIN_REPORTS };
  });

  // ---- Moderation ----
  app.get('/admin/price-reports', async (req) => {
    requireStaff(req, 'prices.moderate');
    const { view } = z.object({ view: z.enum(['recent', 'outliers', 'hidden']).default('recent') }).parse(req.query);
    const where = view === 'hidden' ? 'r.is_hidden' : view === 'outliers'
      ? `NOT r.is_hidden AND s.typical_reports >= ${MIN_REPORTS} AND (r.amount > s.median * 2 OR r.amount * 2 < s.median)`
      : 'NOT r.is_hidden';
    const { rows } = await q(
      `SELECT r.id, r.item, r.amount, r.currency, r.unit, r.area, r.paid_on AS "paidOn", r.feel, r.note, r.is_example AS "isExample",
              r.hidden_reason AS "hiddenReason", r.created_at AS "createdAt", c.name AS city, l.title AS listing,
              s.median, s.reports, (r.user_id IS NOT NULL) AS "signedIn"
         FROM price_reports r JOIN cities c ON c.id = r.city_id LEFT JOIN listings l ON l.id = r.listing_id
         LEFT JOIN price_report_summary s ON s.city_id = r.city_id AND s.item_key = r.item_key AND s.currency = r.currency
        WHERE ${where} ORDER BY r.created_at DESC LIMIT 100`,
    );
    return { reports: rows };
  });

  app.post('/admin/price-reports/:id', async (req) => {
    const s = requireStaff(req, 'prices.moderate');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z
      .object({ hidden: z.boolean(), reason: z.string().trim().max(200).optional() })
      .refine((v) => !v.hidden || (v.reason && v.reason.length >= 3), 'Say why you are hiding it')
      .parse(req.body);
    const { rowCount } = await q(
      `UPDATE price_reports SET is_hidden = $2, hidden_reason = CASE WHEN $2 THEN $3 ELSE NULL END, hidden_by = CASE WHEN $2 THEN $4::uuid ELSE NULL END WHERE id = $1`,
      [id, b.hidden, b.reason ?? null, s.userId],
    );
    if (!rowCount) throw notFound();
    await audit(req, s, b.hidden ? 'Hid price report' : 'Restored price report', { type: 'price_report', id }, b.reason);
    return { hidden: b.hidden };
  });
}
