import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, client, signInEmail, staffClient } from './helpers.js';
import { pool } from '../src/db/pool.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

// The smallest valid-looking JPEG header plus padding: enough for the type check, which reads the first bytes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]);

function multipart(fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) {
  const b = '----karibuTest' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}

async function upload(c: ReturnType<typeof client>, url: string, fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) {
  const m = multipart(fields, file);
  const cookie = [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await app.inject({ method: 'POST', url: `/v1${url}`, payload: m.body, headers: { ...m.headers, cookie } });
  return { status: res.statusCode, json: res.json() };
}

describe('listing photos', () => {
  it('lets a business upload real photos, checks the file really is an image, and serves it', async () => {
    const v = client(app);
    await signInEmail(v, `photos-${Date.now()}@example.com`);
    expect((await v.post('/vendor/businesses', { name: 'Photo Test Camp', countryCode: 'KE', whatsapp: '+254711999888' })).status).toBe(200);

    const ok = await upload(v, '/vendor/photos', {}, { name: 'tent.jpg', type: 'image/jpeg', data: JPEG });
    expect(ok.status).toBe(200);
    expect(ok.json.url).toMatch(/^\/api\/media\/listings\/.+\.jpg$/);

    // A renamed PDF is refused even though it claims to be a JPEG.
    const fake = await upload(v, '/vendor/photos', {}, { name: 'tent.jpg', type: 'image/jpeg', data: Buffer.from('%PDF-1.4 not a photo') });
    expect(fake.status).toBe(400);

    const served = await app.inject({ method: 'GET', url: ok.json.url.replace('/api/', '/v1/') });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['cache-control']).toContain('immutable');

    // Paths that try to leave the photo folder are not served.
    expect((await app.inject({ method: 'GET', url: '/v1/media/..%2f..%2fpackage.json' })).statusCode).toBe(404);

    // The uploaded photo can be saved on a listing; links to other sites must be https.
    const city = (await pool.query(`SELECT id FROM cities WHERE slug = 'naivasha'`)).rows[0].id;
    const base = { cityId: city, category: 'stay', subtype: 'tented camp', title: 'Photo test camp', summary: 'A test camp with uploaded photos', budgetTier: 'mid', priceFrom: 9000, priceUnit: 'per night', lat: -0.77, lon: 36.4 };
    const saved = await v.post('/vendor/listings', { ...base, photos: [{ url: ok.json.url, alt: 'Tent' }] });
    expect(saved.json.error ?? null).toBeNull();
    expect((await v.post('/vendor/listings', { ...base, photos: [{ url: 'http://example.com/a.jpg', alt: '' }] })).status).toBe(400);
  });

  it('lets staff add photos for a business only with the business’s permission, and audits it', async () => {
    const l = (await pool.query(`SELECT id FROM listings WHERE status = 'live' LIMIT 1`)).rows[0];
    const s = await staffClient(app, 'business_support', { email: `photo-staff-${Date.now()}@karibu.test` });
    const noPermission = await upload(s, `/admin/listings/${l.id}/photos`, {}, { name: 'a.jpg', type: 'image/jpeg', data: JPEG });
    expect(noPermission.status).toBe(400);
    const added = await upload(s, `/admin/listings/${l.id}/photos`, { permission: 'yes', alt: 'Reception' }, { name: 'a.jpg', type: 'image/jpeg', data: JPEG });
    expect(added.status).toBe(200);
    expect(added.json.photo.alt).toBe('Reception');

    const audit = await pool.query(`SELECT action FROM staff_audit WHERE target_id = $1 ORDER BY id DESC LIMIT 1`, [l.id]);
    expect(audit.rows[0].action).toBe('listing.photo_add');

    expect((await s.del(`/admin/listings/${l.id}/photos/${added.json.photo.id}`)).status).toBe(200);

    // Roles without that work can't add photos.
    const analyst = await staffClient(app, 'analyst', { email: `photo-analyst-${Date.now()}@karibu.test` });
    expect((await upload(analyst, `/admin/listings/${l.id}/photos`, { permission: 'yes' }, { name: 'a.jpg', type: 'image/jpeg', data: JPEG })).status).toBe(403);
  });
});
