import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, client, signInEmail, staffClient } from './helpers.js';
import { pool } from '../src/db/pool.js';
import { seedSeasons } from '../src/db/seed.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
  await seedSeasons(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('smart search', () => {
  it('reads plain language into filters the person can see', async () => {
    const r = await client(app).get('/listings?nl=1&q=' + encodeURIComponent('tented camp in the mara under 50k with hot water in august'));
    expect(r.status).toBe(200);
    const labels = r.json.understood.chips.map((c: any) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['Maasai Mara', 'Tented camp', 'Under KES 50,000', 'Hot water', 'August']));
    expect(r.json.understood.params).toMatchObject({ city: 'maasai-mara', category: 'stay', subtype: 'tented camp', priceMax: '50000', amenities: 'hot_water', month: '8' });
  });

  it('understands local words and typos', async () => {
    const r = await client(app).get('/listings?nl=1&q=' + encodeURIComponent('kinyozi nairbi'));
    expect(r.json.understood.params).toMatchObject({ category: 'grooming', subtype: 'barber', city: 'nairobi' });
    expect(r.json.understood.corrections[0]).toMatchObject({ from: 'nairbi', to: 'nairobi' });
  });

  it('never dead-ends: loosens one filter at a time and says which', async () => {
    const r = await client(app).get('/listings?nl=1&q=' + encodeURIComponent('game drive in the mara under 500 with pool'));
    expect(r.json.total).toBe(0);
    expect(r.json.relaxed.total).toBeGreaterThan(0);
    expect(r.json.relaxed.without).toMatch(/Pool|Under KES 500/);
  });

  it('suggests a spelling when plain text finds nothing', async () => {
    const r = await client(app).get('/listings?q=' + encodeURIComponent('Naivashaa'));
    expect(r.json.total === 0 ? r.json.didYouMean : 'Naivasha').toBe('Naivasha');
  });

  it('records "tell us you need this" and shows it to the team', async () => {
    expect((await client(app).post('/demand', { query: 'underwater hotel', city: 'diani' })).status).toBe(200);
    const s = await staffClient(app, 'business_support');
    const d = await s.get('/admin/demand');
    expect(d.json.requests.some((x: any) => x.query === 'underwater hotel')).toBe(true);
  });
});

describe('companion', () => {
  it('works for guests from what their device sends', async () => {
    const soon = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    const r = await client(app, { 'x-device-id': 'companion-guest-1' }).get(`/companion?arrivingOn=${soon}&mode=visit`);
    expect(r.json.phase).toBe('arriving_soon');
    expect(r.json.daysToGo).toBe(5);
    expect(r.json.checklist.steps.length).toBeGreaterThan(5);
    expect(r.json.emergency.length).toBeGreaterThan(0);
  });

  it('remembers a signed-in traveller’s plan, checklist and settle-in progress', async () => {
    const c = client(app);
    await signInEmail(c, 'companion@example.com');
    expect((await c.put('/me/profile', { mode: 'settle', baseCity: 'nairobi', travellerType: 'moving_home' })).status).toBe(200);
    expect((await c.put('/me/checklist/settle.sim', { done: true })).status).toBe(200);
    const r = await c.get('/companion');
    expect(r.json.phase).toBe('settling');
    expect(r.json.checklist.steps.find((s: any) => s.key === 'settle.sim').done).toBe(true);
    const sug = await c.get('/suggestions');
    expect(sug.json.suggestions.length).toBeGreaterThan(0);
    expect(sug.json.suggestions.every((s: any) => s.reason.length > 5)).toBe(true);
  });

  it('asks "How was it?" two days after someone messages a business', async () => {
    const dev = 'companion-guest-2';
    const { rows } = await pool.query(`SELECT id, vendor_id FROM listings WHERE status = 'live' LIMIT 1`);
    await pool.query(`INSERT INTO enquiries (ref_code, listing_id, vendor_id, device_id, created_at) VALUES (new_ref_code(), $1, $2, $3, now() - interval '3 days')`, [rows[0].id, rows[0].vendor_id, dev]);
    const r = await client(app, { 'x-device-id': dev }).get('/companion');
    expect(r.json.howWasIt.length).toBe(1);
  });

  it('explains suggestions by season for the person’s dates', async () => {
    const y = new Date().getFullYear() + 1;
    const r = await client(app).get(`/suggestions?arrivingOn=${y}-08-10&leavingOn=${y}-08-20`);
    expect(r.json.suggestions.some((s: any) => s.kind === 'season' && /migration/i.test(s.reason))).toBe(true);
  });

  it('shows a verification receipt on each listing', async () => {
    const { rows } = await pool.query(`SELECT slug FROM public_listings LIMIT 1`);
    const r = await client(app).get(`/listings/${rows[0].slug}`);
    expect(r.json.listing.receipt.checks.length).toBe(5);
    expect(r.json.listing.receipt.checks[1]).toMatchObject({ key: 'identity', done: true });
  });
});

describe('planning a trip together', () => {
  it('lets an invited person edit, but only the owner manages sharing', async () => {
    const owner = client(app);
    await signInEmail(owner, 'trip-owner@example.com');
    const t = await owner.post('/me/trips', { title: 'Family Mara trip' });
    const inv = await owner.post(`/me/trips/${t.json.trip.id}/invite`, { enabled: true });
    const sister = client(app);
    await signInEmail(sister, 'trip-sister@example.com');
    expect((await sister.get(`/trips/join/${inv.json.editToken}`)).json.trip.title).toBe('Family Mara trip');
    expect((await sister.post(`/trips/join/${inv.json.editToken}`)).json.tripId).toBe(t.json.trip.id);
    expect((await sister.post(`/me/trips/${t.json.trip.id}/items`, { note: 'Pack binoculars' })).status).toBe(200);
    expect((await sister.post(`/me/trips/${t.json.trip.id}/share`, { enabled: true })).status).toBe(403);
    const view = await owner.get(`/me/trips/${t.json.trip.id}`);
    expect(view.json.trip.items[0]).toMatchObject({ note: 'Pack binoculars', addedBy: 'trip-sister' });
    expect(view.json.trip.people).toHaveLength(2);
    expect((await owner.post(`/me/trips/${t.json.trip.id}/invite`, { enabled: false })).status).toBe(200);
    expect((await sister.get(`/me/trips/${t.json.trip.id}`)).status).toBe(404);
  });
});

describe('Ask Karibu', () => {
  it('judges a quoted price from checked prices and cites them', async () => {
    const r = await client(app).post('/ask', { question: 'Is KES 9,000 fair for an airport taxi to Westlands?' });
    expect(r.json.intent).toBe('price');
    expect(r.json.answered).toBe(true);
    expect(r.json.text).toMatch(/usual price/);
    expect(r.json.sources[0].kind).toBe('price');
  });

  it('answers entry questions from the official source only', async () => {
    const r = await client(app).post('/ask', { question: 'Do I need a visa for Kenya with a US passport?' });
    expect(r.json.intent).toBe('entry');
    expect(r.json.sources.some((s: any) => s.url.includes('etakenya.go.ke'))).toBe(true);
  });

  it('puts emergencies first', async () => {
    const r = await client(app).post('/ask', { question: 'I was robbed, who do I call?' });
    expect(r.json.intent).toBe('emergency');
    expect(r.json.text).toMatch(/999|112/);
  });

  it('checks an operator against the watchlist and verified businesses', async () => {
    const r = await client(app).post('/ask', { question: 'Is Totally Unknown Safaris Ltd legit?' });
    expect(r.json.intent).toBe('operator');
    expect(r.json.text).toMatch(/couldn’t find/);
  });

  it('finds verified listings and says what it understood', async () => {
    const r = await client(app).post('/ask', { question: 'game drive in the mara' });
    expect(r.json.intent).toBe('search');
    expect(r.json.chips).toContain('Maasai Mara');
    expect(r.json.listings.length).toBeGreaterThan(0);
  });

  it('answers on WhatsApp through the same engine', async () => {
    const verify = await app.inject({ method: 'GET', url: '/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123' });
    expect(verify.statusCode).toBe(403);
    const msg = { entry: [{ changes: [{ value: { messages: [{ from: '254700000001', type: 'text', text: { body: 'emergency numbers please' } }] } }] }] };
    const r = await app.inject({ method: 'POST', url: '/v1/webhooks/whatsapp', payload: msg });
    expect(r.statusCode).toBe(200);
    const { rows } = await pool.query(`SELECT channel, intent FROM ask_log WHERE channel = 'whatsapp' ORDER BY at DESC LIMIT 1`);
    expect(rows[0]).toMatchObject({ channel: 'whatsapp', intent: 'emergency' });
  });
});
