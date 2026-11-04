import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { q, tx } from '../db/pool.js';
import { outbox } from '../lib/notify.js';
import { assertGoodPassword, checkPassword, hashPassword } from '../lib/passwords.js';
import {
  ROLE_LABEL, ROLE_PERMS, audit, createStaffSession, destroyStaffSession, permsOf, requireStaff,
  type Staff, type StaffRole,
} from '../lib/staff.js';
import { enrolment, newRecoveryCodes, newTotpSecret, normaliseRecovery, openSecret, sealSecret, verifyTotp } from '../lib/totp.js';
import { HttpError, badRequest, notFound, randomToken, sha256 } from '../lib/util.js';

const email = z.string().trim().toLowerCase().email().max(254);
const ROLES = Object.keys(ROLE_PERMS) as [StaffRole, ...StaffRole[]];
const MAX_TRIES = 5;
const LOCK_MIN = 15;
const INVITE_DAYS = 7;

const genericFail = () => new HttpError(401, 'That email and password don’t match a staff account.', 'bad_credentials');

/** Create a one-time staff token and return the raw value. */
async function issue(staffId: string, purpose: 'invite' | 'mfa' | 'enrol', minutes: number) {
  const token = randomToken();
  await q(`INSERT INTO staff_tokens (staff_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`, [
    staffId, purpose, sha256(token), minutes,
  ]);
  return token;
}

async function findToken(token: string, purpose: string) {
  const { rows } = await q(
    `SELECT t.id, t.attempts, m.id AS "staffId", m.email, m.display_name AS "displayName", m.role, m.country_code AS country,
            m.status, m.totp_secret, m.totp_last_step, m.recovery_codes, m.user_id AS "userId"
       FROM staff_tokens t JOIN staff_members m ON m.id = t.staff_id
      WHERE t.token_hash = $1 AND t.purpose = $2 AND t.used_at IS NULL AND t.expires_at > now()`,
    [sha256(token), purpose],
  );
  return rows[0] ?? null;
}

/** Make or reuse the users row that records this staff member as the actor on listing changes. */
async function actorUser(c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, em: string, name: string) {
  const { rows } = await c.query(
    `INSERT INTO users (email, display_name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [em, name],
  );
  return rows[0].id as string;
}

/** Add a staff member (or re-invite) and return the invitation link. Used by the Team page, the seed and the CLI. */
export async function inviteStaff(input: { email: string; displayName: string; role: StaffRole; country?: string | null; invitedBy?: string | null; reset?: boolean }) {
  const em = input.email.trim().toLowerCase();
  const staffId = await tx(async (c) => {
    const existing = await c.query(`SELECT id, status FROM staff_members WHERE email = $1`, [em]);
    if (existing.rows[0]?.status === 'active' && !input.reset) throw new HttpError(409, 'That person is already an active staff member', 'exists');
    const userId = await actorUser(c, em, input.displayName);
    const { rows } = await c.query(
      `INSERT INTO staff_members (user_id, email, display_name, role, country_code, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role, country_code = EXCLUDED.country_code,
              status = 'invited', password_hash = NULL, totp_secret = NULL, totp_enabled_at = NULL, recovery_codes = '{}'
       RETURNING id`,
      [userId, em, input.displayName, input.role, input.country ?? null, input.invitedBy ?? null],
    );
    await c.query(`UPDATE staff_tokens SET used_at = now() WHERE staff_id = $1 AND used_at IS NULL`, [rows[0].id]);
    await c.query(`DELETE FROM staff_sessions WHERE staff_id = $1`, [rows[0].id]);
    return rows[0].id as string;
  });
  const token = await issue(staffId, 'invite', INVITE_DAYS * 24 * 60);
  const link = `${config.webUrl}/admin/invite?token=${encodeURIComponent(token)}`;
  await outbox.email(
    em,
    'You’re invited to the EI Karibu staff console',
    `Hello ${input.displayName},\n\nYou've been added to the EI Karibu staff console as ${ROLE_LABEL[input.role]}${input.country ? ` for ${input.country}` : ''}.\n\nSet your password and two-step check here (the link works once, for ${INVITE_DAYS} days):\n\n${link}\n\nYou'll need an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.`,
  );
  return { staffId, link };
}

function publicStaff(s: Pick<Staff, 'id' | 'email' | 'displayName' | 'role' | 'country'>) {
  return { id: s.id, email: s.email, displayName: s.displayName, role: s.role, roleLabel: ROLE_LABEL[s.role], country: s.country, perms: permsOf(s.role) };
}

export async function staffRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };

  // ---------------- Sign in, step 1: email and password ----------------
  app.post('/staff/auth/login', strict, async (req) => {
    const b = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body);
    const { rows } = await q(
      `SELECT id, display_name AS "displayName", role, status, password_hash, locked_until > now() AS locked,
              ceil(extract(epoch FROM locked_until - now()) / 60) AS mins
         FROM staff_members WHERE email = $1`,
      [b.email],
    );
    const m = rows[0];
    if (m?.locked) {
      await audit(req, null, 'Sign-in blocked (locked)', { type: 'staff', id: m.id, label: b.email });
      throw new HttpError(429, `Too many failed attempts. Try again in ${m.mins} minute${m.mins === 1 ? '' : 's'}.`, 'locked');
    }
    const ok = await checkPassword(m?.status === 'active' ? m.password_hash : null, b.password);
    if (!m || m.status !== 'active' || !ok) {
      if (m) {
        const r = await q(
          `UPDATE staff_members SET failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
                  locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
            WHERE id = $1 RETURNING locked_until > now() AS locked`,
          [m.id, MAX_TRIES, LOCK_MIN],
        );
        await audit(req, null, r.rows[0].locked ? `Sign-in blocked: ${MAX_TRIES} wrong passwords, locked ${LOCK_MIN} min` : 'Sign-in failed: wrong password', { type: 'staff', id: m.id, label: b.email });
      }
      throw genericFail();
    }
    return { next: 'code', challenge: await issue(m.id, 'mfa', 5) };
  });

  // ---------------- Sign in, step 2: authenticator code (or a recovery code) ----------------
  app.post('/staff/auth/code', strict, async (req, reply) => {
    const b = z.object({ challenge: z.string().min(20).max(200), code: z.string().trim().min(6).max(20) }).parse(req.body);
    const t = await findToken(b.challenge, 'mfa');
    if (!t || t.attempts >= MAX_TRIES || t.status !== 'active') throw badRequest('This sign-in has expired. Start again.', 'expired');
    let step: number | null = null;
    let usedRecovery: string | null = null;
    if (/^\d{6}$/.test(b.code)) {
      step = verifyTotp(openSecret(t.totp_secret), b.code, t.totp_last_step === null ? null : Number(t.totp_last_step));
    } else {
      const h = sha256(normaliseRecovery(b.code));
      if ((t.recovery_codes as string[]).includes(h)) usedRecovery = h;
    }
    if (step === null && !usedRecovery) {
      await q(`UPDATE staff_tokens SET attempts = attempts + 1 WHERE id = $1`, [t.id]);
      await audit(req, { id: t.staffId, displayName: t.displayName, role: t.role }, 'Sign-in failed: wrong code', { type: 'staff', id: t.staffId, label: t.email });
      throw badRequest('That code isn’t right. Codes change every 30 seconds; use the newest one.', 'invalid_code');
    }
    await q(`UPDATE staff_tokens SET used_at = now() WHERE id = $1`, [t.id]);
    if (step !== null) await q(`UPDATE staff_members SET totp_last_step = $2 WHERE id = $1`, [t.staffId, step]);
    if (usedRecovery) await q(`UPDATE staff_members SET recovery_codes = array_remove(recovery_codes, $2) WHERE id = $1`, [t.staffId, usedRecovery]);
    await createStaffSession(req, reply, t.staffId);
    await audit(req, { id: t.staffId, displayName: t.displayName, role: t.role }, 'Signed in', { type: 'staff', id: t.staffId, label: t.email },
      null, { method: usedRecovery ? 'recovery code' : 'authenticator', userAgent: String(req.headers['user-agent'] ?? '').slice(0, 160) });
    return { staff: publicStaff({ id: t.staffId, email: t.email, displayName: t.displayName, role: t.role, country: t.country?.trim() ?? null }), usedRecovery: !!usedRecovery };
  });

  // ---------------- Invitations: set a password, then link an authenticator ----------------
  app.get('/staff/invite', async (req) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(req.query);
    const t = await findToken(token, 'invite');
    if (!t) throw badRequest('This invitation has expired or was already used. Ask an Owner for a new one.', 'expired');
    return { email: t.email, displayName: t.displayName, role: t.role, roleLabel: ROLE_LABEL[t.role as StaffRole], country: t.country?.trim() ?? null };
  });

  app.post('/staff/invite/accept', strict, async (req) => {
    const b = z.object({ token: z.string().min(20).max(200), password: z.string().max(200) }).parse(req.body);
    const t = await findToken(b.token, 'invite');
    if (!t) throw badRequest('This invitation has expired or was already used. Ask an Owner for a new one.', 'expired');
    if (b.password.length < 12) throw badRequest('Staff passwords need at least 12 characters. A short phrase of a few words works well.', 'weak_password');
    await assertGoodPassword(b.password, [t.email, t.displayName]);
    const secret = newTotpSecret();
    await q(`UPDATE staff_members SET password_hash = $2, totp_secret = $3, totp_enabled_at = NULL WHERE id = $1`, [t.staffId, await hashPassword(b.password), sealSecret(secret)]);
    await q(`UPDATE staff_tokens SET used_at = now() WHERE id = $1`, [t.id]);
    return { challenge: await issue(t.staffId, 'enrol', 30), enrol: await enrolment(t.email, secret) };
  });

  app.post('/staff/auth/enrol', strict, async (req, reply) => {
    const b = z.object({ challenge: z.string().min(20).max(200), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const t = await findToken(b.challenge, 'enrol');
    if (!t || t.attempts >= 10) throw badRequest('Set-up has expired. Ask an Owner for a new invitation.', 'expired');
    const step = verifyTotp(openSecret(t.totp_secret), b.code, null);
    if (step === null) {
      await q(`UPDATE staff_tokens SET attempts = attempts + 1 WHERE id = $1`, [t.id]);
      throw badRequest('That code isn’t right. Check the time on your phone is set automatically, and use the newest code.', 'invalid_code');
    }
    const codes = newRecoveryCodes();
    await q(
      `UPDATE staff_members SET totp_enabled_at = now(), totp_last_step = $2, status = 'active', recovery_codes = $3 WHERE id = $1`,
      [t.staffId, step, codes.map((c) => sha256(normaliseRecovery(c)))],
    );
    await q(`UPDATE staff_tokens SET used_at = now() WHERE id = $1`, [t.id]);
    await createStaffSession(req, reply, t.staffId);
    await audit(req, { id: t.staffId, displayName: t.displayName, role: t.role }, 'Joined: password and two-step check set up', { type: 'staff', id: t.staffId, label: t.email });
    return { recoveryCodes: codes, staff: publicStaff({ id: t.staffId, email: t.email, displayName: t.displayName, role: t.role, country: t.country?.trim() ?? null }) };
  });

  app.post('/staff/auth/logout', async (req, reply) => {
    if (req.staff) await audit(req, req.staff, 'Signed out', { type: 'staff', id: req.staff.id, label: req.staff.email });
    await destroyStaffSession(req, reply);
    return { ok: true };
  });

  // ---------------- Who am I, and what's waiting ----------------
  app.get('/staff/me', async (req) => {
    if (!req.staff) return { staff: null };
    const s = req.staff;
    const sc = s.country;
    const { rows } = await q(
      `SELECT
         (SELECT count(*) FROM listings l JOIN vendors v ON v.id = l.vendor_id WHERE l.status IN ('submitted','in_review') AND ($1::char(2) IS NULL OR v.country_code = $1)) AS queue,
         (SELECT count(*) FROM reports r LEFT JOIN listings l ON l.id = r.listing_id LEFT JOIN cities c ON c.id = l.city_id
           WHERE r.status = 'open' AND ($1::char(2) IS NULL OR c.country_code IS NULL OR c.country_code = $1)) AS reports,
         (SELECT count(*) FROM reports r WHERE r.status = 'open' AND r.category IN ('safety','scam') AND r.created_at < now() - interval '4 hours') AS "overdueSafety",
         (SELECT count(*) FROM staff_approvals a WHERE a.status = 'pending' AND a.requested_by <> $2 AND ($1::char(2) IS NULL OR a.country_code = $1)) AS approvals,
         (SELECT count(*) FROM field_visits f WHERE f.status = 'booked' AND f.assigned_to = $2) AS "myVisits",
         (SELECT count(*) FROM country_links k WHERE k.is_active AND k.last_checked_on < current_date - 90 AND ($1::char(2) IS NULL OR k.country_code = $1)) AS "staleLinks",
         (SELECT count(*) FROM reviews WHERE status = 'published' AND created_at > now() - interval '7 days') AS "newExperiences",
         (SELECT count(*) FROM price_reports WHERE NOT is_hidden AND created_at > now() - interval '7 days') AS "newPrices",
         (SELECT count(*) FROM recommendations WHERE created_at > now() - interval '30 days') AS recommendations,
         (SELECT array_length(recovery_codes, 1) FROM staff_members WHERE id = $2) AS "recoveryLeft"`,
      [sc, s.id],
    );
    return { staff: publicStaff(s), counts: rows[0], idleMinutes: Number(process.env.STAFF_IDLE_MINUTES ?? 30) };
  });

  app.post('/staff/me/password', strict, async (req) => {
    const s = requireStaff(req);
    const b = z.object({ current: z.string().max(200), password: z.string().max(200) }).parse(req.body);
    const { rows } = await q(`SELECT password_hash FROM staff_members WHERE id = $1`, [s.id]);
    if (!(await checkPassword(rows[0].password_hash, b.current))) throw badRequest('Your current password isn’t right', 'bad_credentials');
    if (b.password.length < 12) throw badRequest('Staff passwords need at least 12 characters', 'weak_password');
    await assertGoodPassword(b.password, [s.email, s.displayName]);
    await q(`UPDATE staff_members SET password_hash = $2 WHERE id = $1`, [s.id, await hashPassword(b.password)]);
    await q(`DELETE FROM staff_sessions WHERE staff_id = $1 AND id <> $2`, [s.id, s.sessionId]);
    await audit(req, s, 'Changed own password', { type: 'staff', id: s.id, label: s.email });
    return { ok: true };
  });

  app.post('/staff/me/recovery-codes', strict, async (req) => {
    const s = requireStaff(req);
    const b = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const { rows } = await q(`SELECT totp_secret, totp_last_step FROM staff_members WHERE id = $1`, [s.id]);
    const step = verifyTotp(openSecret(rows[0].totp_secret), b.code, rows[0].totp_last_step === null ? null : Number(rows[0].totp_last_step));
    if (step === null) throw badRequest('That code isn’t right', 'invalid_code');
    const codes = newRecoveryCodes();
    await q(`UPDATE staff_members SET recovery_codes = $2, totp_last_step = $3 WHERE id = $1`, [s.id, codes.map((c) => sha256(normaliseRecovery(c))), step]);
    await audit(req, s, 'Made new recovery codes', { type: 'staff', id: s.id, label: s.email });
    return { recoveryCodes: codes };
  });

  app.post('/staff/me/sessions/end-others', async (req) => {
    const s = requireStaff(req);
    const r = await q(`DELETE FROM staff_sessions WHERE staff_id = $1 AND id <> $2`, [s.id, s.sessionId]);
    await audit(req, s, 'Signed out other devices', { type: 'staff', id: s.id, label: s.email });
    return { ended: r.rowCount };
  });

  // ---------------- Team (Owners only) ----------------
  app.get('/staff/team', async (req) => {
    requireStaff(req, 'staff.manage');
    const { rows } = await q(
      `SELECT m.id, m.email, m.display_name AS "displayName", m.role, m.country_code AS country, m.status,
              m.totp_enabled_at IS NOT NULL AS "twoStep", m.last_login_at AS "lastLoginAt", m.created_at AS "createdAt",
              m.locked_until > now() AS locked, coalesce(array_length(m.recovery_codes, 1), 0) AS "recoveryLeft",
              (SELECT count(*) FROM staff_sessions s WHERE s.staff_id = m.id AND s.expires_at > now()
                  AND s.last_seen_at > now() - make_interval(mins => $1)) AS "activeSessions",
              i.display_name AS "invitedBy"
         FROM staff_members m LEFT JOIN staff_members i ON i.id = m.invited_by
        ORDER BY m.status = 'disabled', m.role, m.display_name`,
      [Number(process.env.STAFF_IDLE_MINUTES ?? 30)],
    );
    return { team: rows.map((r) => ({ ...r, country: r.country?.trim() ?? null, roleLabel: ROLE_LABEL[r.role as StaffRole] })), roles: ROLES.map((r) => ({ role: r, label: ROLE_LABEL[r], perms: ROLE_PERMS[r] })) };
  });

  app.post('/staff/team/invite', strict, async (req) => {
    const s = requireStaff(req, 'staff.manage');
    const b = z.object({ email, displayName: z.string().trim().min(2).max(80), role: z.enum(ROLES), country: z.string().length(2).toUpperCase().nullable().optional() }).parse(req.body);
    const out = await inviteStaff({ ...b, invitedBy: s.id });
    await audit(req, s, `Invited staff member as ${ROLE_LABEL[b.role]}`, { type: 'staff', id: out.staffId, label: b.email, country: b.country ?? null });
    return { invited: true, ...(config.exposeDevSecrets ? { devLink: out.link } : {}) };
  });

  async function assertOwnerRemains(exceptId: string) {
    const { rows } = await q(`SELECT count(*) AS n FROM staff_members WHERE role = 'owner' AND status = 'active' AND id <> $1`, [exceptId]);
    if (rows[0].n === 0) throw badRequest('Karibu must always have at least one active Owner. Make someone else Owner first.');
  }

  app.patch('/staff/team/:id', async (req) => {
    const s = requireStaff(req, 'staff.manage');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const b = z.object({ role: z.enum(ROLES).optional(), country: z.string().length(2).toUpperCase().nullable().optional(), status: z.enum(['active', 'disabled']).optional(), reason: z.string().trim().max(300).optional() }).parse(req.body);
    const { rows } = await q(`SELECT email, role, status, totp_enabled_at FROM staff_members WHERE id = $1`, [id]);
    const m = rows[0];
    if (!m) throw notFound();
    if (id === s.id && (b.status === 'disabled' || (b.role && b.role !== m.role))) throw badRequest('You can’t change your own role or disable yourself. Ask another Owner.');
    if (m.role === 'owner' && ((b.role && b.role !== 'owner') || b.status === 'disabled')) await assertOwnerRemains(id);
    if (b.status === 'active' && !m.totp_enabled_at) throw badRequest('This person hasn’t finished setting up. Send a new invitation instead.');
    await q(
      `UPDATE staff_members SET role = coalesce($2, role), country_code = CASE WHEN $3 THEN $4 ELSE country_code END, status = coalesce($5, status) WHERE id = $1`,
      [id, b.role ?? null, b.country !== undefined, b.country ?? null, b.status ?? null],
    );
    if (b.status === 'disabled' || b.role) await q(`DELETE FROM staff_sessions WHERE staff_id = $1`, [id]);
    const what = [b.role && `role → ${ROLE_LABEL[b.role]}`, b.country !== undefined && `country → ${b.country ?? 'all'}`, b.status && `status → ${b.status}`].filter(Boolean).join(', ');
    await audit(req, s, `Changed staff member: ${what}`, { type: 'staff', id, label: m.email, country: b.country ?? null }, b.reason ?? null);
    return { ok: true };
  });

  /** Lost phone or forgotten password: the person sets everything up again from a new invitation. */
  app.post('/staff/team/:id/reset', async (req) => {
    const s = requireStaff(req, 'staff.manage');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    if (id === s.id) throw badRequest('Ask another Owner to reset your own sign-in');
    const { rows } = await q(`SELECT email, display_name AS "displayName", role, country_code AS country FROM staff_members WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound();
    if (rows[0].role === 'owner') await assertOwnerRemains(id);
    const out = await inviteStaff({ email: rows[0].email, displayName: rows[0].displayName, role: rows[0].role, country: rows[0].country?.trim() ?? null, invitedBy: s.id, reset: true });
    await audit(req, s, 'Reset sign-in and sent a new invitation', { type: 'staff', id, label: rows[0].email });
    return { reset: true, ...(config.exposeDevSecrets ? { devLink: out.link } : {}) };
  });

  app.post('/staff/team/:id/end-sessions', async (req) => {
    const s = requireStaff(req, 'staff.manage');
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await q(`DELETE FROM staff_sessions WHERE staff_id = $1 AND id <> $2`, [id, s.sessionId]);
    await audit(req, s, 'Signed a staff member out everywhere', { type: 'staff', id });
    return { ended: r.rowCount };
  });
}
