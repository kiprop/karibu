import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, client, signInEmail, staffClient, STAFF_PASSWORD } from './helpers.js';
import { pool } from '../src/db/pool.js';
import { currentStep, totpAt } from '../src/lib/totp.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const PW = 'mango tree by the river';

describe('passwords for travellers and businesses', () => {
  it('creates an account with a password after a code proves the email', async () => {
    const c = client(app);
    const s = await c.post('/auth/signup/start', { identifier: 'pw-user@example.com', password: PW, displayName: 'Amani' });
    expect(s.status).toBe(200);
    expect(s.json.via).toBe('email');
    const wrong = await c.post('/auth/signup/verify', { identifier: 'pw-user@example.com', code: s.json.devCode === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    const v = await c.post('/auth/signup/verify', { identifier: 'pw-user@example.com', code: s.json.devCode });
    expect(v.status).toBe(200);
    const me = await c.get('/me');
    expect(me.json.signIn).toMatchObject({ email: 'pw-user@example.com', emailVerified: true, hasPassword: true });
  });

  it('refuses a second sign-up for the same email', async () => {
    const r = await client(app).post('/auth/signup/start', { identifier: 'PW-User@example.com', password: PW });
    expect(r.status).toBe(409);
  });

  it('refuses weak passwords', async () => {
    expect((await client(app).post('/auth/signup/start', { identifier: 'weak@example.com', password: 'short' })).json.code).toBe('weak_password');
    expect((await client(app).post('/auth/signup/start', { identifier: 'weak@example.com', password: 'password123' })).json.code).toBe('weak_password');
    expect((await client(app).post('/auth/signup/start', { identifier: 'weakling@example.com', password: 'weakling-forever' })).json.code).toBe('weak_password');
  });

  it('signs in with email and password, and "Keep me signed in" decides how long the cookie lasts', async () => {
    const kept = await app.inject({ method: 'POST', url: '/v1/auth/password/login', payload: { identifier: 'pw-user@example.com', password: PW } });
    expect(kept.statusCode).toBe(200);
    expect(String(kept.headers['set-cookie'])).toMatch(/Max-Age=7776000/);
    const brief = await app.inject({ method: 'POST', url: '/v1/auth/password/login', payload: { identifier: 'pw-user@example.com', password: PW, remember: false } });
    expect(String(brief.headers['set-cookie'])).not.toMatch(/Max-Age/);
  });

  it('accepts a Kenyan number written locally', async () => {
    const c = client(app);
    const s = await c.post('/auth/signup/start', { identifier: '0722 555 101', password: PW });
    expect(s.json.to).toBe('+254722555101');
    expect((await c.post('/auth/signup/verify', { identifier: '+254722555101', code: s.json.devCode })).status).toBe(200);
    expect((await client(app).post('/auth/password/login', { identifier: '254722555101', password: PW })).status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown account, and locks after 5 wrong tries', async () => {
    const unknown = await client(app).post('/auth/password/login', { identifier: 'nobody-here@example.com', password: PW });
    const wrong = await client(app).post('/auth/password/login', { identifier: 'pw-user@example.com', password: 'not the one at all' });
    expect(unknown.status).toBe(401);
    expect(wrong.json.error).toBe(unknown.json.error);
    for (let i = 0; i < 4; i++) await client(app).post('/auth/password/login', { identifier: 'pw-user@example.com', password: 'not the one at all' });
    const locked = await client(app).post('/auth/password/login', { identifier: 'pw-user@example.com', password: PW });
    expect(locked.status).toBe(429);
    await pool.query(`UPDATE users SET locked_until = NULL WHERE email = 'pw-user@example.com'`);
  });

  it('resets a forgotten password with a code and signs out other devices', async () => {
    const other = client(app);
    expect((await other.post('/auth/password/login', { identifier: 'pw-user@example.com', password: PW })).status).toBe(200);
    const c = client(app);
    const f = await c.post('/auth/password/forgot', { identifier: 'pw-user@example.com' });
    expect(f.json.sent).toBe(true);
    const nobody = await c.post('/auth/password/forgot', { identifier: 'nobody-here@example.com' });
    expect(nobody.json.sent).toBe(true);
    expect(nobody.json.devCode).toBeUndefined();
    const NEW = 'sunrise over amboseli';
    expect((await c.post('/auth/password/reset', { identifier: 'pw-user@example.com', code: f.json.devCode, password: NEW })).status).toBe(200);
    expect((await other.get('/me')).json.user).toBeNull();
    expect((await client(app).post('/auth/password/login', { identifier: 'pw-user@example.com', password: PW })).status).toBe(401);
    expect((await client(app).post('/auth/password/login', { identifier: 'pw-user@example.com', password: NEW })).status).toBe(200);
  });

  it('lets an account that only used sign-in links add a password, and asks for the current one to change it', async () => {
    const c = client(app);
    await signInEmail(c, 'link-only@example.com');
    expect((await c.get('/me')).json.signIn.hasPassword).toBe(false);
    expect((await c.post('/me/password', { password: PW })).status).toBe(200);
    expect((await c.post('/me/password', { password: 'another long phrase' })).status).toBe(400);
    expect((await c.post('/me/password', { current: PW, password: 'another long phrase' })).status).toBe(200);
  });
});

describe('staff console sign-in', () => {
  let owner: Awaited<ReturnType<typeof staffClient>>;
  beforeAll(async () => {
    owner = await staffClient(app, 'owner', { name: 'Test Owner' });
  });

  it('keeps traveller accounts out of the staff console', async () => {
    const t = client(app);
    await signInEmail(t, 'just-a-traveller@example.com');
    expect((await t.get('/admin/queue')).status).toBe(401);
    expect((await t.get('/staff/me')).json.staff).toBeNull();
  });

  it('needs a password and then an authenticator code', async () => {
    const me = await owner.get('/staff/me');
    expect(me.json.staff).toMatchObject({ role: 'owner', roleLabel: 'Owner' });
    expect(me.json.staff.perms).toContain('staff.manage');

    const c = client(app);
    expect((await c.post('/staff/auth/login', { email: owner.email, password: 'wrong password here' })).status).toBe(401);
    const step1 = await c.post('/staff/auth/login', { email: owner.email, password: STAFF_PASSWORD });
    expect(step1.json.next).toBe('code');
    expect((await c.get('/admin/queue')).status).toBe(401);
    expect((await c.post('/staff/auth/code', { challenge: step1.json.challenge, code: '123456' })).status).toBe(400);
    // The enrolment used the current 30-second step, so the next valid code is the following one.
    const ok = await c.post('/staff/auth/code', { challenge: step1.json.challenge, code: totpAt(owner.secret, currentStep() + 1) });
    expect(ok.status).toBe(200);
    expect((await c.get('/admin/queue')).status).toBe(200);
  });

  it('accepts a recovery code once', async () => {
    const code = owner.recoveryCodes[0];
    const a = client(app);
    const s1 = await a.post('/staff/auth/login', { email: owner.email, password: STAFF_PASSWORD });
    expect((await a.post('/staff/auth/code', { challenge: s1.json.challenge, code: code.toUpperCase() })).json.usedRecovery).toBe(true);
    const b = client(app);
    const s2 = await b.post('/staff/auth/login', { email: owner.email, password: STAFF_PASSWORD });
    expect((await b.post('/staff/auth/code', { challenge: s2.json.challenge, code })).status).toBe(400);
  });

  it('locks a staff account after 5 wrong passwords and records it in the audit log', async () => {
    const victim = await staffClient(app, 'analyst');
    for (let i = 0; i < 5; i++) await client(app).post('/staff/auth/login', { email: victim.email, password: 'guessing wrongly' });
    expect((await client(app).post('/staff/auth/login', { email: victim.email, password: STAFF_PASSWORD })).status).toBe(429);
    const log = await owner.get(`/admin/audit?q=${encodeURIComponent(victim.email)}`);
    expect(log.json.entries.map((e: any) => e.action).join('|')).toMatch(/locked/);
  });

  it('ends a session after 30 minutes without activity', async () => {
    const s = await staffClient(app, 'analyst');
    await pool.query(`UPDATE staff_sessions SET last_seen_at = now() - interval '31 minutes' WHERE staff_id = $1`, [s.staffId]);
    expect((await s.get('/staff/me')).json.staff).toBeNull();
  });

  it('only Owners manage the team, and there is always an Owner', async () => {
    const lead = await staffClient(app, 'country_lead', { country: 'KE' });
    expect((await lead.get('/staff/team')).status).toBe(403);
    const inv = await owner.post('/staff/team/invite', { email: 'new.person@karibu.example', displayName: 'New Person', role: 'field_verifier', country: 'KE' });
    expect(inv.json.devLink).toMatch(/\/admin\/invite\?token=/);
    expect((await owner.patch(`/staff/team/${owner.staffId}`, { role: 'analyst' })).status).toBe(400);
    const team = await owner.get('/staff/team');
    expect(team.json.team.find((m: any) => m.email === 'new.person@karibu.example').status).toBe('invited');
  });

  it('resetting a sign-in signs the person out and sends a fresh invitation', async () => {
    const lost = await staffClient(app, 'content_editor');
    const r = await owner.post(`/staff/team/${lost.staffId}/reset`);
    expect(r.json.devLink).toMatch(/invite\?token=/);
    expect((await lost.get('/staff/me')).json.staff).toBeNull();
    expect((await client(app).post('/staff/auth/login', { email: lost.email, password: STAFF_PASSWORD })).status).toBe(401);
  });

  it('the audit log cannot be edited or deleted', async () => {
    await expect(pool.query(`UPDATE staff_audit SET action = 'nothing happened'`)).rejects.toThrow(/cannot be changed/);
    await expect(pool.query(`DELETE FROM staff_audit`)).rejects.toThrow(/cannot be changed/);
  });
});

describe('roles, country scope and second approvals', () => {
  let listingId: string;
  let lead: Awaited<ReturnType<typeof staffClient>>;
  let officer: Awaited<ReturnType<typeof staffClient>>;
  let field: Awaited<ReturnType<typeof staffClient>>;

  beforeAll(async () => {
    lead = await staffClient(app, 'country_lead', { country: 'KE', name: 'Lead KE' });
    officer = await staffClient(app, 'verification_officer', { country: 'KE', name: 'Officer KE' });
    field = await staffClient(app, 'field_verifier', { country: 'KE', name: 'Field KE' });
    // A home-based experience: private location, so it needs level 3.
    const { rows } = await pool.query(
      `INSERT INTO listings (vendor_id, city_id, category, subtype, title, slug, summary, location, location_is_private, currency)
       SELECT vendor_id, city_id, 'experience', 'cooking class', 'Home cooking class, test', 'home-cooking-test', 'Cook with a family at home.', location, true, 'KES'
         FROM listings WHERE status = 'live' LIMIT 1 RETURNING id`,
    );
    listingId = rows[0].id;
    await pool.query(`UPDATE listings SET status = 'submitted' WHERE id = $1`, [listingId]);
  });

  it('gives each role only its own powers', async () => {
    const support = await staffClient(app, 'business_support', { country: 'KE' });
    expect((await support.get('/admin/businesses')).status).toBe(200);
    expect((await support.post(`/admin/listings/${listingId}/decision`, { decision: 'approve', level: 2 })).status).toBe(403);
    const analyst = await staffClient(app, 'analyst');
    expect((await analyst.get('/admin/insights?days=30')).status).toBe(200);
    expect((await analyst.get('/admin/queue')).status).toBe(403);
    const finance = await staffClient(app, 'finance');
    expect((await finance.get('/admin/billing')).status).toBe(200);
    expect((await finance.get('/admin/reports')).status).toBe(403);
  });

  it('keeps staff to their own country', async () => {
    const tz = await staffClient(app, 'verification_officer', { country: 'TZ' });
    const q = await tz.get('/admin/queue');
    expect(q.json.queue.map((x: any) => x.id)).not.toContain(listingId);
    expect((await tz.post(`/admin/listings/${listingId}/decision`, { decision: 'approve', level: 3 })).status).toBe(403);
    expect((await tz.get(`/admin/listings/${listingId}`)).status).toBe(403);
  });

  it('level 3 needs a field visit report and a second person', async () => {
    expect((await officer.post(`/admin/listings/${listingId}/decision`, { decision: 'approve', level: 3 })).json.error).toMatch(/field visit/);

    const verifiers = await officer.get('/admin/verifiers');
    const fieldId = verifiers.json.verifiers.find((v: any) => v.displayName === 'Field KE').id;
    const booked = await officer.post('/admin/visits', { listingId, assignedTo: fieldId, scheduledFor: new Date(Date.now() + 3600e3).toISOString() });
    expect(booked.status).toBe(200);
    const visitId = booked.json.visit.id;
    expect((await officer.post(`/admin/visits/${visitId}/check-in`)).status).toBe(403);
    const mine = await field.get('/admin/visits');
    expect(mine.json.visits.map((v: any) => v.id)).toEqual([visitId]);
    const checklist = { addressMatches: true, personMatchesId: true, matchesListing: true, safeForGuests: true };
    expect((await field.post(`/admin/visits/${visitId}/submit`, { checklist, notes: 'Clean kitchen, host matches ID.' })).status).toBe(400);
    expect((await field.post(`/admin/visits/${visitId}/check-in`)).status).toBe(200);
    expect((await field.post(`/admin/visits/${visitId}/submit`, { checklist, notes: 'Clean kitchen, host matches ID.' })).status).toBe(200);

    const sent = await officer.post(`/admin/listings/${listingId}/decision`, { decision: 'approve', level: 3, note: 'Visit report reviewed' });
    expect(sent.json.status).toBe('awaiting_second_approval');
    expect((await client(app).get('/listings/home-cooking-test')).status).toBe(404);

    const pending = await lead.get('/admin/approvals');
    const a = pending.json.approvals.find((x: any) => x.targetId === listingId);
    expect(a.kind).toBe('level3');
    expect((await officer.post(`/admin/approvals/${a.id}`, { decision: 'approve' })).status).toBe(403);
    expect((await lead.post(`/admin/approvals/${a.id}`, { decision: 'approve' })).json.status).toBe('approved');
    expect((await client(app).get('/listings/home-cooking-test')).status).toBe(200);
  });

  it('nobody can approve their own request', async () => {
    await staffClient(app, 'country_lead', { country: 'KE', name: 'Second lead' });
    const { rows } = await pool.query(`SELECT v.id, v.name FROM vendors v WHERE v.verification_level >= 1 AND NOT v.is_suspended AND v.country_code = 'KE' LIMIT 1`);
    const r = await lead.post(`/admin/vendors/${rows[0].id}/suspend`, { suspended: true, reason: 'Several scam reports this week' });
    expect(r.json.status).toBe('awaiting_second_approval');
    const a = (await lead.get('/admin/approvals')).json.approvals.find((x: any) => x.targetId === rows[0].id);
    expect(a.mine).toBe(true);
    expect((await lead.post(`/admin/approvals/${a.id}`, { decision: 'approve' })).status).toBe(403);
  });

  it('trust and safety can take a listing down at once; a lead confirms or reverses it', async () => {
    const ts = await staffClient(app, 'trust_safety', { country: 'KE' });
    const r = await ts.post(`/admin/listings/${listingId}/suspend`, { reason: 'Safety report: wrong address given at night' });
    expect(r.json).toMatchObject({ status: 'suspended', needsConfirm: true });
    expect((await ts.post(`/admin/listings/${listingId}/suspend`, { reason: 'Back up please', reinstate: true })).status).toBe(403);
    const a = (await lead.get('/admin/approvals')).json.approvals.find((x: any) => x.targetId === listingId && x.kind === 'confirm_suspension');
    expect((await lead.post(`/admin/approvals/${a.id}`, { decision: 'decline' })).status).toBe(400);
    expect((await lead.post(`/admin/approvals/${a.id}`, { decision: 'decline', note: 'Spoke to the host; address was right' })).status).toBe(200);
    expect((await client(app).get('/listings/home-cooking-test')).status).toBe(200);
  });
});

describe('insights', () => {
  it('counts searches without storing who made them, and shows demand gaps', async () => {
    const t = client(app, { 'x-device-id': 'insights-device-1' });
    for (let i = 0; i < 3; i++) await t.get('/listings?q=' + encodeURIComponent('underwater hotel') + '&city=nairobi');
    const analyst = await staffClient(app, 'analyst');
    const r = await analyst.get('/admin/insights?days=30');
    expect(r.status).toBe(200);
    expect(r.json.headline.searches).toBeGreaterThanOrEqual(3);
    expect(r.json.gaps.find((g: any) => g.key === 'underwater hotel')).toMatchObject({ searches: 3, city: 'nairobi' });
    expect(r.json.daily).toHaveLength(30);
    const csv = await app.inject({ method: 'GET', url: '/v1/admin/insights/export?days=30&table=gaps', headers: { cookie: [...analyst.jar].map(([k, v]) => `${k}=${v}`).join('; ') } });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body.split('\n')[0]).toMatch(/^query,key,city,searches/);
    const support = await staffClient(app, 'business_support');
    expect((await support.get('/admin/insights/export?days=30')).status).toBe(403);
  });
});
