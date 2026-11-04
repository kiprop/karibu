import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q } from '../db/pool.js';
import { audit, requireStaff, type Staff } from '../lib/staff.js';

const SETTLE = ['home', 'furniture', 'home_services', 'utilities', 'grooming'];
const range = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d), 'Choose 7, 30, 90 or 365 days').default(30) });

/** All numbers are counts and medians; no names, emails or phone numbers of travellers appear here. */
async function compute(s: Staff, days: number) {
  // $1 = days, $2 = country scope (NULL = all countries)
  const P = [days, s.country];
  const vScope = `($2::char(2) IS NULL OR v.country_code = $2)`;
  const vScope1 = vScope.replaceAll('$2', '$1');
  const now = `now()`;
  const cur = (col: string) => `${col} > ${now} - make_interval(days => $1)`;
  const prev = (col: string) => `${col} BETWEEN ${now} - make_interval(days => $1 * 2) AND ${now} - make_interval(days => $1)`;
  const sl = `($2::char(2) IS NULL OR sl.country_code IS NULL OR sl.country_code = $2)`;

  const [head, daily, funnel, cities, cats, gaps, heat, trust, reportsWeekly, pipeline, team, premium, areas, premiumTrend, biz, levels, growth, top, audience, types] = await Promise.all([
    q(`SELECT
         (SELECT count(*) FROM search_log sl WHERE ${cur('sl.at')} AND ${sl}) AS searches,
         (SELECT count(*) FROM search_log sl WHERE ${prev('sl.at')} AND ${sl}) AS "searchesPrev",
         (SELECT count(DISTINCT d) FROM (SELECT sl.device_id d FROM search_log sl WHERE ${cur('sl.at')} AND ${sl}
             UNION ALL SELECT e.device_id FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE ${cur('e.created_at')} AND ${vScope}) x WHERE d IS NOT NULL) AS visitors,
         (SELECT count(DISTINCT d) FROM (SELECT sl.device_id d FROM search_log sl WHERE ${prev('sl.at')} AND ${sl}
             UNION ALL SELECT e.device_id FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE ${prev('e.created_at')} AND ${vScope}) x WHERE d IS NOT NULL) AS "visitorsPrev",
         (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE ${cur('e.created_at')} AND ${vScope}) AS enquiries,
         (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE ${prev('e.created_at')} AND ${vScope}) AS "enquiriesPrev",
         (SELECT count(*) FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN vendors v ON v.id = l.vendor_id WHERE r.status = 'published' AND ${cur('r.created_at')} AND ${vScope}) AS experiences,
         (SELECT count(*) FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN vendors v ON v.id = l.vendor_id WHERE r.status = 'published' AND ${prev('r.created_at')} AND ${vScope}) AS "experiencesPrev",
         (SELECT count(*) FROM price_reports p JOIN cities c ON c.id = p.city_id WHERE NOT p.is_hidden AND NOT p.is_example AND ${cur('p.created_at')} AND ($2::char(2) IS NULL OR c.country_code = $2)) AS prices,
         (SELECT count(*) FROM price_reports p JOIN cities c ON c.id = p.city_id WHERE NOT p.is_hidden AND NOT p.is_example AND ${prev('p.created_at')} AND ($2::char(2) IS NULL OR c.country_code = $2)) AS "pricesPrev",
         (SELECT coalesce(sum(lv.views), 0) FROM listing_views lv JOIN listings l ON l.id = lv.listing_id JOIN vendors v ON v.id = l.vendor_id WHERE lv.day > current_date - $1::int AND ${vScope}) AS views`, P),
    q(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
              (SELECT count(*) FROM search_log sl WHERE sl.at >= d AND sl.at < d + interval '1 day' AND ${sl}) AS searches,
              (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE e.created_at >= d AND e.created_at < d + interval '1 day' AND ${vScope}) AS enquiries,
              (SELECT count(DISTINCT sl.device_id) FROM search_log sl WHERE sl.at >= d AND sl.at < d + interval '1 day' AND ${sl}) AS visitors
         FROM generate_series(date_trunc('day', now()) - make_interval(days => $1 - 1), date_trunc('day', now()), interval '1 day') d`, P),
    q(`SELECT (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id JOIN reviews r ON r.enquiry_id = e.id WHERE ${cur('e.created_at')} AND ${vScope}) AS "enquiriesReviewed"`, P),
    q(`SELECT c.name AS city, count(*) AS n FROM enquiries e JOIN listings l ON l.id = e.listing_id JOIN cities c ON c.id = l.city_id JOIN vendors v ON v.id = e.vendor_id
        WHERE ${cur('e.created_at')} AND ${vScope} GROUP BY c.name ORDER BY n DESC LIMIT 8`, P),
    q(`SELECT l.category::text AS category, count(*) AS n FROM enquiries e JOIN listings l ON l.id = e.listing_id JOIN vendors v ON v.id = e.vendor_id
        WHERE ${cur('e.created_at')} AND ${vScope} GROUP BY l.category ORDER BY n DESC`, P),
    q(`SELECT mode() WITHIN GROUP (ORDER BY sl.query) AS query, sl.query_key AS key, sl.city_slug AS city, count(*) AS searches,
              round(avg(sl.results), 1) AS "avgResults", max(sl.results) AS "maxResults",
              mode() WITHIN GROUP (ORDER BY sl.mode) AS mode, count(DISTINCT sl.device_id) AS people
         FROM search_log sl WHERE ${cur('sl.at')} AND ${sl} AND sl.query_key IS NOT NULL AND sl.query_key <> ''
        GROUP BY sl.query_key, sl.city_slug HAVING max(sl.results) <= 2
        ORDER BY count(*) DESC LIMIT 15`, P),
    q(`SELECT extract(isodow FROM e.created_at AT TIME ZONE 'Africa/Nairobi')::int AS dow,
              (extract(hour FROM e.created_at AT TIME ZONE 'Africa/Nairobi')::int / 3) AS slot, count(*) AS n
         FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE ${cur('e.created_at')} AND ${vScope} GROUP BY 1, 2`, P),
    q(`SELECT
         (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM d.created_at - s.at) / 3600))::numeric, 1)
            FROM listing_events d JOIN listings l ON l.id = d.listing_id JOIN vendors v ON v.id = l.vendor_id
            CROSS JOIN LATERAL (SELECT max(e.created_at) AS at FROM listing_events e WHERE e.listing_id = d.listing_id AND e.to_status = 'submitted' AND e.created_at <= d.created_at) s
           WHERE d.from_status = 'in_review' AND d.to_status IN ('live','changes_requested','rejected') AND ${cur('d.created_at')} AND ${vScope} AND s.at IS NOT NULL) AS "decisionHours",
         (SELECT count(*) FROM reports r LEFT JOIN listings l ON l.id = r.listing_id LEFT JOIN vendors v ON v.id = l.vendor_id
           WHERE r.category IN ('safety','scam') AND ${cur('r.created_at')} AND (v.id IS NULL OR ${vScope})) AS "safetyReports",
         (SELECT count(*) FROM reports r LEFT JOIN listings l ON l.id = r.listing_id LEFT JOIN vendors v ON v.id = l.vendor_id
           WHERE r.category IN ('safety','scam') AND ${cur('r.created_at')} AND (v.id IS NULL OR ${vScope})
             AND (r.resolved_at <= r.created_at + interval '4 hours' OR (r.status = 'triaged' AND r.resolved_at IS NULL AND r.created_at > now() - interval '4 hours'))) AS "safetyOnTime",
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status = 'live' AND ${vScope}) AS live,
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status = 'live' AND l.last_confirmed_at > now() - interval '30 days' AND ${vScope}) AS "liveConfirmed",
         (SELECT count(*) FROM country_links k WHERE k.is_active AND ($2::char(2) IS NULL OR k.country_code = $2)) AS links,
         (SELECT count(*) FROM country_links k WHERE k.is_active AND k.last_checked_on >= current_date - 90 AND ($2::char(2) IS NULL OR k.country_code = $2)) AS "linksFresh"`, P),
    q(`SELECT to_char(w, 'YYYY-MM-DD') AS week, r.category, count(r.id) AS n
         FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') w
         LEFT JOIN reports r ON r.created_at >= w AND r.created_at < w + interval '1 week'
         LEFT JOIN listings l ON l.id = r.listing_id LEFT JOIN vendors v ON v.id = l.vendor_id
        WHERE r.id IS NULL OR v.id IS NULL OR ${vScope1}
        GROUP BY w, r.category ORDER BY w`, [s.country]),
    q(`SELECT
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status = 'changes_requested' AND ${vScope1}) AS "waitingOnBusiness",
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status IN ('submitted','in_review') AND ${vScope1}) AS "inQueue",
         (SELECT count(*) FROM field_visits f JOIN listings l ON l.id = f.listing_id JOIN vendors v ON v.id = l.vendor_id WHERE f.status = 'booked' AND ${vScope1}) AS "visitsBooked",
         (SELECT count(*) FROM staff_approvals a WHERE a.status = 'pending' AND ($1::char(2) IS NULL OR a.country_code = $1)) AS "awaitingApproval",
         (SELECT count(*) FROM vendors v WHERE v.reverify_due < current_date + 30 AND v.verification_level > 0 AND ${vScope1}) AS "reverifySoon",
         (SELECT count(*) FROM listing_events d JOIN listings l ON l.id = d.listing_id JOIN vendors v ON v.id = l.vendor_id
           WHERE d.to_status = 'rejected' AND d.created_at > now() - interval '90 days' AND ${vScope1}) AS "rejected90"`, [s.country]),
    q(`SELECT a.staff_name AS name, a.staff_role AS role, count(*) AS actions,
              count(*) FILTER (WHERE a.action ILIKE 'Approved%' OR a.action ILIKE 'Gave second%' OR a.action ILIKE 'Asked for changes%' OR a.action ILIKE 'Rejected%') AS decisions,
              count(*) FILTER (WHERE a.action ILIKE 'Report%' OR a.action ILIKE 'Suspended%' OR a.action ILIKE 'Hid%' OR a.action ILIKE 'Added to operator%') AS "safetyActions",
              count(*) FILTER (WHERE a.action ILIKE 'Submitted visit%') AS visits
         FROM staff_audit a WHERE ${cur('a.at')} AND a.staff_id IS NOT NULL AND a.action NOT IN ('Signed in', 'Signed out')
           AND ($2::char(2) IS NULL OR a.country_code IS NULL OR a.country_code = $2)
        GROUP BY a.staff_name, a.staff_role ORDER BY actions DESC LIMIT 20`, P),
    q(`WITH chk AS (
         SELECT DISTINCT ON (p.city_id, lower(regexp_replace(btrim(p.item), '\\s+', ' ', 'g'))) p.city_id,
                lower(regexp_replace(btrim(p.item), '\\s+', ' ', 'g')) AS item_key, p.item, p.low, p.high, p.currency
           FROM price_checks p ORDER BY p.city_id, lower(regexp_replace(btrim(p.item), '\\s+', ' ', 'g')), p.checked_on DESC)
       SELECT c.name AS city, chk.item, chk.currency, (chk.low + chk.high) / 2 AS checked, s.median AS paid, s.reports,
              round(((s.median::numeric / nullif((chk.low + chk.high) / 2.0, 0)) - 1) * 100) AS premium, round(s.ripoff_share * 100) AS "ripoffPct"
         FROM chk JOIN price_report_summary s ON s.city_id = chk.city_id AND s.item_key = chk.item_key AND s.currency = chk.currency
         JOIN cities c ON c.id = chk.city_id
        WHERE s.median IS NOT NULL AND ($1::char(2) IS NULL OR c.country_code = $1)
        ORDER BY premium DESC NULLS LAST LIMIT 20`, [s.country]),
    q(`SELECT coalesce(nullif(p.area, ''), c.name) AS place, count(*) AS reports, round(avg((p.feel = 'ripoff')::int) * 100) AS "ripoffPct"
         FROM price_reports p JOIN cities c ON c.id = p.city_id
        WHERE NOT p.is_hidden AND p.paid_on > current_date - $1::int AND ($2::char(2) IS NULL OR c.country_code = $2)
        GROUP BY 1 HAVING count(*) >= 3 ORDER BY "ripoffPct" DESC, reports DESC LIMIT 10`, P),
    q(`WITH chk AS (
         SELECT DISTINCT ON (p.city_id, lower(regexp_replace(btrim(p.item), '\\s+', ' ', 'g'))) p.city_id,
                lower(regexp_replace(btrim(p.item), '\\s+', ' ', 'g')) AS item_key, (p.low + p.high) / 2.0 AS mid, p.currency
           FROM price_checks p ORDER BY p.city_id, lower(regexp_replace(btrim(p.item), '\\s+', ' ', 'g')), p.checked_on DESC)
       SELECT to_char(date_trunc('month', r.paid_on), 'YYYY-MM') AS month, r.group_name AS "group",
              round(((percentile_cont(0.5) WITHIN GROUP (ORDER BY r.amount / nullif(chk.mid, 0))) - 1)::numeric * 100) AS premium, count(*) AS n
         FROM price_reports r JOIN chk ON chk.city_id = r.city_id AND chk.item_key = r.item_key AND chk.currency = r.currency
         JOIN cities c ON c.id = r.city_id
        WHERE NOT r.is_hidden AND r.paid_on > date_trunc('month', now()) - interval '7 months' AND ($1::char(2) IS NULL OR c.country_code = $1)
        GROUP BY 1, 2 ORDER BY 1`, [s.country]),
    q(`SELECT
         (SELECT count(*) FROM vendors v WHERE NOT v.is_suspended AND EXISTS (SELECT 1 FROM listings l WHERE l.vendor_id = v.id AND l.status = 'live') AND ${vScope}) AS active,
         (SELECT count(*) FROM vendors v WHERE ${cur('v.created_at')} AND ${vScope}) AS "newBusinesses",
         (SELECT count(*) FROM vendors v WHERE v.plan <> 'free' AND NOT v.is_suspended AND ${vScope}) AS paid,
         (SELECT count(*) FROM vendors v WHERE NOT v.is_suspended AND ${vScope}) AS total,
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status = 'live' AND ${vScope}) AS live`, P),
    q(`SELECT v.verification_level AS level, count(DISTINCT l.id) AS listings,
              round((percentile_cont(0.5) WITHIN GROUP (ORDER BY coalesce(e.n, 0)))::numeric, 1) AS "medianEnquiries"
         FROM listings l JOIN vendors v ON v.id = l.vendor_id
         LEFT JOIN (SELECT listing_id, count(*) AS n FROM enquiries WHERE ${cur('created_at')} GROUP BY listing_id) e ON e.listing_id = l.id
        WHERE l.status = 'live' AND ${vScope} GROUP BY v.verification_level ORDER BY v.verification_level`, P),
    q(`SELECT to_char(m, 'YYYY-MM') AS month,
              (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.published_at < m + interval '1 month' AND l.status = 'live' AND ${vScope1}) AS listings,
              (SELECT count(*) FROM vendors v WHERE v.created_at < m + interval '1 month' AND ${vScope1}) AS businesses
         FROM generate_series(date_trunc('month', now()) - interval '7 months', date_trunc('month', now()), interval '1 month') m`, [s.country]),
    q(`SELECT v.name, v.verification_level AS level, v.plan, count(e.id) AS enquiries,
              (SELECT round(avg(r.rating), 1) FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE l.vendor_id = v.id AND r.status = 'published') AS rating,
              (SELECT round(avg(r.recommend::int) * 100) FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE l.vendor_id = v.id AND r.status = 'published' AND r.recommend IS NOT NULL) AS "recommendPct"
         FROM vendors v JOIN enquiries e ON e.vendor_id = v.id AND ${cur('e.created_at')}
        WHERE ${vScope} GROUP BY v.id ORDER BY enquiries DESC LIMIT 10`, P),
    q(`SELECT
         (SELECT count(*) FROM enquiries e JOIN listings l ON l.id = e.listing_id JOIN vendors v ON v.id = e.vendor_id WHERE ${cur('e.created_at')} AND ${vScope} AND l.category::text = ANY($3)) AS settle,
         (SELECT count(*) FROM enquiries e JOIN listings l ON l.id = e.listing_id JOIN vendors v ON v.id = e.vendor_id WHERE ${cur('e.created_at')} AND ${vScope} AND NOT (l.category::text = ANY($3))) AS visit,
         (SELECT count(*) FROM search_log sl WHERE ${cur('sl.at')} AND ${sl} AND sl.mode = 'settle') AS "settleSearches",
         (SELECT count(*) FROM search_log sl WHERE ${cur('sl.at')} AND ${sl} AND sl.mode = 'visit') AS "visitSearches",
         (SELECT json_agg(x) FROM (SELECT sl.city_slug AS city, count(*) AS n FROM search_log sl WHERE ${cur('sl.at')} AND ${sl} AND sl.city_slug IS NOT NULL
             GROUP BY sl.city_slug ORDER BY n DESC LIMIT 8) x) AS "searchedCities",
         (SELECT count(*) FROM enquiries e JOIN vendors v ON v.id = e.vendor_id WHERE ${cur('e.created_at')} AND ${vScope} AND e.user_id IS NOT NULL) AS "signedInEnquiries"`, [...P, SETTLE]),
    q(`SELECT r.traveller_type AS type, count(*) AS n, round(avg(r.rating), 1) AS rating,
              mode() WITHIN GROUP (ORDER BY l.category::text) AS "topCategory"
         FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN vendors v ON v.id = l.vendor_id
        WHERE r.status = 'published' AND r.traveller_type IS NOT NULL AND ${vScope1}
        GROUP BY r.traveller_type ORDER BY n DESC`, [s.country]),
  ]);

  return {
    days,
    country: s.country,
    headline: head.rows[0],
    daily: daily.rows,
    funnel: { ...funnel.rows[0], views: head.rows[0].views, searches: head.rows[0].searches, enquiries: head.rows[0].enquiries },
    cities: cities.rows,
    categories: cats.rows.map((r) => ({ ...r, settle: SETTLE.includes(r.category) })),
    gaps: gaps.rows,
    heat: heat.rows,
    trust: { ...trust.rows[0], reportsWeekly: reportsWeekly.rows.filter((r) => r.category), weeks: [...new Set(reportsWeekly.rows.map((r) => r.week))], pipeline: pipeline.rows[0], team: team.rows },
    prices: { premium: premium.rows, areas: areas.rows, trend: premiumTrend.rows },
    businesses: { ...biz.rows[0], levels: levels.rows, growth: growth.rows, top: top.rows },
    audience: { ...audience.rows[0], types: types.rows },
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: Record<string, unknown>[]) =>
  rows.length ? [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(csvCell).join(','))].join('\n') : '';

export async function insightRoutes(app: FastifyInstance) {
  app.get('/admin/insights', async (req) => {
    const s = requireStaff(req, 'insights.view', 'insights.export');
    const { days } = range.parse(req.query);
    return compute(s, days);
  });

  /** A spreadsheet-ready export of the main tables. */
  app.get('/admin/insights/export', async (req, reply) => {
    const s = requireStaff(req, 'insights.export');
    const { days, table } = range.extend({ table: z.enum(['daily', 'gaps', 'prices', 'businesses']).default('daily') }).parse(req.query);
    const d = await compute(s, days);
    const rows = { daily: d.daily, gaps: d.gaps, prices: d.prices.premium, businesses: d.businesses.top }[table] as Record<string, unknown>[];
    await audit(req, s, `Exported insights: ${table}, ${days} days`, { type: 'insights', country: s.country });
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="karibu-${table}-${days}d-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv(rows);
  });
}
