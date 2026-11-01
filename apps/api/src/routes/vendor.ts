import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { q, tx } from '../db/pool.js';
import { requireRole, requireUser } from '../auth.js';
import { syncVendorContacts } from './auth.js';
import { outbox } from '../lib/notify.js';
import { isCompanyEmail, sha256 } from '../lib/util.js';
import { CATEGORIES, PRICE_UNITS, type Category, isValidSubtype, validateAttributes, AMENITIES } from '../lib/categories.js';
import { savePrivateFile } from '../lib/storage.js';
import { startCheckout, verifyWebhook } from '../lib/payments.js';
import { HttpError, badRequest, forbidden, notFound, slugify, randomToken } from '../lib/util.js';

const uuid = z.string().uuid();
const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, for example +254712345678');

/** The vendor this signed-in user manages (first one, or the one named in the x-vendor-id header). */
/** The business the signed-in person runs. Access comes from vendor_members, not from how they signed in. */
async function myVendor(req: FastifyRequest) {
  const u = requireUser(req);
  const want = req.headers['x-vendor-id'];
  const { rows } = await q(
    `SELECT v.* FROM vendor_members m JOIN vendors v ON v.id = m.vendor_id
      WHERE m.user_id = $1 AND ($2::uuid IS NULL OR v.id = $2::uuid) ORDER BY v.created_at LIMIT 1`,
    [u.id, typeof want === 'string' && uuid.safeParse(want).success ? want : null],
  );
  if (!rows[0]) throw new HttpError(404, 'Create your business profile first', 'no_vendor');
  return { user: u, vendor: rows[0] };
}

const listingInput = z.object({
  cityId: z.number().int(),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  subtype: z.string().min(2).max(60),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(10).max(200),
  description: z.string().trim().max(5000).optional(),
  lat: z.number().min(-12).max(16),     // East Africa bounding box with margin
  lon: z.number().min(22).max(52),
  locationIsPrivate: z.boolean().default(false),
  budgetTier: z.enum(['budget', 'mid', 'premium']).optional(),
  priceFrom: z.number().int().min(0).optional(),
  priceTo: z.number().int().min(0).optional(),
  priceUnit: z.enum(PRICE_UNITS).default('per person'),
  attributes: z.record(z.string(), z.unknown()).default({}),
  amenities: z.array(z.enum(AMENITIES)).max(30).default([]),
  photos: z.array(z.object({ url: z.string().url().max(500), alt: z.string().max(160).default('') })).max(20).default([]),
});

function checkListing(b: z.infer<typeof listingInput>) {
  if (!isValidSubtype(b.category, b.subtype)) throw badRequest(`"${b.subtype}" is not a valid type for ${b.category}`);
  if (b.priceFrom !== undefined && b.priceTo !== undefined && b.priceTo < b.priceFrom) throw badRequest('The top of the price range must be at least the starting price');
  if (b.category === 'stay' && !b.budgetTier) throw badRequest('Choose a budget tier for stays');
  try {
    return validateAttributes(b.category, b.attributes);
  } catch (e) {
    throw badRequest(`Details for ${b.category}: ${(e as z.ZodError).issues?.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') ?? 'invalid'}`);
  }
}

export async function vendorRoutes(app: FastifyInstance) {
  // ---- Business profile ----
  // Any signed-in person can register a business and becomes its owner.
  app.post('/vendor/businesses', async (req) => {
    const u = requireUser(req);
    const b = z
      .object({ name: z.string().trim().min(2).max(120), countryCode: z.string().length(2).toUpperCase(), whatsapp: e164, phone: e164.optional(), email: z.string().email().optional(), licenceNumber: z.string().max(60).optional() })
      .parse(req.body);
    const country = await q('SELECT code FROM countries WHERE code = $1', [b.countryCode]);
    if (!country.rows[0]) throw badRequest('Karibu does not cover that country yet');
    const vendor = await tx(async (c) => {
      const slug = `${slugify(b.name)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
      const v = await c.query(
        `INSERT INTO vendors (name, slug, country_code, whatsapp_e164, phone_e164, email, licence_number) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, slug`,
        [b.name, slug, b.countryCode, b.whatsapp, b.phone ?? null, b.email ?? null, b.licenceNumber ?? null],
      );
      await c.query(`INSERT INTO vendor_members (vendor_id, user_id, is_owner) VALUES ($1,$2,true)`, [v.rows[0].id, u.id]);
      // WhatsApp or email that match the owner's verified sign-in details count as verified straight away.
      await syncVendorContacts(c, u.id);
      return v.rows[0];
    });
    return { vendor };
  });

  // Edit contact details. Changing one clears its verification until it's proven again.
  app.patch('/vendor/me', async (req) => {
    const { user, vendor } = await myVendor(req);
    const b = z
      .object({ name: z.string().trim().min(2).max(120).optional(), about: z.string().trim().max(600).nullable().optional(), website: z.string().trim().url().regex(/^https?:\/\//).max(200).nullable().optional(), whatsapp: e164.optional(), phone: e164.nullable().optional(), email: z.string().trim().toLowerCase().email().nullable().optional(), licenceNumber: z.string().max(60).nullable().optional() })
      .parse(req.body);
    await tx(async (c) => {
      await c.query(
        `UPDATE vendors SET name = coalesce($2, name),
                whatsapp_e164 = coalesce($3, whatsapp_e164),
                whatsapp_verified_at = CASE WHEN $3::text IS NOT NULL AND $3 <> whatsapp_e164 THEN NULL ELSE whatsapp_verified_at END,
                phone_e164 = CASE WHEN $4::boolean THEN $5 ELSE phone_e164 END,
                email = CASE WHEN $6::boolean THEN $7 ELSE email END,
                email_verified_at = CASE WHEN $6::boolean AND $7::text IS DISTINCT FROM email THEN NULL ELSE email_verified_at END,
                licence_number = CASE WHEN $8::boolean THEN $9 ELSE licence_number END,
                about = CASE WHEN $10::boolean THEN $11 ELSE about END,
                website = CASE WHEN $12::boolean THEN $13 ELSE website END,
                updated_at = now()
          WHERE id = $1`,
        [vendor.id, b.name ?? null, b.whatsapp ?? null, b.phone !== undefined, b.phone ?? null, b.email !== undefined, b.email ?? null, b.licenceNumber !== undefined, b.licenceNumber ?? null,
         b.about !== undefined, b.about || null, b.website !== undefined, b.website || null],
      );
      await syncVendorContacts(c, user.id);
    });
    return { ok: true };
  });

  // Prove the business email by clicking a link sent to it (for a shared inbox like bookings@ that nobody signs in with).
  app.post('/vendor/email/start', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req) => {
    const { vendor } = await myVendor(req);
    if (!vendor.email) throw badRequest('Add a business email first');
    if (vendor.email_verified_at) return { sent: false, alreadyVerified: true };
    const token = randomToken();
    await q(`INSERT INTO login_tokens (kind, target, token_hash, expires_at) VALUES ('vendor_email', $1, $2, now() + interval '2 days')`, [vendor.id, sha256(token)]);
    const link = `${config.webUrl}/vendor/verify-email?token=${encodeURIComponent(token)}`;
    await outbox.email(vendor.email, `Confirm ${vendor.name}'s email on Karibu`, `Tap to confirm this is ${vendor.name}'s email address on Karibu:\n\n${link}\n\nThe link expires in 2 days. If you don't know about this, ignore this email.`);
    return { sent: true, ...(config.exposeDevSecrets ? { devLink: link, devToken: token } : {}) };
  });

  // Public: whoever can open the inbox can confirm it. No sign-in needed.
  app.post('/vendor/email/verify', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.body);
    const { rows } = await q(
      `UPDATE login_tokens SET used_at = now() WHERE token_hash = $1 AND kind = 'vendor_email' AND used_at IS NULL AND expires_at > now() RETURNING target`,
      [sha256(token)],
    );
    if (!rows[0]) throw badRequest('This link has expired or was already used. Ask for a new one from your business dashboard.');
    const v = await q(`UPDATE vendors SET email_verified_at = now() WHERE id = $1 RETURNING name, email`, [rows[0].target]);
    return { verified: true, business: v.rows[0]?.name, email: v.rows[0]?.email };
  });

  app.get('/vendor/me', async (req) => {
    const { vendor } = await myVendor(req);
    const [listings, docs, plan] = await Promise.all([
      q(
        `SELECT l.id, l.slug, l.title, l.category, l.subtype, l.status, l.updated_at AS "updatedAt", l.last_confirmed_at AS "lastConfirmedAt",
                (SELECT reason FROM listing_events e WHERE e.listing_id = l.id ORDER BY e.id DESC LIMIT 1) AS "lastNote"
           FROM listings l WHERE l.vendor_id = $1 ORDER BY l.created_at DESC`,
        [vendor.id],
      ),
      q(`SELECT id, doc_type AS "docType", file_name AS "fileName", result, uploaded_at AS "uploadedAt" FROM vendor_documents WHERE vendor_id = $1 ORDER BY uploaded_at DESC`, [vendor.id]),
      q(`SELECT code, name, monthly_usd AS "monthlyUsd", max_listings AS "maxListings", features FROM plans WHERE code = $1`, [vendor.plan]),
    ]);
    return {
      vendor: {
        id: vendor.id, name: vendor.name, slug: vendor.slug, country: vendor.country_code, whatsapp: vendor.whatsapp_e164,
        verificationLevel: vendor.verification_level, verifiedAt: vendor.verified_at, reverifyDue: vendor.reverify_due,
        suspended: vendor.is_suspended, plan: plan.rows[0],
        email: vendor.email, emailVerified: !!vendor.email_verified_at, emailIsCompany: vendor.email ? isCompanyEmail(vendor.email) : false,
        whatsappVerified: !!vendor.whatsapp_verified_at, licenceNumber: vendor.licence_number, about: vendor.about, website: vendor.website,
      },
      listings: listings.rows,
      documents: docs.rows,
    };
  });

  // ---- Listings ----
  app.post('/vendor/listings', async (req) => {
    const { user, vendor } = await myVendor(req);
    const b = listingInput.parse(req.body);
    const attributes = checkListing(b);
    const plan = await q(`SELECT max_listings FROM plans WHERE code = $1`, [vendor.plan]);
    const count = await q(`SELECT count(*) AS n FROM listings WHERE vendor_id = $1 AND status NOT IN ('rejected','expired')`, [vendor.id]);
    if (count.rows[0].n >= plan.rows[0].max_listings)
      throw new HttpError(402, `Your ${vendor.plan} plan allows ${plan.rows[0].max_listings} listing(s). Upgrade to add more.`, 'plan_limit');
    const city = await q(`SELECT country_code FROM cities WHERE id = $1`, [b.cityId]);
    if (!city.rows[0]) throw badRequest('Unknown destination');
    const currency = await q(`SELECT currency FROM countries WHERE code = $1`, [city.rows[0].country_code]);
    const listing = await tx(
      async (c) => {
        const slug = `${slugify(b.title)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
        const l = await c.query(
          `INSERT INTO listings (vendor_id, city_id, category, subtype, title, slug, summary, description, location, location_is_private,
                                 budget_tier, currency, price_from, price_to, price_unit, attributes, amenities)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_MakePoint($9,$10),4326)::geography, $11,$12,$13,$14,$15,$16,$17,$18)
           RETURNING id, slug, status`,
          [vendor.id, b.cityId, b.category, b.subtype, b.title, slug, b.summary, b.description ?? null, b.lon, b.lat, b.locationIsPrivate,
           b.budgetTier ?? null, currency.rows[0].currency, b.priceFrom ?? null, b.priceTo ?? null, b.priceUnit, JSON.stringify(attributes), b.amenities],
        );
        for (const [i, p] of b.photos.entries()) {
          await c.query(`INSERT INTO listing_photos (listing_id, url, alt, position) VALUES ($1,$2,$3,$4)`, [l.rows[0].id, p.url, p.alt, i]);
        }
        return l.rows[0];
      },
      { actor: user.id },
    );
    return { listing };
  });

  app.get('/vendor/listings/:id', async (req) => {
    const { vendor } = await myVendor(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { rows } = await q(
      `SELECT l.id, l.slug, l.city_id AS "cityId", l.category, l.subtype, l.title, l.summary, l.description,
              ST_Y(l.location::geometry) AS lat, ST_X(l.location::geometry) AS lon, l.location_is_private AS "locationIsPrivate",
              l.budget_tier AS "budgetTier", l.currency, l.price_from AS "priceFrom", l.price_to AS "priceTo", l.price_unit AS "priceUnit",
              l.attributes, l.amenities, l.status,
              coalesce((SELECT json_agg(json_build_object('url', url, 'alt', alt) ORDER BY position) FROM listing_photos p WHERE p.listing_id = l.id), '[]') AS photos,
              (SELECT json_agg(json_build_object('from', from_status, 'to', to_status, 'reason', reason, 'at', created_at) ORDER BY id DESC) FROM listing_events e WHERE e.listing_id = l.id) AS history
         FROM listings l WHERE l.id = $1 AND l.vendor_id = $2`,
      [id, vendor.id],
    );
    if (!rows[0]) throw notFound('Listing not found');
    return { listing: rows[0] };
  });

  app.put('/vendor/listings/:id', async (req) => {
    const { user, vendor } = await myVendor(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = listingInput.parse(req.body);
    const attributes = checkListing(b);
    await tx(
      async (c) => {
        const cur = await c.query(`SELECT status FROM listings WHERE id = $1 AND vendor_id = $2 FOR UPDATE`, [id, vendor.id]);
        if (!cur.rows[0]) throw notFound('Listing not found');
        if (['in_review', 'suspended'].includes(cur.rows[0].status)) throw badRequest('This listing cannot be edited while it is in review or suspended');
        // Editing a live listing sends it back to review so travellers only see checked information.
        const nextStatus = cur.rows[0].status === 'live' ? 'submitted' : cur.rows[0].status;
        await c.query(
          `UPDATE listings SET city_id=$3, category=$4, subtype=$5, title=$6, summary=$7, description=$8,
                  location=ST_SetSRID(ST_MakePoint($9,$10),4326)::geography, location_is_private=$11, budget_tier=$12,
                  price_from=$13, price_to=$14, price_unit=$15, attributes=$16, amenities=$17, status=$18
            WHERE id=$1 AND vendor_id=$2`,
          [id, vendor.id, b.cityId, b.category, b.subtype, b.title, b.summary, b.description ?? null, b.lon, b.lat, b.locationIsPrivate,
           b.budgetTier ?? null, b.priceFrom ?? null, b.priceTo ?? null, b.priceUnit, JSON.stringify(attributes), b.amenities, nextStatus],
        );
        await c.query(`DELETE FROM listing_photos WHERE listing_id = $1`, [id]);
        for (const [i, p] of b.photos.entries()) {
          await c.query(`INSERT INTO listing_photos (listing_id, url, alt, position) VALUES ($1,$2,$3,$4)`, [id, p.url, p.alt, i]);
        }
      },
      { actor: user.id, reason: 'Vendor edited listing' },
    );
    return { ok: true };
  });

  app.post('/vendor/listings/:id/submit', async (req) => {
    const { user, vendor } = await myVendor(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { rows } = await q(`SELECT status FROM listings WHERE id = $1 AND vendor_id = $2`, [id, vendor.id]);
    if (!rows[0]) throw notFound('Listing not found');
    if (!['draft', 'changes_requested', 'expired'].includes(rows[0].status)) throw badRequest(`A ${rows[0].status.replace('_', ' ')} listing cannot be submitted`);
    await tx((c) => c.query(`UPDATE listings SET status = 'submitted' WHERE id = $1`, [id]), { actor: user.id, reason: 'Submitted by vendor' });
    return { status: 'submitted' };
  });

  /** Vendor confirms details are still accurate (freshness). */
  app.post('/vendor/listings/:id/confirm', async (req) => {
    const { vendor } = await myVendor(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const r = await q(`UPDATE listings SET last_confirmed_at = now() WHERE id = $1 AND vendor_id = $2 AND status = 'live' RETURNING last_confirmed_at`, [id, vendor.id]);
    if (!r.rows[0]) throw badRequest('Only live listings can be confirmed');
    return { lastConfirmedAt: r.rows[0].last_confirmed_at };
  });

  app.post('/vendor/listings/:id/dates', async (req) => {
    const { vendor } = await myVendor(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), ticketUrl: z.string().url().optional() }).parse(req.body);
    if (b.endsAt <= b.startsAt && new Date(b.endsAt) <= new Date(b.startsAt)) throw badRequest('End time must be after the start');
    const own = await q(`SELECT 1 FROM listings WHERE id = $1 AND vendor_id = $2`, [id, vendor.id]);
    if (!own.rows[0]) throw notFound('Listing not found');
    const { rows } = await q(`INSERT INTO event_dates (listing_id, starts_at, ends_at, ticket_url, confirmed_at) VALUES ($1,$2,$3,$4, now()) RETURNING id`, [id, b.startsAt, b.endsAt, b.ticketUrl ?? null]);
    return { date: rows[0] };
  });

  // ---- Documents (private) ----
  app.post('/vendor/documents', async (req) => {
    const { vendor } = await myVendor(req);
    const file = await req.file();
    if (!file) throw badRequest('Attach a file');
    const docType = z.enum(['national_id', 'business_registration', 'tourism_licence', 'driving_licence', 'psv_badge', 'insurance', 'event_permit', 'photo_permission', 'other']).parse((file.fields.docType as any)?.value);
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw badRequest('Upload a PDF, JPG, PNG or WEBP file');
    const buf = await file.toBuffer();
    const key = await savePrivateFile(`vendor-docs/${vendor.id}`, file.filename, buf);
    const { rows } = await q(`INSERT INTO vendor_documents (vendor_id, doc_type, storage_key, file_name) VALUES ($1,$2,$3,$4) RETURNING id, doc_type AS "docType", result`, [vendor.id, docType, key, file.filename]);
    return { document: rows[0] };
  });

  // ---- Enquiries and stats ----
  app.get('/vendor/stats', async (req) => {
    const { vendor } = await myVendor(req);
    const { weeks } = z.object({ weeks: z.coerce.number().int().min(1).max(52).default(8) }).parse(req.query);
    const { rows } = await q(
      `SELECT date_trunc('week', e.created_at)::date AS week, count(*) AS enquiries,
              count(*) FILTER (WHERE e.source_code IS NOT NULL) AS "fromCreators"
         FROM enquiries e WHERE e.vendor_id = $1 AND e.created_at > now() - make_interval(weeks => $2)
        GROUP BY 1 ORDER BY 1`,
      [vendor.id, weeks],
    );
    const totals = await q(
      `SELECT (SELECT count(*) FROM enquiries WHERE vendor_id = $1 AND created_at > now() - interval '30 days') AS "enquiries30d",
              (SELECT count(*) FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE l.vendor_id = $1) AS reviews,
              (SELECT round(avg(r.rating)::numeric,1) FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE l.vendor_id = $1 AND r.status='published') AS rating`,
      [vendor.id],
    );
    return { weekly: rows, totals: totals.rows[0] };
  });

  app.get('/vendor/enquiries', async (req) => {
    const { vendor } = await myVendor(req);
    const { rows } = await q(
      `SELECT e.ref_code AS "refCode", e.channel, e.requested_date AS "requestedDate", e.created_at AS "createdAt", e.source_code AS "sourceCode",
              l.title AS listing
         FROM enquiries e LEFT JOIN listings l ON l.id = e.listing_id WHERE e.vendor_id = $1 ORDER BY e.created_at DESC LIMIT 500`,
      [vendor.id],
    );
    return { enquiries: rows };
  });

  app.get('/vendor/reviews', async (req) => {
    const { vendor } = await myVendor(req);
    const { rows } = await q(
      `SELECT r.id, r.rating, r.body, r.vendor_reply AS "vendorReply", r.created_at AS "createdAt", l.title AS listing
         FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE l.vendor_id = $1 ORDER BY r.created_at DESC`,
      [vendor.id],
    );
    return { reviews: rows };
  });

  app.post('/vendor/reviews/:id/reply', async (req) => {
    const { vendor } = await myVendor(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z.object({ reply: z.string().trim().min(2).max(1000) }).parse(req.body);
    const r = await q(
      `UPDATE reviews r SET vendor_reply = $3 FROM listings l
        WHERE r.id = $1 AND l.id = r.listing_id AND l.vendor_id = $2 AND r.vendor_reply IS NULL RETURNING r.id`,
      [id, vendor.id, b.reply],
    );
    if (!r.rows[0]) throw badRequest('You can reply once to each review');
    return { ok: true };
  });

  // ---- Plans and billing (vendor pays Karibu only) ----
  app.get('/plans', async () => {
    const { rows } = await q(`SELECT code, name, monthly_usd AS "monthlyUsd", max_listings AS "maxListings", features FROM plans ORDER BY monthly_usd`);
    return { plans: rows, earlyAccess: process.env.EARLY_ACCESS !== 'false' };
  });

  app.post('/vendor/subscription', async (req) => {
    const { user, vendor } = await myVendor(req);
    const b = z.object({ plan: z.enum(['free', 'pro', 'featured']), email: z.string().email().optional() }).parse(req.body);
    if (b.plan === 'free') {
      await q(`UPDATE vendors SET plan = 'free' WHERE id = $1`, [vendor.id]);
      await q(`UPDATE subscriptions SET status = 'cancelled' WHERE vendor_id = $1 AND status = 'active'`, [vendor.id]);
      return { plan: 'free' };
    }
    const email = b.email ?? vendor.email ?? user.email;
    if (!email) throw badRequest('Add a billing email to upgrade');
    const earlyAccess = process.env.EARLY_ACCESS !== 'false';
    const checkout = earlyAccess ? ({ simulated: true } as const) : await startCheckout({ email, plan: b.plan, vendorId: vendor.id, callbackUrl: `${config.webUrl}/vendor/plan?done=1` });
    if (checkout.simulated) {
      // Early access (or no payment provider configured): plan is free and activates now.
      await tx(async (c) => {
        await c.query(`UPDATE vendors SET plan = $2 WHERE id = $1`, [vendor.id, b.plan]);
        await c.query(`INSERT INTO subscriptions (vendor_id, plan, provider, current_period_end) VALUES ($1,$2,'early_access', now() + interval '30 days')`, [vendor.id, b.plan]);
      });
      return { plan: b.plan, earlyAccess: true };
    }
    return { checkoutUrl: checkout.url };
  });

  // Paystack webhook: needs the exact raw body for signature verification.
  app.post('/webhooks/paystack', { config: { rawBody: true } }, async (req, reply) => {
    const raw = (req as any).rawBody as string | undefined;
    if (!raw || !verifyWebhook(raw, req.headers['x-paystack-signature'] as string | undefined)) return reply.code(401).send({ error: 'bad signature' });
    const evt = JSON.parse(raw) as { event: string; data: any };
    await q(`INSERT INTO billing_events (provider, event_type, provider_ref, payload) VALUES ('paystack', $1, $2, $3)`, [evt.event, evt.data?.subscription_code ?? evt.data?.reference ?? null, raw]);
    const vendorId = evt.data?.metadata?.vendorId;
    const plan = evt.data?.metadata?.plan;
    if (evt.event === 'charge.success' && vendorId && (plan === 'pro' || plan === 'featured')) {
      await tx(async (c) => {
        await c.query(`UPDATE vendors SET plan = $2 WHERE id = $1`, [vendorId, plan]);
        await c.query(
          `INSERT INTO subscriptions (vendor_id, plan, provider, provider_ref, current_period_end) VALUES ($1,$2,'paystack',$3, now() + interval '31 days')
           ON CONFLICT (provider_ref) DO UPDATE SET current_period_end = now() + interval '31 days', status = 'active'`,
          [vendorId, plan, evt.data.reference],
        );
      });
    }
    if (evt.event === 'subscription.disable' || evt.event === 'subscription.not_renew') {
      await q(`UPDATE subscriptions SET status = 'cancelled' WHERE provider_ref = $1`, [evt.data?.subscription_code]);
    }
    return { received: true };
  });

  void forbidden;
}
