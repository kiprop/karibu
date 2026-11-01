import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { requireRole } from '../auth.js';
import { badRequest, isCompanyEmail, notFound } from '../lib/util.js';

const uuid = z.string().uuid();
const staff = (req: any) => requireRole(req, 'reviewer', 'admin');

export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/queue', async (req) => {
    staff(req);
    const { rows } = await q(
      `SELECT l.id, l.title, l.category, l.subtype, l.status, v.name AS vendor, v.verification_level AS "vendorLevel",
              c.name AS city, m.min_level AS "minLevel",
              (SELECT max(e.created_at) FROM listing_events e WHERE e.listing_id = l.id AND e.to_status = l.status) AS since,
              (SELECT count(*) FROM vendor_documents d WHERE d.vendor_id = v.id AND d.result = 'pending') AS "docsPending"
         FROM listings l JOIN vendors v ON v.id = l.vendor_id JOIN cities c ON c.id = l.city_id
         JOIN category_min_level m ON m.category = l.category
        WHERE l.status IN ('submitted','in_review') ORDER BY since NULLS FIRST`,
    );
    return { queue: rows };
  });

  app.get('/admin/listings/:id', async (req) => {
    staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const l = await q(
      `SELECT l.*, ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lon, v.name AS vendor_name, v.id AS vendor_id,
              v.whatsapp_e164, v.licence_number, v.verification_level, v.verified_at, c.name AS city,
              v.email AS vendor_email, v.email_verified_at IS NOT NULL AS vendor_email_verified, v.whatsapp_verified_at IS NOT NULL AS whatsapp_verified
         FROM listings l JOIN vendors v ON v.id = l.vendor_id JOIN cities c ON c.id = l.city_id WHERE l.id = $1`,
      [id],
    );
    if (!l.rows[0]) throw notFound();
    const [docs, history, photos] = await Promise.all([
      q(`SELECT id, doc_type AS "docType", file_name AS "fileName", result, uploaded_at AS "uploadedAt" FROM vendor_documents WHERE vendor_id = $1 ORDER BY uploaded_at DESC`, [l.rows[0].vendor_id]),
      q(`SELECT e.from_status AS "from", e.to_status AS "to", e.reason, e.created_at AS at, u.display_name AS actor FROM listing_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.listing_id = $1 ORDER BY e.id DESC`, [id]),
      q(`SELECT url, alt FROM listing_photos WHERE listing_id = $1 ORDER BY position`, [id]),
    ]);
    const { search_doc: _s, location: _loc, ...listing } = l.rows[0];
    listing.vendor_email_is_company = listing.vendor_email ? isCompanyEmail(listing.vendor_email) : false;
    return { listing, documents: docs.rows, history: history.rows, photos: photos.rows };
  });

  app.post('/admin/documents/:id', async (req) => {
    const u = staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ result: z.enum(['accepted', 'rejected']) }).parse(req.body);
    await q(`UPDATE vendor_documents SET result = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`, [id, b.result, u.id]);
    return { ok: true };
  });

  app.post('/admin/listings/:id/decision', async (req) => {
    const u = staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z
      .object({ decision: z.enum(['approve', 'changes', 'reject']), level: z.number().int().min(1).max(3).optional(), note: z.string().trim().max(1000).optional() })
      .refine((v) => v.decision === 'approve' || (v.note && v.note.length >= 5), 'Add a note telling the vendor what to change or why')
      .refine((v) => v.decision !== 'approve' || v.level, 'Choose the verification level reached')
      .parse(req.body);
    return tx(
      async (c) => {
        const cur = await c.query(
          `SELECT l.status, l.vendor_id, l.location_is_private, m.min_level FROM listings l JOIN category_min_level m ON m.category = l.category WHERE l.id = $1 FOR UPDATE OF l`,
          [id],
        );
        const row = cur.rows[0];
        if (!row) throw notFound();
        if (row.status === 'submitted') await c.query(`UPDATE listings SET status = 'in_review' WHERE id = $1`, [id]);
        else if (row.status !== 'in_review') throw badRequest(`This listing is ${row.status.replace('_', ' ')}, not waiting for review`);
        if (b.decision === 'approve') {
          const needed = Math.max(row.min_level, row.location_is_private ? 3 : 1);
          if (b.level! < needed) throw badRequest(`This listing needs verification level ${needed} before it can go live`);
          await c.query(
            `UPDATE vendors SET verification_level = GREATEST(verification_level, $2), verified_at = now(), reverify_due = (current_date + interval '12 months')::date WHERE id = $1`,
            [row.vendor_id, b.level],
          );
          await c.query(`UPDATE listings SET status = 'live' WHERE id = $1`, [id]);
          return { status: 'live' };
        }
        const to = b.decision === 'changes' ? 'changes_requested' : 'rejected';
        await c.query(`UPDATE listings SET status = $2 WHERE id = $1`, [id, to]);
        return { status: to };
      },
      { actor: u.id, reason: b.note ?? (b.decision === 'approve' ? `Approved at level ${b.level}` : null) },
    );
  });

  app.post('/admin/listings/:id/suspend', async (req) => {
    const u = staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ reason: z.string().trim().min(5).max(500), reinstate: z.boolean().default(false) }).parse(req.body);
    await tx((c) => c.query(`UPDATE listings SET status = $2 WHERE id = $1`, [id, b.reinstate ? 'live' : 'suspended']), { actor: u.id, reason: b.reason });
    return { status: b.reinstate ? 'live' : 'suspended' };
  });

  app.post('/admin/vendors/:id/suspend', async (req) => {
    staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ suspended: z.boolean() }).parse(req.body);
    await q(`UPDATE vendors SET is_suspended = $2, updated_at = now() WHERE id = $1`, [id, b.suspended]);
    return { suspended: b.suspended };
  });

  // ---- Reviews ----
  app.get('/admin/reviews', async (req) => {
    staff(req);
    const { view } = z.object({ view: z.enum(['recent', 'low', 'hidden']).default('recent') }).parse(req.query);
    const where = view === 'hidden' ? `r.status = 'hidden'` : view === 'low' ? `r.status = 'published' AND r.rating <= 2` : `r.status = 'published'`;
    const { rows } = await q(
      `SELECT r.id, r.rating, r.recommend, r.body, r.created_at AS "createdAt", r.hidden_reason AS "hiddenReason", (r.enquiry_id IS NOT NULL) AS contacted,
              l.title AS listing, v.name AS vendor, u.email, u.phone_e164 AS phone
         FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN vendors v ON v.id = l.vendor_id LEFT JOIN users u ON u.id = r.user_id
        WHERE ${where} ORDER BY r.created_at DESC LIMIT 100`,
    );
    return { reviews: rows };
  });

  app.post('/admin/reviews/:id', async (req) => {
    staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ hidden: z.boolean(), reason: z.string().trim().max(200).optional() }).parse(req.body);
    const r = await q(`UPDATE reviews SET status = $2, hidden_reason = $3 WHERE id = $1 RETURNING id`, [id, b.hidden ? 'hidden' : 'published', b.hidden ? b.reason ?? null : null]);
    if (!r.rows[0]) throw notFound();
    return { hidden: b.hidden };
  });

  // ---- Reports ----
  app.get('/admin/reports', async (req) => {
    staff(req);
    const { status } = z.object({ status: z.enum(['open', 'triaged', 'actioned', 'dismissed']).default('open') }).parse(req.query);
    const { rows } = await q(
      `SELECT r.id, r.category, r.body, r.contact, r.subject, r.status, r.created_at AS "createdAt", l.title AS listing, l.id AS "listingId",
              v.name AS vendor, v.id AS "vendorId",
              CASE WHEN r.category IN ('safety','scam') THEN r.created_at + interval '4 hours' ELSE r.created_at + interval '2 days' END AS "dueAt"
         FROM reports r LEFT JOIN listings l ON l.id = r.listing_id LEFT JOIN vendors v ON v.id = l.vendor_id
        WHERE r.status = $1 ORDER BY (r.category IN ('safety','scam')) DESC, r.created_at`,
      [status],
    );
    return { reports: rows };
  });

  app.post('/admin/reports/:id', async (req) => {
    staff(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ status: z.enum(['triaged', 'actioned', 'dismissed']), resolution: z.string().trim().max(1000).optional() }).parse(req.body);
    await q(`UPDATE reports SET status = $2, resolution = coalesce($3, resolution) WHERE id = $1`, [id, b.status, b.resolution ?? null]);
    return { ok: true };
  });

  app.post('/admin/watchlist', async (req) => {
    const u = staff(req);
    const b = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(), reason: z.string().trim().min(5).max(500) }).parse(req.body);
    const { rows } = await q(`INSERT INTO operator_watchlist (name, phone_e164, reason, added_by) VALUES ($1,$2,$3,$4) RETURNING id`, [b.name, b.phone ?? null, b.reason, u.id]);
    return { entry: rows[0] };
  });

  // ---- Information upkeep ----
  app.post('/admin/advisories', async (req) => {
    const u = requireRole(req, 'admin');
    const b = z.object({ countryCode: z.string().length(2).toUpperCase(), cityId: z.number().int().optional(), message: z.string().trim().min(10).max(500), endsAt: z.string().datetime({ offset: true }).optional() }).parse(req.body);
    const { rows } = await q(`INSERT INTO advisories (country_code, city_id, message, ends_at, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [b.countryCode, b.cityId ?? null, b.message, b.endsAt ?? null, u.id]);
    return { advisory: rows[0] };
  });

  app.post('/admin/price-checks', async (req) => {
    const u = staff(req);
    const b = z
      .object({ citySlug: z.string(), group: z.enum(['food', 'transport', 'other']), item: z.string().trim().min(2).max(100), area: z.string().max(80).optional(), low: z.number().int().min(0), high: z.number().int().min(0), checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .refine((v) => v.high >= v.low, 'High must be at least low')
      .parse(req.body);
    const { rows } = await q(
      `INSERT INTO price_checks (city_id, group_name, item, area, currency, low, high, checked_on, checked_by)
       SELECT c.id, $2, $3, $4, co.currency, $5, $6, $7, $8 FROM cities c JOIN countries co ON co.code = c.country_code WHERE c.slug = $1 RETURNING id`,
      [b.citySlug, b.group, b.item, b.area ?? null, b.low, b.high, b.checkedOn, u.id],
    );
    if (!rows[0]) throw badRequest('Unknown city');
    return { priceCheck: rows[0] };
  });

  app.get('/admin/recommendations', async (req) => {
    staff(req);
    const { rows } = await q(`SELECT id, business, contact, city, why, created_at AS "createdAt" FROM recommendations ORDER BY created_at DESC LIMIT 200`);
    return { recommendations: rows };
  });

  app.get('/admin/stale', async (req) => {
    staff(req);
    const [pages, prices, listings] = await Promise.all([
      q(`SELECT country_code AS country, slug, last_reviewed_on AS "lastReviewedOn" FROM country_pages WHERE last_reviewed_on < current_date - 90`),
      q(`SELECT c.name AS city, p.item, p.checked_on AS "checkedOn" FROM price_checks p JOIN cities c ON c.id = p.city_id WHERE p.checked_on < current_date - 120`),
      q(`SELECT id, title, last_confirmed_at AS "lastConfirmedAt" FROM listings WHERE status = 'live' AND last_confirmed_at < now() - interval '90 days'`),
    ]);
    return { pages: pages.rows, prices: prices.rows, listings: listings.rows };
  });

  app.post('/admin/users/role', async (req) => {
    requireRole(req, 'admin');
    const b = z.object({ email: z.string().email().optional(), phone: z.string().optional(), role: z.enum(['traveller', 'reviewer', 'admin']) }).refine((v) => v.email || v.phone, 'Give an email or phone').parse(req.body);
    const r = await q(`UPDATE users SET role = $3 WHERE ($1::text IS NOT NULL AND email = lower($1)) OR ($2::text IS NOT NULL AND phone_e164 = $2) RETURNING id`, [b.email ?? null, b.phone ?? null, b.role]);
    if (!r.rows[0]) throw notFound('No user with that email or phone');
    return { ok: true };
  });
}
