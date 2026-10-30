import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { q, tx } from '../db/pool.js';
import { createSession, destroySession, requireUser } from '../auth.js';
import { outbox } from '../lib/notify.js';
import { HttpError, badRequest, randomCode, randomToken, safeEqual, sha256 } from '../lib/util.js';

const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, for example +254712345678');
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional();

const LINK_TTL_MIN = 20;
const CODE_TTL_MIN = 10;
const MAX_CODE_ATTEMPTS = 5;

/** Attach a guest's device activity (enquiries) to the account that just signed in. */
async function mergeGuest(userId: string, device?: string, favourites: string[] = []) {
  if (device) await q(`UPDATE enquiries SET user_id = $1 WHERE device_id = $2 AND user_id IS NULL`, [userId, device]);
  if (favourites.length) {
    await q(
      `INSERT INTO favourites (user_id, listing_id)
       SELECT $1, id FROM listings WHERE id = ANY($2::uuid[]) ON CONFLICT DO NOTHING`,
      [userId, favourites],
    );
  }
}

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };

  // ---- Travellers: email sign-in link ----
  app.post('/auth/email/start', strict, async (req) => {
    const body = z.object({ email, next: z.string().startsWith('/').max(200).optional() }).parse(req.body);
    const token = randomToken();
    await q(`INSERT INTO login_tokens (kind, target, token_hash, expires_at) VALUES ('email_link', $1, $2, now() + make_interval(mins => $3))`, [
      body.email,
      sha256(token),
      LINK_TTL_MIN,
    ]);
    const link = `${config.webUrl}/auth/verify?token=${encodeURIComponent(token)}${body.next ? `&next=${encodeURIComponent(body.next)}` : ''}`;
    await outbox.email(body.email, 'Your Karibu sign-in link', `Tap to sign in to Karibu:\n\n${link}\n\nThis link works once and expires in ${LINK_TTL_MIN} minutes. If you didn't ask for it, ignore this email.`);
    return { sent: true, ...(config.exposeDevSecrets ? { devLink: link, devToken: token } : {}) };
  });

  app.post('/auth/email/verify', strict, async (req, reply) => {
    const body = z
      .object({ token: z.string().min(20).max(200), deviceId, favourites: z.array(z.string().uuid()).max(500).optional(), displayName: z.string().max(80).optional() })
      .parse(req.body);
    const user = await tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE login_tokens SET used_at = now()
          WHERE token_hash = $1 AND kind = 'email_link' AND used_at IS NULL AND expires_at > now()
          RETURNING target`,
        [sha256(body.token)],
      );
      if (!rows[0]) throw new HttpError(400, 'This sign-in link has expired or was already used. Ask for a new one.', 'invalid_token');
      const em = rows[0].target as string;
      const u = await c.query(
        `INSERT INTO users (email, display_name) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET last_seen_at = now()
         RETURNING id, email, role`,
        [em, body.displayName ?? null],
      );
      return u.rows[0];
    });
    await mergeGuest(user.id, body.deviceId, body.favourites);
    await createSession(reply, user.id);
    return { user };
  });

  // ---- Travellers: Google sign-in (ID token from Google Identity Services) ----
  app.post('/auth/google', strict, async (req, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpError(501, 'Google sign-in is not configured yet', 'not_configured');
    const body = z.object({ idToken: z.string().min(20), deviceId, favourites: z.array(z.string().uuid()).max(500).optional() }).parse(req.body);
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.idToken)}`);
    if (!res.ok) throw new HttpError(401, 'Google could not confirm this sign-in', 'invalid_token');
    const info = (await res.json()) as { aud?: string; sub?: string; email?: string; email_verified?: string; name?: string };
    if (info.aud !== clientId || !info.sub) throw new HttpError(401, 'Google could not confirm this sign-in', 'invalid_token');
    const em = info.email_verified === 'true' ? info.email?.toLowerCase() ?? null : null;
    const { rows } = await q(
      `INSERT INTO users (email, google_sub, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (google_sub) DO UPDATE SET last_seen_at = now()
       RETURNING id, email, role`,
      [em, info.sub, info.name ?? null],
    ).catch(async (e) => {
      // Existing email account: link Google to it.
      if (em && /users_email_key/.test(String(e.message))) {
        return q(`UPDATE users SET google_sub = $2, last_seen_at = now() WHERE email = $1 RETURNING id, email, role`, [em, info.sub]);
      }
      throw e;
    });
    await mergeGuest(rows[0].id, body.deviceId, body.favourites);
    await createSession(reply, rows[0].id);
    return { user: rows[0] };
  });

  // ---- Vendors: SMS code ----
  app.post('/auth/phone/start', strict, async (req) => {
    const body = z.object({ phone }).parse(req.body);
    const code = randomCode(6);
    await q(`INSERT INTO login_tokens (kind, target, token_hash, expires_at) VALUES ('phone_code', $1, $2, now() + make_interval(mins => $3))`, [
      body.phone,
      sha256(code),
      CODE_TTL_MIN,
    ]);
    await outbox.sms(body.phone, `Your Karibu code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`);
    return { sent: true, ...(config.exposeDevSecrets ? { devCode: code } : {}) };
  });

  app.post('/auth/phone/verify', strict, async (req, reply) => {
    const body = z.object({ phone, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const user = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT id, token_hash, attempts FROM login_tokens
          WHERE target = $1 AND kind = 'phone_code' AND used_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [body.phone],
      );
      const t = rows[0];
      if (!t || t.attempts >= MAX_CODE_ATTEMPTS) throw badRequest('This code has expired. Ask for a new one.', 'invalid_code');
      if (!safeEqual(t.token_hash, sha256(body.code))) {
        await c.query('UPDATE login_tokens SET attempts = attempts + 1 WHERE id = $1', [t.id]);
        throw badRequest('That code is not right. Check the SMS and try again.', 'invalid_code');
      }
      await c.query('UPDATE login_tokens SET used_at = now() WHERE id = $1', [t.id]);
      const u = await c.query(
        `INSERT INTO users (phone_e164, role) VALUES ($1, 'vendor')
         ON CONFLICT (phone_e164) DO UPDATE SET last_seen_at = now()
         RETURNING id, phone_e164 AS phone, role`,
        [body.phone],
      );
      return u.rows[0];
    });
    // The insert above can return a 400 inside tx; reaching here means success.
    await createSession(reply, user.id);
    return { user };
  });

  app.post('/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/me', async (req) => {
    if (!req.user) return { user: null };
    const vendors = await q(
      `SELECT v.id, v.name, v.slug, v.plan, v.verification_level AS "verificationLevel"
         FROM vendor_members m JOIN vendors v ON v.id = m.vendor_id WHERE m.user_id = $1`,
      [req.user.id],
    );
    return { user: req.user, vendors: vendors.rows };
  });

  app.patch('/me', async (req) => {
    const u = requireUser(req);
    const body = z.object({ displayName: z.string().trim().min(1).max(80) }).parse(req.body);
    await q('UPDATE users SET display_name = $2 WHERE id = $1', [u.id, body.displayName]);
    return { ok: true };
  });

  /** Account deletion: personal data removed; reviews stay anonymised. */
  app.delete('/me', async (req, reply) => {
    const u = requireUser(req);
    await tx(async (c) => {
      await c.query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM favourites WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM trips WHERE owner_id = $1', [u.id]);
      // users must keep one identifier, so an opaque placeholder replaces the real ones.
      await c.query(
        `UPDATE users SET email = 'deleted+' || id || '@invalid', phone_e164 = NULL, google_sub = NULL, apple_sub = NULL,
                display_name = NULL, deleted_at = now() WHERE id = $1`,
        [u.id],
      );
    });
    reply.clearCookie('kb_session', { path: '/' });
    return { deleted: true };
  });
}
