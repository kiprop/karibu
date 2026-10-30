import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { makeApp, client, signInEmail, signInPhone } from './helpers.js';
import { pool } from '../src/db/pool.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('discovery', () => {
  it('health check passes', async () => {
    const r = await client(app).get('/health');
    expect(r.json).toEqual({ ok: true });
  });

  it('lists countries with Kenya live and others upcoming', async () => {
    const r = await client(app).get('/countries');
    const ke = r.json.countries.find((c: any) => c.code === 'KE');
    expect(ke.isLive).toBe(true);
    expect(r.json.countries.find((c: any) => c.code === 'TZ').isLive).toBe(false);
  });

  it('searches by category and returns only verified public listings', async () => {
    const r = await client(app).get('/listings?category=stay&country=KE');
    expect(r.status).toBe(200);
    expect(r.json.total).toBe(5);
    expect(r.json.results.every((l: any) => l.category === 'stay' && l.verificationLevel >= 1)).toBe(true);
    // Pending vendor submission is never public
    const all = await client(app).get('/listings?q=supper');
    expect(all.json.results.find((l: any) => l.title.includes('supper'))).toBeUndefined();
  });

  it('filters game drives by park text, amenities and budget', async () => {
    const r = await client(app).get('/listings?q=mara&category=safari');
    expect(r.json.results.length).toBeGreaterThanOrEqual(1);
    const a = await client(app).get('/listings?category=stay&amenities=pool');
    expect(a.json.results.every((l: any) => l.amenities.includes('pool'))).toBe(true);
    const b = await client(app).get('/listings?category=stay&budget=premium');
    expect(b.json.results.map((l: any) => l.title)).toEqual(['Resort with Kilimanjaro views']);
    const bad = await client(app).get('/listings?amenities=helipad');
    expect(bad.status).toBe(400);
  });

  it('sorts by distance and filters by radius in kilometres', async () => {
    const r = await client(app).get('/listings?lat=-1.2864&lon=36.8172&radiusKm=30&sort=distance');
    expect(r.status).toBe(200);
    const d = r.json.results.map((x: any) => x.distanceM);
    expect([...d].sort((x, y) => x - y)).toEqual(d);
    expect(d.every((m: number) => m <= 30000)).toBe(true);
    expect(r.json.results.find((x: any) => x.city === 'Samburu')).toBeUndefined();
  });

  it('caps featured cards at two and labels them', async () => {
    const r = await client(app).get('/listings');
    expect(r.json.featured.length).toBeLessThanOrEqual(2);
    expect(r.json.featured.every((f: any) => f.isFeatured)).toBe(true);
  });

  it('shows listing detail and hides the exact pin for home hosts', async () => {
    const r = await client(app).get('/listings/home-cooking-class-swahili-coast-dishes');
    expect(r.status).toBe(200);
    expect(r.json.listing.locationIsPrivate).toBe(true);
    expect(Math.round(r.json.listing.lat * 100) / 100).toBe(r.json.listing.lat);
    const missing = await client(app).get('/listings/rooftop-supper-club');
    expect(missing.status).toBe(404);
  });
});

describe('enquiries and WhatsApp handoff', () => {
  it('records the enquiry first and returns an encoded wa.me link', async () => {
    const list = await client(app).get('/listings?category=transport');
    const id = list.json.results[0].id;
    const r = await client(app, { 'x-device-id': 'device-abc-123' }).post('/enquiries', { listingId: id, requestedDate: '2026-11-05' });
    expect(r.status).toBe(200);
    expect(r.json.enquiry.refCode).toMatch(/^K-[2-9A-HJ-NP-Z]{5}$/);
    expect(r.json.whatsappUrl).toMatch(/^https:\/\/wa\.me\/2547\d+\?text=/);
    expect(decodeURIComponent(r.json.whatsappUrl.split('text=')[1])).toContain(r.json.enquiry.refCode);
    expect(r.json.message).toContain('Thu 5 Nov');
  });

  it('refuses enquiries for listings that are not public', async () => {
    const { rows } = await pool.query(`SELECT id FROM listings WHERE slug = 'rooftop-supper-club'`);
    const r = await client(app).post('/enquiries', { listingId: rows[0].id });
    expect(r.status).toBe(404);
  });
});

describe('traveller accounts', () => {
  it('signs in by email link once only, and merges guest enquiries', async () => {
    const guest = client(app, { 'x-device-id': 'device-merge-0001' });
    const list = await guest.get('/listings?category=guide');
    const listingId = list.json.results[0].id;
    const enq = await guest.post('/enquiries', { listingId });
    const start = await guest.post('/auth/email/start', { email: 'Amina@Example.com' });
    const v = await guest.post('/auth/email/verify', { token: start.json.devToken, deviceId: 'device-merge-0001', favourites: [listingId] });
    expect(v.status).toBe(200);
    expect(v.json.user.email).toBe('amina@example.com');
    const again = await client(app).post('/auth/email/verify', { token: start.json.devToken });
    expect(again.status).toBe(400);
    const mine = await guest.get('/me/enquiries');
    expect(mine.json.enquiries.map((e: any) => e.refCode)).toContain(enq.json.enquiry.refCode);
    const favs = await guest.get('/me/favourites');
    expect(favs.json.favourites.map((f: any) => f.id)).toContain(listingId);
  });

  it('requires sign-in for favourites and trips', async () => {
    expect((await client(app).get('/me/trips')).status).toBe(401);
    expect((await client(app).put('/me/favourites/00000000-0000-0000-0000-000000000000')).status).toBe(401);
  });

  it('builds, shares and unshares a trip', async () => {
    const c = client(app);
    await signInEmail(c, 'planner@example.com');
    const t = await c.post('/me/trips', { title: 'Kenya in August', startsOn: '2026-08-10', endsOn: '2026-08-17' });
    expect(t.status).toBe(200);
    const bad = await c.post('/me/trips', { title: 'Backwards', startsOn: '2026-08-10', endsOn: '2026-08-01' });
    expect(bad.status).toBe(400);
    const list = await c.get('/listings?category=safari');
    await c.post(`/me/trips/${t.json.trip.id}/items`, { listingId: list.json.results[0].id, day: '2026-08-11', timeLabel: '6:00 am' });
    await c.post(`/me/trips/${t.json.trip.id}/items`, { note: 'Rest day by the pool', day: '2026-08-12' });
    const full = await c.get(`/me/trips/${t.json.trip.id}`);
    expect(full.json.trip.items).toHaveLength(2);
    const share = await c.post(`/me/trips/${t.json.trip.id}/share`, { enabled: true });
    const pub = await client(app).get(`/trips/shared/${share.json.shareToken}`);
    expect(pub.json.trip.title).toBe('Kenya in August');
    await c.post(`/me/trips/${t.json.trip.id}/share`, { enabled: false });
    expect((await client(app).get(`/trips/shared/${share.json.shareToken}`)).status).toBe(404);
    // Another user cannot read it
    const other = client(app);
    await signInEmail(other, 'nosy@example.com');
    expect((await other.get(`/me/trips/${t.json.trip.id}`)).status).toBe(404);
  });

  it('accepts one review per own enquiry and rejects others', async () => {
    const a = client(app);
    await signInEmail(a, 'reviewer-a@example.com');
    const list = await a.get('/listings?category=experience');
    const enq = await a.post('/enquiries', { listingId: list.json.results[0].id });
    const ref = enq.json.enquiry.refCode;
    const ok = await a.post('/reviews', { refCode: ref, rating: 5, body: 'Excellent host, exactly as described.' });
    expect(ok.status).toBe(200);
    expect((await a.post('/reviews', { refCode: ref, rating: 4 })).status).toBe(409);
    const b = client(app);
    await signInEmail(b, 'reviewer-b@example.com');
    expect((await b.post('/reviews', { refCode: ref, rating: 1 })).status).toBe(403);
  });
});

describe('safety tools', () => {
  it('checks operators: verified, watchlist and not found', async () => {
    const v = await client(app).get('/operators/check?query=' + encodeURIComponent('Wanjiru Rides'));
    expect(v.json.result).toBe('verified');
    const w = await client(app).get('/operators/check?query=' + encodeURIComponent('Splendor Holiday'));
    expect(w.json.result).toBe('watchlist');
    const n = await client(app).get('/operators/check?query=' + encodeURIComponent('Totally Unknown Tours Ltd'));
    expect(n.json.result).toBe('not_found');
    const p = await client(app).get('/operators/check?query=' + encodeURIComponent('+254700000109'));
    expect(p.json.result).toBe('verified');
  });

  it('returns country information with review dates and emergency numbers', async () => {
    const r = await client(app).get('/countries/ke/info');
    expect(r.json.pages.map((p: any) => p.slug)).toEqual(['entry', 'health', 'money', 'sim', 'getting-around', 'safety']);
    expect(r.json.contacts.some((c: any) => c.value === '999')).toBe(true);
  });

  it('returns example price ranges flagged as examples', async () => {
    const r = await client(app).get('/cities/nairobi/prices');
    expect(r.json.prices.length).toBeGreaterThan(5);
    expect(r.json.prices.every((p: any) => p.isExample && p.high >= p.low)).toBe(true);
  });

  it('accepts reports from guests', async () => {
    const r = await client(app).post('/reports', { subject: 'Splendor Holiday', category: 'scam', body: 'Asked me to pay a deposit to a personal number.' });
    expect(r.status).toBe(200);
    const empty = await client(app).post('/reports', { category: 'scam', body: 'No subject given here' });
    expect(empty.status).toBe(400);
  });
});

describe('vendors and verification', () => {
  let vendor: ReturnType<typeof client>;
  let listingId: string;
  const admin = () => {
    const c = client(app);
    return c;
  };

  it('signs a vendor in by SMS code and locks out after a wrong code', async () => {
    vendor = client(app);
    const s = await vendor.post('/auth/phone/start', { phone: '+254711222333' });
    const wrong = await vendor.post('/auth/phone/verify', { phone: '+254711222333', code: s.json.devCode === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    const ok = await vendor.post('/auth/phone/verify', { phone: '+254711222333', code: s.json.devCode });
    expect(ok.json.user.role).toBe('vendor');
  });

  it('travellers cannot use vendor endpoints', async () => {
    const t = client(app);
    await signInEmail(t, 'just-a-traveller@example.com');
    expect((await t.post('/vendor/businesses', { name: 'X', countryCode: 'KE', whatsapp: '+254700000001' })).status).toBe(403);
  });

  it('creates a business and a safari listing with validated attributes', async () => {
    const b = await vendor.post('/vendor/businesses', { name: 'Savanna Test Safaris', countryCode: 'KE', whatsapp: '+254711222333' });
    expect(b.status).toBe(200);
    const cities = await vendor.get('/cities?country=KE');
    const mara = cities.json.cities.find((c: any) => c.slug === 'maasai-mara');
    const base = {
      cityId: mara.id, category: 'safari', subtype: 'full-day game drive', title: 'Test full-day drive',
      summary: 'A full day in the reserve with a licensed guide.', lat: -1.44, lon: 35.22, priceFrom: 20000, priceTo: 25000,
      priceUnit: 'per vehicle per day', amenities: ['pop_top_roof'],
    };
    const missingPark = await vendor.post('/vendor/listings', { ...base, attributes: {} });
    expect(missingPark.status).toBe(400);
    const wrongSubtype = await vendor.post('/vendor/listings', { ...base, subtype: 'hot air balloon', attributes: { park: 'Mara' } });
    expect(wrongSubtype.status).toBe(400);
    const ok = await vendor.post('/vendor/listings', { ...base, attributes: { park: 'Maasai Mara National Reserve', format: 'private' } });
    expect(ok.status).toBe(200);
    listingId = ok.json.listing.id;
    expect(ok.json.listing.status).toBe('draft');
  });

  it('enforces the free plan listing limit', async () => {
    const cities = await vendor.get('/cities?country=KE');
    const r = await vendor.post('/vendor/listings', {
      cityId: cities.json.cities[0].id, category: 'guide', subtype: 'city walk', title: 'Second listing', summary: 'This should hit the plan limit.',
      lat: -1.28, lon: 36.82, attributes: {},
    });
    expect(r.status).toBe(402);
  });

  it('submits, then staff must give a note to request changes and the right level to approve', async () => {
    expect((await vendor.post(`/vendor/listings/${listingId}/submit`)).json.status).toBe('submitted');
    const staff = admin();
    await signInEmail(staff, 'admin@karibu.example');
    const queue = await staff.get('/admin/queue');
    expect(queue.json.queue.map((x: any) => x.id)).toContain(listingId);
    expect((await staff.post(`/admin/listings/${listingId}/decision`, { decision: 'changes' })).status).toBe(400);
    // Safari needs level 2
    const low = await staff.post(`/admin/listings/${listingId}/decision`, { decision: 'approve', level: 1 });
    expect(low.status).toBe(400);
    const ok = await staff.post(`/admin/listings/${listingId}/decision`, { decision: 'approve', level: 2, note: 'Licence and vehicle checked' });
    expect(ok.json.status).toBe('live');
    const pub = await client(app).get('/listings?q=' + encodeURIComponent('Test full-day drive'));
    expect(pub.json.results.map((l: any) => l.id)).toContain(listingId);
    const detail = await staff.get(`/admin/listings/${listingId}`);
    expect(detail.json.history.map((h: any) => h.to)).toEqual(['live', 'in_review', 'submitted']);
  });

  it('editing a live listing sends it back to review', async () => {
    const cur = await vendor.get(`/vendor/listings/${listingId}`);
    const l = cur.json.listing;
    const r = await vendor.put(`/vendor/listings/${listingId}`, {
      cityId: l.cityId, category: l.category, subtype: l.subtype, title: l.title, summary: l.summary + ' Updated.', lat: l.lat, lon: l.lon,
      priceFrom: l.priceFrom, priceTo: l.priceTo, priceUnit: l.priceUnit, attributes: l.attributes, amenities: l.amenities,
    });
    expect(r.status).toBe(200);
    const after = await vendor.get(`/vendor/listings/${listingId}`);
    expect(after.json.listing.status).toBe('submitted');
  });

  it('the database refuses illegal status jumps', async () => {
    const { rows } = await pool.query(`INSERT INTO listings (vendor_id, city_id, category, subtype, title, slug, summary, location, currency)
      SELECT vendor_id, city_id, 'guide', 'city walk', 'Illegal jump', 'illegal-jump', 'x', location, 'KES' FROM listings WHERE id = $1 RETURNING id`, [listingId]);
    await expect(pool.query(`UPDATE listings SET status = 'live' WHERE id = $1`, [rows[0].id])).rejects.toThrow(/Illegal listing transition/);
  });

  it('upgrades a plan during early access without payment', async () => {
    const r = await vendor.post('/vendor/subscription', { plan: 'pro', email: 'billing@example.com' });
    expect(r.json).toMatchObject({ plan: 'pro', earlyAccess: true });
    expect((await vendor.get('/vendor/me')).json.vendor.plan.code).toBe('pro');
  });

  it('rejects payment webhooks with a bad signature and accepts a signed one', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_1', metadata: {} } });
    const bad = await app.inject({ method: 'POST', url: '/v1/webhooks/paystack', payload: body, headers: { 'content-type': 'application/json', 'x-paystack-signature': 'nope' } });
    expect(bad.statusCode).toBe(401);
    const sig = createHmac('sha512', 'sk_test_karibu').update(body).digest('hex');
    const good = await app.inject({ method: 'POST', url: '/v1/webhooks/paystack', payload: body, headers: { 'content-type': 'application/json', 'x-paystack-signature': sig } });
    expect(good.statusCode).toBe(200);
  });

  it('staff see guest reports and can resolve them', async () => {
    const staff = client(app);
    await signInEmail(staff, 'admin@karibu.example');
    const r = await staff.get('/admin/reports');
    expect(r.json.reports.length).toBeGreaterThan(0);
    expect(r.json.reports[0].category).toMatch(/safety|scam/);
    const done = await staff.post(`/admin/reports/${r.json.reports[0].id}`, { status: 'actioned', resolution: 'Added to watchlist' });
    expect(done.status).toBe(200);
  });
});
