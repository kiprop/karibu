import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PRICE_GROUPS } from './prices.js';
import { TRAVELLER_TYPES } from './public.js';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../auth.js';
import { HttpError, badRequest, notFound, randomToken } from '../lib/util.js';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function ownTrip(userId: string, tripId: string) {
  const { rows } = await q(`SELECT id FROM trips WHERE id = $1 AND owner_id = $2`, [tripId, userId]);
  if (!rows[0]) throw notFound('Trip not found');
}

export async function travellerRoutes(app: FastifyInstance) {
  // ---- Favourites ----
  app.get('/me/favourites', async (req) => {
    const u = requireUser(req);
    const { rows } = await q(
      `SELECT pl.id, pl.slug, pl.title, pl.category, pl.subtype, pl.city_name AS city, pl.currency, pl.price_from AS "priceFrom",
              pl.price_unit AS "priceUnit", pl.verification_level AS "verificationLevel",
              (SELECT url FROM listing_photos p WHERE p.listing_id = pl.id ORDER BY position LIMIT 1) AS "photoUrl", f.created_at AS "savedAt"
         FROM favourites f JOIN public_listings pl ON pl.id = f.listing_id
        WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
      [u.id],
    );
    return { favourites: rows };
  });

  app.put('/me/favourites/:listingId', async (req) => {
    const u = requireUser(req);
    const { listingId } = z.object({ listingId: uuid }).parse(req.params);
    const r = await q(`INSERT INTO favourites (user_id, listing_id) SELECT $1, id FROM listings WHERE id = $2 ON CONFLICT DO NOTHING`, [u.id, listingId]);
    if (r.rowCount === 0) {
      const exists = await q('SELECT 1 FROM listings WHERE id = $1', [listingId]);
      if (!exists.rows[0]) throw notFound('Listing not found');
    }
    return { saved: true };
  });

  app.delete('/me/favourites/:listingId', async (req) => {
    const u = requireUser(req);
    const { listingId } = z.object({ listingId: uuid }).parse(req.params);
    await q(`DELETE FROM favourites WHERE user_id = $1 AND listing_id = $2`, [u.id, listingId]);
    return { saved: false };
  });

  // ---- Enquiry history ----
  app.get('/me/enquiries', async (req) => {
    const u = requireUser(req);
    const { rows } = await q(
      `SELECT e.id, e.ref_code AS "refCode", e.created_at AS "createdAt", e.requested_date AS "requestedDate",
              l.id AS "listingId", l.slug, l.title, v.name AS "vendorName",
              (r.id IS NOT NULL) AS reviewed
         FROM enquiries e JOIN vendors v ON v.id = e.vendor_id LEFT JOIN listings l ON l.id = e.listing_id
         LEFT JOIN reviews r ON r.enquiry_id = e.id
        WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 200`,
      [u.id],
    );
    return { enquiries: rows };
  });

  // ---- Trips ----
  app.get('/me/trips', async (req) => {
    const u = requireUser(req);
    const { rows } = await q(
      `SELECT t.id, t.title, t.starts_on AS "startsOn", t.ends_on AS "endsOn", t.share_token IS NOT NULL AS shared,
              (SELECT count(*) FROM trip_items i WHERE i.trip_id = t.id) AS "itemCount", t.updated_at AS "updatedAt"
         FROM trips t WHERE t.owner_id = $1 ORDER BY t.starts_on NULLS LAST, t.created_at DESC`,
      [u.id],
    );
    return { trips: rows };
  });

  app.post('/me/trips', async (req) => {
    const u = requireUser(req);
    const b = z.object({ title: z.string().trim().min(1).max(100), startsOn: isoDate.optional(), endsOn: isoDate.optional(), notes: z.string().max(4000).optional() }).parse(req.body);
    if (b.startsOn && b.endsOn && b.endsOn < b.startsOn) throw badRequest('The trip must end on or after its start date');
    const { rows } = await q(
      `INSERT INTO trips (owner_id, title, starts_on, ends_on, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id, title, starts_on AS "startsOn", ends_on AS "endsOn"`,
      [u.id, b.title, b.startsOn ?? null, b.endsOn ?? null, b.notes ?? null],
    );
    return { trip: rows[0] };
  });

  app.get('/me/trips/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const t = await q(
      `SELECT id, title, starts_on AS "startsOn", ends_on AS "endsOn", notes, share_token AS "shareToken" FROM trips WHERE id = $1 AND owner_id = $2`,
      [id, u.id],
    );
    if (!t.rows[0]) throw notFound('Trip not found');
    const items = await q(
      `SELECT ti.id, ti.day, ti.time_label AS "timeLabel", ti.note, ti.position, l.id AS "listingId", l.slug, l.title, l.category,
              c.name AS city, v.whatsapp_e164 AS whatsapp,
              ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lon,
              EXISTS (SELECT 1 FROM public_listings pl WHERE pl.id = l.id) AS available
         FROM trip_items ti LEFT JOIN listings l ON l.id = ti.listing_id LEFT JOIN cities c ON c.id = l.city_id
         LEFT JOIN vendors v ON v.id = l.vendor_id
        WHERE ti.trip_id = $1 ORDER BY ti.day NULLS LAST, ti.position, ti.created_at`,
      [id],
    );
    return { trip: { ...t.rows[0], items: items.rows } };
  });

  app.patch('/me/trips/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z
      .object({ title: z.string().trim().min(1).max(100).optional(), startsOn: isoDate.nullable().optional(), endsOn: isoDate.nullable().optional(), notes: z.string().max(4000).nullable().optional() })
      .parse(req.body);
    await ownTrip(u.id, id);
    await q(
      `UPDATE trips SET title = coalesce($3, title),
              starts_on = CASE WHEN $4::boolean THEN $5::date ELSE starts_on END,
              ends_on   = CASE WHEN $6::boolean THEN $7::date ELSE ends_on END,
              notes     = CASE WHEN $8::boolean THEN $9 ELSE notes END,
              updated_at = now()
        WHERE id = $1 AND owner_id = $2`,
      [id, u.id, b.title ?? null, b.startsOn !== undefined, b.startsOn ?? null, b.endsOn !== undefined, b.endsOn ?? null, b.notes !== undefined, b.notes ?? null],
    ).catch((e) => {
      if (String(e.message).includes('trips_check')) throw badRequest('The trip must end on or after its start date');
      throw e;
    });
    return { ok: true };
  });

  app.delete('/me/trips/:id', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    await q(`DELETE FROM trips WHERE id = $1 AND owner_id = $2`, [id, u.id]);
    return { deleted: true };
  });

  app.post('/me/trips/:id/items', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z
      .object({ listingId: uuid.optional(), day: isoDate.optional(), timeLabel: z.string().max(40).optional(), note: z.string().max(500).optional() })
      .refine((v) => v.listingId || v.note, 'Add a listing or a note')
      .parse(req.body);
    await ownTrip(u.id, id);
    const { rows } = await q(
      `INSERT INTO trip_items (trip_id, listing_id, day, time_label, note, position)
       VALUES ($1,$2,$3,$4,$5, coalesce((SELECT max(position)+1 FROM trip_items WHERE trip_id = $1 AND day IS NOT DISTINCT FROM $3::date), 0))
       RETURNING id`,
      [id, b.listingId ?? null, b.day ?? null, b.timeLabel ?? null, b.note ?? null],
    );
    await q('UPDATE trips SET updated_at = now() WHERE id = $1', [id]);
    return { item: rows[0] };
  });

  app.patch('/me/trips/:id/items/:itemId', async (req) => {
    const u = requireUser(req);
    const { id, itemId } = z.object({ id: uuid, itemId: uuid }).parse(req.params);
    const b = z.object({ day: isoDate.nullable().optional(), timeLabel: z.string().max(40).nullable().optional(), note: z.string().max(500).nullable().optional(), position: z.number().int().min(0).max(1000).optional() }).parse(req.body);
    await ownTrip(u.id, id);
    await q(
      `UPDATE trip_items SET
          day = CASE WHEN $3::boolean THEN $4::date ELSE day END,
          time_label = CASE WHEN $5::boolean THEN $6 ELSE time_label END,
          note = CASE WHEN $7::boolean THEN $8 ELSE note END,
          position = coalesce($9, position)
        WHERE id = $2 AND trip_id = $1`,
      [id, itemId, b.day !== undefined, b.day ?? null, b.timeLabel !== undefined, b.timeLabel ?? null, b.note !== undefined, b.note ?? null, b.position ?? null],
    );
    return { ok: true };
  });

  app.delete('/me/trips/:id/items/:itemId', async (req) => {
    const u = requireUser(req);
    const { id, itemId } = z.object({ id: uuid, itemId: uuid }).parse(req.params);
    await ownTrip(u.id, id);
    await q(`DELETE FROM trip_items WHERE id = $2 AND trip_id = $1`, [id, itemId]);
    return { deleted: true };
  });

  app.post('/me/trips/:id/share', async (req) => {
    const u = requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ enabled: z.boolean() }).parse(req.body);
    await ownTrip(u.id, id);
    const token = b.enabled ? randomToken(18) : null;
    await q(`UPDATE trips SET share_token = $2 WHERE id = $1`, [id, token]);
    return { shareToken: token };
  });

  // ---- Reviews: only for a recorded enquiry that belongs to this traveller ----
  // ---- Share your experience: stars, recommend or not, what you paid, what happened ----
  // Needs sign-in so every rating has an accountable author. A matching Karibu enquiry earns the
  // "Contacted through Karibu" badge. Sharing again updates the same experience.
  app.post('/experiences', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const u = requireUser(req);
    const b = z
      .object({
        listingSlug: z.string().max(120),
        rating: z.number().int().min(1).max(5),
        recommend: z.boolean().optional(),
        travellerType: z.enum(TRAVELLER_TYPES).optional(),
        body: z.string().trim().max(2000).optional(),
        visitedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        refCode: z.string().regex(/^K-[2-9A-HJ-NP-Z]{5}$/).optional(),
        price: z
          .object({
            group: z.enum(PRICE_GROUPS),
            item: z.string().trim().min(2).max(80),
            amount: z.number().int().positive().max(99_999_999),
            unit: z.string().trim().max(40).optional(),
            feel: z.enum(['fair', 'high', 'ripoff']).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    if (b.visitedOn && new Date(b.visitedOn).getTime() > Date.now() + 86_400_000) throw badRequest('That date is in the future');

    const l = await q<{ id: string; vendor_id: string; city_id: number; currency: string }>(
      `SELECT id, vendor_id, city_id, currency FROM public_listings WHERE slug = $1`,
      [b.listingSlug],
    );
    const listing = l.rows[0];
    if (!listing) throw notFound('That listing isn’t available');
    const own = await q(`SELECT 1 FROM vendor_members WHERE vendor_id = $1 AND user_id = $2`, [listing.vendor_id, u.id]);
    if (own.rows[0]) throw new HttpError(403, 'You can’t review your own business', 'own_business');

    return tx(async (c) => {
      // Link to the traveller's own enquiry with this business, if there is one not yet reviewed.
      const enq = await c.query(
        `SELECT e.id FROM enquiries e LEFT JOIN reviews r ON r.enquiry_id = e.id
          WHERE e.user_id = $1 AND e.listing_id = $2 AND r.id IS NULL ${b.refCode ? 'AND e.ref_code = $3' : ''}
          ORDER BY e.created_at DESC LIMIT 1`,
        b.refCode ? [u.id, listing.id, b.refCode] : [u.id, listing.id],
      );
      if (b.refCode && !enq.rows[0]) throw new HttpError(403, 'That reference isn’t one of your enquiries with this business', 'not_your_enquiry');
      const enquiryId: string | null = enq.rows[0]?.id ?? null;

      const existing = enquiryId
        ? { rows: [] as any[] }
        : await c.query(`SELECT id, price_report_id FROM reviews WHERE listing_id = $1 AND user_id = $2 AND enquiry_id IS NULL`, [listing.id, u.id]);
      const prev = existing.rows[0];

      let priceId: string | null = prev?.price_report_id ?? null;
      if (b.price) {
        if (priceId) await c.query(`DELETE FROM price_reports WHERE id = $1`, [priceId]);
        const pr = await c.query(
          `INSERT INTO price_reports (city_id, listing_id, group_name, item, amount, currency, unit, paid_on, feel, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,coalesce($8::date, current_date),$9,$10) RETURNING id`,
          [listing.city_id, listing.id, b.price.group, b.price.item, b.price.amount, listing.currency, b.price.unit || null, b.visitedOn ?? null, b.price.feel ?? null, u.id],
        );
        priceId = pr.rows[0].id;
      }

      if (prev) {
        await c.query(
          `UPDATE reviews SET rating = $2, recommend = $3, body = $4, visited_on = $5, price_report_id = $6, traveller_type = $7, updated_at = now() WHERE id = $1`,
          [prev.id, b.rating, b.recommend ?? null, b.body || null, b.visitedOn ?? null, priceId, b.travellerType ?? null],
        );
        return { review: { id: prev.id }, updated: true, contacted: false };
      }
      const ins = await c.query(
        `INSERT INTO reviews (enquiry_id, listing_id, user_id, rating, recommend, body, visited_on, price_report_id, traveller_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [enquiryId, listing.id, u.id, b.rating, b.recommend ?? null, b.body || null, b.visitedOn ?? null, priceId, b.travellerType ?? null],
      );
      return { review: { id: ins.rows[0].id }, updated: false, contacted: !!enquiryId };
    });
  });

  app.post('/reviews', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req) => {
    const u = requireUser(req);
    const b = z.object({ refCode: z.string().regex(/^K-[2-9A-HJ-NP-Z]{5}$/), rating: z.number().int().min(1).max(5), body: z.string().trim().max(2000).optional() }).parse(req.body);
    const { rows } = await q(
      `SELECT e.id, e.listing_id, e.user_id, e.created_at FROM enquiries e WHERE e.ref_code = $1`,
      [b.refCode],
    );
    const e = rows[0];
    if (!e || !e.listing_id) throw notFound('We could not find that enquiry reference');
    if (e.user_id !== u.id) throw new HttpError(403, 'You can only review businesses you contacted through Karibu', 'not_your_enquiry');
    const ins = await q(
      `INSERT INTO reviews (enquiry_id, listing_id, user_id, rating, body) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (enquiry_id) DO NOTHING RETURNING id`,
      [e.id, e.listing_id, u.id, b.rating, b.body || null],
    );
    if (!ins.rows[0]) throw new HttpError(409, 'You have already reviewed this enquiry', 'already_reviewed');
    return { review: ins.rows[0] };
  });
}
