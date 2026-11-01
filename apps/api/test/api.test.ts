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

  it('signs in by SMS code as an ordinary account, and wrong codes use up attempts', async () => {
    vendor = client(app);
    const s = await vendor.post('/auth/phone/start', { phone: '+254711222333' });
    const wrong = await vendor.post('/auth/phone/verify', { phone: '+254711222333', code: s.json.devCode === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    const ok = await vendor.post('/auth/phone/verify', { phone: '+254711222333', code: s.json.devCode });
    expect(ok.json.user.role).toBe('traveller');

    const x = client(app);
    const s2 = await x.post('/auth/phone/start', { phone: '+254799000111' });
    for (let i = 0; i < 5; i++) await x.post('/auth/phone/verify', { phone: '+254799000111', code: s2.json.devCode === '000000' ? '111111' : '000000' });
    expect((await x.post('/auth/phone/verify', { phone: '+254799000111', code: s2.json.devCode })).status).toBe(400);
  });

  it('business tools need a sign-in and a business, not a special account type', async () => {
    expect((await client(app).post('/vendor/businesses', { name: 'X', countryCode: 'KE', whatsapp: '+254700000001' })).status).toBe(401);
    const t = client(app);
    await signInEmail(t, 'just-a-traveller@example.com');
    const me = await t.get('/vendor/me');
    expect(me.status).toBe(404);
    expect(me.json.code).toBe('no_vendor');
  });

  it('creates a business and a safari listing with validated attributes', async () => {
    const b = await vendor.post('/vendor/businesses', { name: 'Savanna Test Safaris', countryCode: 'KE', whatsapp: '+254711222333' });
    expect(b.status).toBe(200);
    // WhatsApp matches the number the owner signed in with, so it is verified already.
    expect((await vendor.get('/vendor/me')).json.vendor.whatsappVerified).toBe(true);
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

describe('I paid this much', () => {
  const guest = () => client(app, { 'x-device-id': 'device-price-test-1' });

  it('shows community ranges next to checked prices', async () => {
    const r = await client(app).get('/cities/nairobi/prices');
    const ugali = r.json.community.find((x: any) => x.item === 'Plate of ugali with stew');
    expect(ugali.reports).toBe(4);
    expect(ugali.median).toBe(250);
    expect(ugali.typicalReports).toBe(3);
    expect(ugali.ripoffShare).toBe(0.25);
    expect(r.json.recent.length).toBeGreaterThan(5);
    expect(r.json.minReports).toBe(3);
  });

  it('judges a quote against checked and community prices, matching loosely', async () => {
    const fair = await client(app).get('/prices/fair?city=nairobi&item=ugali%20with%20stew&amount=300');
    expect(fair.status).toBe(200);
    expect(fair.json.verdict).toBe('fair');
    const steep = await client(app).get('/prices/fair?city=nairobi&item=plate%20of%20ugali&amount=900');
    expect(steep.json.verdict).toBe('very_high');
    expect(steep.json.times).toBeGreaterThan(2);
    const short = await client(app).get('/prices/fair?city=nairobi&item=ugali&amount=800');
    expect(short.json.verdict).toBe('very_high');
    const unknown = await client(app).get('/prices/fair?city=nairobi&item=hot%20air%20balloon&amount=50000');
    expect(unknown.json.verdict).toBe('unknown');
  });

  it('lets a guest report a price and tells them how it compares', async () => {
    const r = await guest().post('/prices/reports', { city: 'nairobi', group: 'transport', item: 'Boda ride, about 2 km', amount: 600, feel: 'ripoff', area: 'CBD' });
    expect(r.status).toBe(200);
    expect(r.json.verdict).toBe('very_high');
    expect(r.json.currency).toBe('KES');
    const board = await client(app).get('/cities/nairobi/prices');
    expect(board.json.community.find((x: any) => x.item === 'Boda ride, about 2 km').reports).toBe(4);
  });

  it('rejects reports with no place, future dates or no device', async () => {
    expect((await guest().post('/prices/reports', { group: 'food', item: 'Chapati', amount: 30 })).status).toBe(400);
    expect((await guest().post('/prices/reports', { city: 'nairobi', group: 'food', item: 'Chapati', amount: 30, paidOn: '2099-01-01' })).status).toBe(400);
    expect((await client(app).post('/prices/reports', { city: 'nairobi', group: 'food', item: 'Chapati', amount: 30 })).status).toBe(400);
  });

  it('links a report to a listing and shows what travellers paid there', async () => {
    const list = await client(app).get('/listings?category=safari');
    const slug = list.json.results[0].slug;
    const r = await guest().post('/prices/reports', { listingSlug: slug, group: 'activity', item: 'Full-day game drive', amount: 18000, unit: 'per vehicle', feel: 'fair' });
    expect(r.status).toBe(200);
    const d = await client(app).get(`/listings/${slug}`);
    expect(d.json.listing.paid.reports).toBe(1);
    expect(d.json.listing.paid.median).toBe(18000);
  });

  it('lets reviewers hide a report so it leaves the ranges', async () => {
    const admin = client(app);
    await signInEmail(admin, 'admin@karibu.example');
    const out = await admin.get('/admin/price-reports?view=outliers');
    expect(out.status).toBe(200);
    const target = out.json.reports.find((x: any) => x.item === 'Plate of ugali with stew' && x.amount === 700);
    expect(target).toBeTruthy();
    expect((await admin.post(`/admin/price-reports/${target.id}`, { hidden: true })).status).toBe(400);
    expect((await admin.post(`/admin/price-reports/${target.id}`, { hidden: true, reason: 'Outlier' })).json.hidden).toBe(true);
    const board = await client(app).get('/cities/nairobi/prices');
    expect(board.json.community.find((x: any) => x.item === 'Plate of ugali with stew').reports).toBe(3);
    expect((await client(app).get('/admin/price-reports')).status).toBe(401);
  });
});

describe('one account for travellers and businesses', () => {
  it('a business can sign in with its company email and run its business', async () => {
    const owner = client(app);
    await signInEmail(owner, 'owner@mara-camps.co.ke');
    const b = await owner.post('/vendor/businesses', { name: 'Mara Camps Ltd', countryCode: 'KE', whatsapp: '+254722555000', email: 'owner@mara-camps.co.ke' });
    expect(b.status).toBe(200);
    const v = (await owner.get('/vendor/me')).json.vendor;
    expect(v.emailVerified).toBe(true);
    expect(v.emailIsCompany).toBe(true);
    expect(v.whatsappVerified).toBe(false);
    const me = await owner.get('/me');
    expect(me.json.vendors.map((x: any) => x.name)).toContain('Mara Camps Ltd');
    // The same account still saves favourites and plans trips like any traveller.
    const list = await client(app).get('/listings?category=stay');
    expect((await owner.put(`/me/favourites/${list.json.results[0].id}`)).status).toBe(200);
  });

  it('adds a phone to an email account, so either one signs in to the same account', async () => {
    const a = client(app);
    const user = await signInEmail(a, 'both-ways@mara-camps.co.ke');
    await a.post('/vendor/businesses', { name: 'Both Ways Tours', countryCode: 'KE', whatsapp: '+254733444555' });
    const s = await a.post('/auth/phone/start', { phone: '+254733444555', add: true });
    expect(s.status).toBe(200);
    const v = await a.post('/auth/phone/verify', { phone: '+254733444555', code: s.json.devCode });
    expect(v.json.linked).toBe(true);
    const me = await a.get('/me');
    expect(me.json.signIn).toMatchObject({ email: 'both-ways@mara-camps.co.ke', emailVerified: true, phone: '+254733444555', phoneVerified: true });
    // Adding the number proved the business WhatsApp too.
    expect((await a.get('/vendor/me')).json.vendor.whatsappVerified).toBe(true);

    const b = client(app);
    const byPhone = await signInPhone(b, '+254733444555');
    expect(byPhone.id).toBe(user.id);
    expect((await b.get('/vendor/me')).json.vendor.name).toBe('Both Ways Tours');
  });

  it('an add-phone code only works in the session that asked for it', async () => {
    const a = client(app);
    await signInEmail(a, 'code-thief-target@example.com');
    const s = await a.post('/auth/phone/start', { phone: '+254744000999', add: true });
    const other = client(app);
    expect((await other.post('/auth/phone/verify', { phone: '+254744000999', code: s.json.devCode })).status).toBe(400);
  });

  it('refuses to add an email or phone that another account uses', async () => {
    const a = client(app);
    await signInEmail(a, 'someone-else@example.com');
    expect((await a.post('/auth/phone/start', { phone: '+254711222333', add: true })).status).toBe(409);
    expect((await a.post('/auth/email/start', { email: 'owner@mara-camps.co.ke', add: true })).status).toBe(409);
    expect((await client(app).post('/auth/phone/start', { phone: '+254755000000', add: true })).status).toBe(401);
  });

  it('verifies a shared business inbox by link, and resets when the email changes', async () => {
    const owner = client(app);
    await signInEmail(owner, 'owner@mara-camps.co.ke');
    await owner.patch('/vendor/me', { email: 'bookings@mara-camps.co.ke' });
    expect((await owner.get('/vendor/me')).json.vendor.emailVerified).toBe(false);
    const s = await owner.post('/vendor/email/start');
    expect(s.json.sent).toBe(true);
    const v = await client(app).post('/vendor/email/verify', { token: s.json.devToken });
    expect(v.json.verified).toBe(true);
    expect((await owner.get('/vendor/me')).json.vendor.emailVerified).toBe(true);
    expect((await client(app).post('/vendor/email/verify', { token: s.json.devToken })).status).toBe(400);
  });

  it('keeps at least one way to sign in', async () => {
    const a = client(app);
    await signInEmail(a, 'only-email@example.com');
    expect((await a.del('/me/sign-in/email')).status).toBe(400);
  });
});

describe('share your experience', () => {
  let slug: string;
  beforeAll(async () => {
    slug = (await client(app).get('/listings?category=stay')).json.results[0].slug;
  });

  it('needs a sign-in to rate, so every star has an accountable author', async () => {
    expect((await client(app).post('/experiences', { listingSlug: slug, rating: 5 })).status).toBe(401);
  });

  it('lets any signed-in traveller share stars, recommend, what they paid and what happened', async () => {
    const t = client(app);
    await signInEmail(t, 'experience-1@example.com', { displayName: 'Amina Otieno' });
    const r = await t.post('/experiences', {
      listingSlug: slug, rating: 4, recommend: true, body: 'Hot water all evening, staff helpful.', visitedOn: '2026-10-01',
      price: { group: 'stay', item: 'Double room, one night', amount: 9500, unit: 'per night', feel: 'fair' },
    });
    expect(r.status).toBe(200);
    expect(r.json.contacted).toBe(false);
    const d = (await client(app).get(`/listings/${slug}`)).json.listing;
    const mine = d.reviews.find((x: any) => x.body?.startsWith('Hot water'));
    expect(mine).toMatchObject({ rating: 4, recommend: true, contacted: false, author: 'Amina' });
    expect(mine.paid).toMatchObject({ amount: 9500, item: 'Double room, one night' });
    expect(d.recommendYes).toBeGreaterThanOrEqual(1);
    expect(d.paid.reports).toBeGreaterThanOrEqual(1);
  });

  it('sharing again updates the same experience instead of adding another', async () => {
    const t = client(app);
    await signInEmail(t, 'experience-1@example.com');
    const r = await t.post('/experiences', { listingSlug: slug, rating: 2, recommend: false, body: 'Changed my mind: no hot water the second night.' });
    expect(r.json.updated).toBe(true);
    const d = (await client(app).get(`/listings/${slug}`)).json.listing;
    expect(d.reviews.filter((x: any) => x.author === 'Amina')).toHaveLength(1);
  });

  it('marks experiences from a Karibu enquiry as contacted', async () => {
    const t = client(app, { 'x-device-id': 'device-exp-contact-1' });
    await signInEmail(t, 'experience-2@example.com');
    const listing = (await client(app).get(`/listings/${slug}`)).json.listing;
    const e = await t.post('/enquiries', { listingId: listing.id });
    const ref = e.json.enquiry.refCode;
    const r = await t.post('/experiences', { listingSlug: slug, rating: 5, recommend: true, refCode: ref });
    expect(r.json.contacted).toBe(true);
    expect((await t.get('/me/enquiries')).json.enquiries.find((x: any) => x.refCode === ref).reviewed).toBe(true);
  });

  it('a business cannot rate itself', async () => {
    const owner = client(app);
    await signInEmail(owner, 'self-rater@example.com');
    // Make this account a member of the business that runs the listing.
    const me = (await owner.get('/me')).json.user;
    await pool.query(`INSERT INTO vendor_members (vendor_id, user_id) SELECT vendor_id, $1 FROM listings WHERE slug = $2`, [me.id, slug]);
    expect((await owner.post('/experiences', { listingSlug: slug, rating: 5 })).status).toBe(403);
  });

  it('shows recent experiences on the share feed, and reviewers can hide one', async () => {
    const feed = await client(app).get('/experiences/recent');
    expect(feed.json.experiences.length).toBeGreaterThan(0);
    const admin = client(app);
    await signInEmail(admin, 'admin@karibu.example');
    const list = await admin.get('/admin/reviews');
    const target = list.json.reviews[0];
    expect((await admin.post(`/admin/reviews/${target.id}`, { hidden: true, reason: 'Personal details' })).json.hidden).toBe(true);
    const after = await client(app).get('/experiences/recent');
    expect(after.json.experiences.find((x: any) => x.id === target.id)).toBeUndefined();
  });
});

describe('official links and business pages', () => {
  it('lists official government links for Kenya with checked dates and warnings', async () => {
    const r = await client(app).get('/countries/KE/info');
    const eta = r.json.links.find((l: any) => l.url === 'https://www.etakenya.go.ke');
    expect(eta.topic).toBe('entry');
    expect(eta.warning).toMatch(/look-alike/i);
    expect(r.json.links.every((l: any) => l.url.startsWith('https://') && l.lastCheckedOn)).toBe(true);
    expect(r.json.links.find((l: any) => l.url === 'https://verify.tra.go.ke').topic).toBe('business_check');
    const tz = await client(app).get('/countries/TZ/info');
    expect(tz.json.links[0].url).toBe('https://visa.immigration.go.tz');
  });

  it('has a public page and live badge for verified businesses only', async () => {
    const l = (await client(app).get('/listings?category=safari')).json.results[0];
    const d = (await client(app).get(`/listings/${l.slug}`)).json.listing;
    const page = await client(app).get(`/businesses/${d.vendorSlug}`);
    expect(page.status).toBe(200);
    expect(page.json.listings.length).toBeGreaterThan(0);
    const badge = await client(app).get(`/businesses/${d.vendorSlug}/badge.svg`);
    expect(badge.raw.body).toContain('Verified on Karibu');
    const unverified = client(app);
    await signInEmail(unverified, 'new-biz@example.com');
    await unverified.post('/vendor/businesses', { name: 'Brand New Tours', countryCode: 'KE', whatsapp: '+254766000222' });
    const vs = (await unverified.get('/vendor/me')).json.vendor.slug;
    expect((await client(app).get(`/businesses/${vs}`)).status).toBe(404);
    expect((await client(app).get(`/businesses/${vs}/badge.svg`)).raw.body).toContain('Not verified on Karibu');
  });
});

describe('settle in: long stays and moving home', () => {
  it('separates visiting from settling in, and finds furniture both local and big', async () => {
    const settle = await client(app).get('/listings?mode=settle&country=KE');
    const cats = new Set(settle.json.results.map((l: any) => l.category));
    expect([...cats].every((c) => ['home', 'furniture', 'home_services', 'utilities', 'grooming'].includes(c as string))).toBe(true);
    expect(cats.has('furniture')).toBe(true);
    const visit = await client(app).get('/listings?mode=visit&country=KE');
    expect(visit.json.results.some((l: any) => l.category === 'furniture')).toBe(false);
    const furniture = await client(app).get('/listings?category=furniture');
    const scales = furniture.json.results.map((l: any) => l.subtype);
    expect(scales).toEqual(expect.arrayContaining(['custom workshop', 'furniture store']));
  });

  it('long-stay homes and home services need documents (level 2) before going public', async () => {
    const v = client(app);
    await signInEmail(v, 'landlord@example.com');
    await v.post('/vendor/businesses', { name: 'Test Lettings', countryCode: 'KE', whatsapp: '+254766000333' });
    const nbo = (await v.get('/cities?country=KE')).json.cities.find((c: any) => c.slug === 'nairobi');
    const r = await v.post('/vendor/listings', {
      cityId: nbo.id, category: 'home', subtype: 'furnished apartment', title: 'Test 1-bed, Westlands', summary: 'Monthly furnished one-bedroom near the mall.',
      lat: -1.267, lon: 36.81, priceFrom: 60000, priceUnit: 'per month', attributes: { bedrooms: 1, furnished: 'furnished', minLeaseMonths: 6 },
      amenities: ['wifi', 'gated_compound'],
    });
    expect(r.status).toBe(200);
    const id = r.json.listing.id;
    await v.post(`/vendor/listings/${id}/submit`);
    const admin = client(app);
    await signInEmail(admin, 'admin@karibu.example');
    const low = await admin.post(`/admin/listings/${id}/decision`, { decision: 'approve', level: 1 });
    expect(low.status).toBe(400);
    expect(low.json.error).toMatch(/level 2/);
  });

  it('accepts settling-in prices like a sofa or a month of internet', async () => {
    const r = await client(app, { 'x-device-id': 'device-settle-1' }).post('/prices/reports', { city: 'nairobi', group: 'home', item: '3-seater sofa, made to order', amount: 45000 });
    expect(r.status).toBe(200);
  });
});

describe('a TripAdvisor-grade listing page', () => {
  let slug: string;
  let ids: string[] = [];
  beforeAll(async () => {
    slug = (await client(app).get('/listings?category=grooming')).json.results.find((l: any) => l.subtype === 'barber').slug;
    const posts = [
      { email: 'cut-1@example.com', rating: 5, travellerType: 'moving_home', body: 'Clean shop, great fade, fair price on the wall. Will be back every two weeks.' },
      { email: 'cut-2@example.com', rating: 4, travellerType: 'long_stay', body: 'Great fade and friendly barbers, a short wait on Saturday.' },
      { email: 'cut-3@example.com', rating: 2, travellerType: 'business', body: 'Waited an hour on Saturday, fade was rushed.' },
    ];
    for (const p of posts) {
      const t = client(app);
      await signInEmail(t, p.email);
      const r = await t.post('/experiences', { listingSlug: slug, rating: p.rating, recommend: p.rating >= 4, travellerType: p.travellerType, body: p.body });
      ids.push(r.json.review.id);
    }
  });

  it('summarises ratings, traveller types, popular mentions and highlights', async () => {
    const l = (await client(app).get(`/listings/${slug}`)).json.listing;
    expect(l.ratingBreakdown).toMatchObject({ 5: 1, 4: 1, 2: 1 });
    expect(l.travellerTypes.map((t: any) => t.type)).toEqual(expect.arrayContaining(['moving_home', 'long_stay', 'business']));
    expect(l.mentions.map((m: any) => m.word)).toEqual(expect.arrayContaining(['fade', 'saturday']));
    expect(l.highlights.length).toBe(2);
  });

  it('filters, searches and sorts experiences', async () => {
    const two = await client(app).get(`/listings/${slug}/experiences?rating=2`);
    expect(two.json.total).toBe(1);
    const ls = await client(app).get(`/listings/${slug}/experiences?type=long_stay`);
    expect(ls.json.experiences[0].travellerType).toBe('long_stay');
    const sat = await client(app).get(`/listings/${slug}/experiences?q=saturday`);
    expect(sat.json.total).toBe(2);
    const low = await client(app).get(`/listings/${slug}/experiences?sort=lowest`);
    expect(low.json.experiences[0].rating).toBe(2);
  });

  it('counts helpful votes once per person, toggling off on a second tap', async () => {
    const g = client(app, { 'x-device-id': 'device-helpful-1' });
    expect((await g.post(`/experiences/${ids[0]}/helpful`)).json).toEqual({ voted: true, helpful: 1 });
    expect((await g.post(`/experiences/${ids[0]}/helpful`)).json).toEqual({ voted: false, helpful: 0 });
    await g.post(`/experiences/${ids[0]}/helpful`);
    const top = await client(app).get(`/listings/${slug}/experiences?sort=helpful`);
    expect(top.json.experiences[0].id).toBe(ids[0]);
    const author = client(app);
    await signInEmail(author, 'cut-1@example.com');
    expect((await author.post(`/experiences/${ids[0]}/helpful`)).status).toBe(400);
  });

  it('suggests similar places', async () => {
    const r = await client(app).get(`/listings/${slug}/similar`);
    expect(r.json.listings.length).toBeGreaterThan(0);
    expect(r.json.listings.every((l: any) => l.category === 'grooming' && l.slug !== slug)).toBe(true);
  });
});

describe('search', () => {
  it('matches word beginnings, English stems and listing details', async () => {
    for (const [q, title] of [['sofa', 'Made-to-order sofas'], ['fade', 'Barbershop'], ['furnished apartment', 'Furnished 2-bedroom'], ['braids', 'Natural hair'], ['movers', 'House moves']]) {
      const r = await client(app).get(`/listings?q=${encodeURIComponent(q)}`);
      expect(r.json.results.some((l: any) => l.title.startsWith(title)), q).toBe(true);
    }
    expect((await client(app).get('/listings?q=zzzqqq')).json.total).toBe(0);
  });
});
