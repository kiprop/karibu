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

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** An email or phone can belong to only one account. Refuse to add one that another account uses. */
async function assertFree(kind: 'email' | 'phone', value: string, userId: string, c: Db = { query: q }) {
  const col = kind === 'email' ? 'email' : 'phone_e164';
  const { rows } = await c.query(`SELECT id FROM users WHERE ${col} = $1 AND id <> $2 AND deleted_at IS NULL`, [value, userId]);
  if (rows[0]) {
    throw new HttpError(
      409,
      kind === 'email'
        ? 'That email already has its own Karibu account. Sign out and sign in with it, or use a different email.'
        : 'That number already has its own Karibu account. Sign out and sign in with it, or use a different number.',
      'in_use',
    );
  }
}

/** When a member proves an email or phone that matches their business's contact details, mark those verified. */
export async function syncVendorContacts(c: Db, userId: string) {
  await c.query(
    `UPDATE vendors v SET email_verified_at = coalesce(v.email_verified_at, now())
       FROM vendor_members m JOIN users u ON u.id = m.user_id
      WHERE m.vendor_id = v.id AND u.id = $1 AND u.email_verified_at IS NOT NULL AND v.email IS NOT NULL AND lower(v.email) = lower(u.email)`,
    [userId],
  );
  await c.query(
    `UPDATE vendors v SET whatsapp_verified_at = coalesce(v.whatsapp_verified_at, now())
       FROM vendor_members m JOIN users u ON u.id = m.user_id
      WHERE m.vendor_id = v.id AND u.id = $1 AND u.phone_verified_at IS NOT NULL AND v.whatsapp_e164 = u.phone_e164`,
    [userId],
  );
}

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } };

  // ---- Email: a one-time sign-in link. Same for travellers and businesses. ----
  // With add=true and a signed-in session, the link adds this email to the current account instead.
  app.post('/auth/email/start', strict, async (req) => {
    const body = z.object({ email, next: z.string().startsWith('/').max(200).optional(), add: z.boolean().optional() }).parse(req.body);
    const forUser = body.add ? requireUser(req).id : null;
    if (forUser) await assertFree('email', body.email, forUser);
    const token = randomToken();
    await q(`INSERT INTO login_tokens (kind, target, token_hash, expires_at, for_user_id) VALUES ('email_link', $1, $2, now() + make_interval(mins => $3), $4)`, [
      body.email,
      sha256(token),
      LINK_TTL_MIN,
      forUser,
    ]);
    const link = `${config.webUrl}/auth/verify?token=${encodeURIComponent(token)}${body.next ? `&next=${encodeURIComponent(body.next)}` : ''}`;
    const [subject, text] = forUser
      ? ['Confirm your email for Karibu', `Tap to add this email to your Karibu account, so you can sign in with it:\n\n${link}\n\nThis link works once and expires in ${LINK_TTL_MIN} minutes. If you didn't ask for it, ignore this email.`]
      : ['Your Karibu sign-in link', `Tap to sign in to Karibu:\n\n${link}\n\nThis link works once and expires in ${LINK_TTL_MIN} minutes. If you didn't ask for it, ignore this email.`];
    await outbox.email(body.email, subject, text);
    return { sent: true, ...(config.exposeDevSecrets ? { devLink: link, devToken: token } : {}) };
  });

  app.post('/auth/email/verify', strict, async (req, reply) => {
    const body = z
      .object({ token: z.string().min(20).max(200), deviceId, favourites: z.array(z.string().uuid()).max(500).optional(), displayName: z.string().max(80).optional() })
      .parse(req.body);
    const result = await tx(async (c) => {
      const { rows } = await c.query(
        `UPDATE login_tokens SET used_at = now()
          WHERE token_hash = $1 AND kind = 'email_link' AND used_at IS NULL AND expires_at > now()
          RETURNING target, for_user_id`,
        [sha256(body.token)],
      );
      if (!rows[0]) throw new HttpError(400, 'This sign-in link has expired or was already used. Ask for a new one.', 'invalid_token');
      const em = rows[0].target as string;
      if (rows[0].for_user_id) {
        await assertFree('email', em, rows[0].for_user_id, c);
        const u = await c.query(`UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1 RETURNING id, email, role`, [rows[0].for_user_id, em]);
        await syncVendorContacts(c, u.rows[0].id);
        return { user: u.rows[0], linked: true };
      }
      const u = await c.query(
        `INSERT INTO users (email, display_name, email_verified_at) VALUES ($1, $2, now())
         ON CONFLICT (email) DO UPDATE SET last_seen_at = now(), email_verified_at = coalesce(users.email_verified_at, now())
         RETURNING id, email, role`,
        [em, body.displayName ?? null],
      );
      await syncVendorContacts(c, u.rows[0].id);
      return { user: u.rows[0], linked: false };
    });
    await mergeGuest(result.user.id, body.deviceId, body.favourites);
    await createSession(reply, result.user.id);
    return result;
  });

  // ---- Google sign-in (ID token from Google Identity Services) ----
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
      `INSERT INTO users (email, google_sub, display_name, email_verified_at) VALUES ($1, $2, $3, CASE WHEN $1::text IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (google_sub) DO UPDATE SET last_seen_at = now()
       RETURNING id, email, role`,
      [em, info.sub, info.name ?? null],
    ).catch(async (e) => {
      // Existing email account: link Google to it.
      if (em && /users_email_key/.test(String(e.message))) {
        return q(`UPDATE users SET google_sub = $2, last_seen_at = now(), email_verified_at = coalesce(email_verified_at, now()) WHERE email = $1 RETURNING id, email, role`, [em, info.sub]);
      }
      throw e;
    });
    await mergeGuest(rows[0].id, body.deviceId, body.favourites);
    await createSession(reply, rows[0].id);
    return { user: rows[0] };
  });

  // ---- Phone: a 6-digit SMS code. Same for travellers and businesses. ----
  // With add=true and a signed-in session, the code adds this number to the current account instead.
  app.post('/auth/phone/start', strict, async (req) => {
    const body = z.object({ phone, add: z.boolean().optional() }).parse(req.body);
    const forUser = body.add ? requireUser(req).id : null;
    if (forUser) await assertFree('phone', body.phone, forUser);
    const code = randomCode(6);
    await q(`INSERT INTO login_tokens (kind, target, token_hash, expires_at, for_user_id) VALUES ('phone_code', $1, $2, now() + make_interval(mins => $3), $4)`, [
      body.phone,
      sha256(code),
      CODE_TTL_MIN,
      forUser,
    ]);
    await outbox.sms(body.phone, `Your Karibu code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`);
    return { sent: true, ...(config.exposeDevSecrets ? { devCode: code } : {}) };
  });

  app.post('/auth/phone/verify', strict, async (req, reply) => {
    const body = z
      .object({ phone, code: z.string().regex(/^\d{6}$/), deviceId, favourites: z.array(z.string().uuid()).max(500).optional() })
      .parse(req.body);
    const result = await tx(async (c) => {
      const { rows } = await c.query(
        `SELECT id, token_hash, attempts, for_user_id FROM login_tokens
          WHERE target = $1 AND kind = 'phone_code' AND used_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [body.phone],
      );
      const t = rows[0];
      if (!t || t.attempts >= MAX_CODE_ATTEMPTS) throw badRequest('This code has expired. Ask for a new one.', 'invalid_code');
      // An "add this number" code only works in the session that asked for it.
      if (t.for_user_id && t.for_user_id !== req.user?.id) throw badRequest('This code has expired. Ask for a new one.', 'invalid_code');
      if (!safeEqual(t.token_hash, sha256(body.code))) {
        await c.query('UPDATE login_tokens SET attempts = attempts + 1 WHERE id = $1', [t.id]);
        return { wrong: true as const };
      }
      await c.query('UPDATE login_tokens SET used_at = now() WHERE id = $1', [t.id]);
      if (t.for_user_id) {
        await assertFree('phone', body.phone, t.for_user_id, c);
        const u = await c.query(`UPDATE users SET phone_e164 = $2, phone_verified_at = now() WHERE id = $1 RETURNING id, phone_e164 AS phone, role`, [t.for_user_id, body.phone]);
        await syncVendorContacts(c, u.rows[0].id);
        return { user: u.rows[0], linked: true };
      }
      const u = await c.query(
        `INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now())
         ON CONFLICT (phone_e164) DO UPDATE SET last_seen_at = now(), phone_verified_at = coalesce(users.phone_verified_at, now())
         RETURNING id, phone_e164 AS phone, role`,
        [body.phone],
      );
      await syncVendorContacts(c, u.rows[0].id);
      return { user: u.rows[0], linked: false };
    });
    // Counted outside the transaction so a wrong code still uses up an attempt.
    if ('wrong' in result) throw badRequest('That code is not right. Check the SMS and try again.', 'invalid_code');
    if (!result.linked) await mergeGuest(result.user.id, body.deviceId, body.favourites);
    if (!result.linked) await createSession(reply, result.user.id);
    return result;
  });

  /** Remove a sign-in method. An account always keeps at least one way to sign in. */
  app.delete('/me/sign-in/:method', async (req) => {
    const u = requireUser(req);
    const { method } = z.object({ method: z.enum(['email', 'phone']) }).parse(req.params);
    const { rows } = await q(`SELECT email, phone_e164, google_sub FROM users WHERE id = $1`, [u.id]);
    const r = rows[0];
    const remaining = [method !== 'email' && r.email, method !== 'phone' && r.phone_e164, r.google_sub].filter(Boolean).length;
    if (!remaining) throw badRequest('Add another way to sign in before removing this one');
    await q(method === 'email' ? `UPDATE users SET email = NULL, email_verified_at = NULL WHERE id = $1` : `UPDATE users SET phone_e164 = NULL, phone_verified_at = NULL WHERE id = $1`, [u.id]);
    return { ok: true };
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
    const m = await q(
      `SELECT email, email_verified_at IS NOT NULL AS "emailVerified", phone_e164 AS phone, phone_verified_at IS NOT NULL AS "phoneVerified",
              google_sub IS NOT NULL AS google FROM users WHERE id = $1`,
      [req.user.id],
    );
    return { user: req.user, vendors: vendors.rows, signIn: m.rows[0] };
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
