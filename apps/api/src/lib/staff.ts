import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { q } from '../db/pool.js';
import { HttpError, randomToken, sha256 } from './util.js';

/**
 * Staff roles and what each may do. Mirrors the role table agreed for Karibu:
 * sales never verifies, level 3 and business suspensions need a second person, and each role gets the least access it needs.
 */
export const PERMS = [
  'queue.view', 'queue.decide', 'level3.request', 'level3.approve', 'visits.view', 'visits.assign', 'visits.submit',
  'reports.view', 'reports.act', 'listing.suspend', 'vendor.suspend', 'suspension.confirm',
  'reviews.moderate', 'prices.moderate', 'content.edit', 'advisories.publish',
  'businesses.view', 'businesses.support', 'billing.view', 'billing.manage',
  'insights.view', 'insights.export', 'staff.manage', 'audit.view',
] as const;
export type Perm = (typeof PERMS)[number];
export type StaffRole =
  | 'owner' | 'country_lead' | 'verification_officer' | 'field_verifier' | 'trust_safety'
  | 'content_editor' | 'business_support' | 'finance' | 'analyst';

export const ROLE_PERMS: Record<StaffRole, readonly Perm[]> = {
  owner: PERMS,
  country_lead: [
    'queue.view', 'queue.decide', 'level3.request', 'level3.approve', 'visits.view', 'visits.assign', 'reports.view', 'reports.act',
    'listing.suspend', 'vendor.suspend', 'suspension.confirm', 'reviews.moderate', 'prices.moderate', 'content.edit', 'advisories.publish',
    'businesses.view', 'insights.view', 'insights.export', 'audit.view',
  ],
  verification_officer: ['queue.view', 'queue.decide', 'level3.request', 'visits.view', 'visits.assign', 'audit.view'],
  field_verifier: ['visits.submit'],
  trust_safety: ['reports.view', 'reports.act', 'listing.suspend', 'vendor.suspend', 'reviews.moderate', 'prices.moderate', 'audit.view'],
  content_editor: ['content.edit', 'prices.moderate'],
  business_support: ['businesses.view', 'businesses.support', 'insights.view'],
  finance: ['billing.view', 'billing.manage', 'insights.view'],
  analyst: ['insights.view', 'insights.export'],
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner', country_lead: 'Country lead', verification_officer: 'Verification officer', field_verifier: 'Field verifier',
  trust_safety: 'Trust and safety', content_editor: 'Content and prices editor', business_support: 'Business support',
  finance: 'Finance', analyst: 'Analyst (read-only)',
};

export interface Staff {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  country: string | null; // null = all countries
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    staff: Staff | null;
  }
}

export const STAFF_COOKIE = 'kb_staff';
export const STAFF_IDLE_MIN = Number(process.env.STAFF_IDLE_MINUTES ?? 30);
export const STAFF_MAX_HOURS = Number(process.env.STAFF_SESSION_HOURS ?? 12);

export const can = (s: Staff | { role: StaffRole }, p: Perm) => ROLE_PERMS[s.role].includes(p);
export const permsOf = (role: StaffRole) => [...ROLE_PERMS[role]];

export function ipOf(req: FastifyRequest) {
  return req.ip ?? null;
}

export async function createStaffSession(req: FastifyRequest, reply: FastifyReply, staffId: string) {
  const token = randomToken();
  await q(
    `INSERT INTO staff_sessions (staff_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [staffId, sha256(token), STAFF_MAX_HOURS, ipOf(req), String(req.headers['user-agent'] ?? '').slice(0, 300)],
  );
  await q(`UPDATE staff_members SET last_login_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1`, [staffId]);
  // Strict same-site and no Max-Age: the cookie also ends when the browser closes.
  reply.setCookie(STAFF_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.cookieSecure, path: '/' });
}

export async function destroyStaffSession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[STAFF_COOKIE];
  if (token) await q('DELETE FROM staff_sessions WHERE token_hash = $1', [sha256(token)]);
  reply.clearCookie(STAFF_COOKIE, { path: '/' });
}

export const staffPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('staff', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[STAFF_COOKIE];
    if (!token) return;
    const { rows } = await q(
      `UPDATE staff_sessions s SET last_seen_at = now()
         FROM staff_members m
        WHERE s.token_hash = $1 AND m.id = s.staff_id AND m.status = 'active'
          AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(mins => $2)
        RETURNING m.id, m.user_id AS "userId", m.email, m.display_name AS "displayName", m.role, m.country_code AS country, s.id AS "sessionId"`,
      [sha256(token), STAFF_IDLE_MIN],
    );
    req.staff = rows[0] ? { ...rows[0], country: rows[0].country?.trim() ?? null } : null;
  });
});

export function requireStaff(req: FastifyRequest, ...perms: Perm[]): Staff {
  const s = req.staff;
  if (!s) throw new HttpError(401, 'Please sign in to the staff console', 'staff_unauthenticated');
  if (perms.length && !perms.some((p) => can(s, p))) throw new HttpError(403, 'Your role can’t do this', 'forbidden');
  return s;
}

/** Country scope as SQL: staff with a country see only that country's records. */
export function scope(s: Staff, column: string, params: unknown[]) {
  if (!s.country) return 'true';
  params.push(s.country);
  return `${column} = $${params.length}`;
}

export function assertInScope(s: Staff, country: string | null | undefined) {
  if (s.country && country && s.country !== country.trim()) throw new HttpError(403, 'That record is outside your country', 'out_of_scope');
}

export async function audit(
  req: FastifyRequest,
  s: Pick<Staff, 'id' | 'displayName' | 'role'> | null,
  action: string,
  target: { type?: string; id?: string | null; label?: string | null; country?: string | null } = {},
  reason?: string | null,
  meta?: Record<string, unknown>,
) {
  await q(
    `INSERT INTO staff_audit (staff_id, staff_name, staff_role, action, target_type, target_id, target_label, reason, country_code, ip, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [s?.id ?? null, s?.displayName ?? null, s?.role ?? null, action, target.type ?? null, target.id ?? null, target.label ?? null,
     reason ?? null, target.country?.trim() ?? null, ipOf(req), meta ? JSON.stringify(meta) : null],
  );
}

/**
 * True when nobody else active could give a second approval for this permission in this country.
 * A one-person team can then act alone, and the audit log records it as a solo decision.
 */
export async function isOnlyApprover(s: Staff, perm: Perm, country: string | null) {
  const roles = (Object.keys(ROLE_PERMS) as StaffRole[]).filter((r) => ROLE_PERMS[r].includes(perm));
  const { rows } = await q(
    `SELECT count(*) AS n FROM staff_members
      WHERE status = 'active' AND id <> $1 AND role = ANY($2::staff_role[]) AND (country_code IS NULL OR country_code = $3)`,
    [s.id, roles, country],
  );
  return rows[0].n === 0;
}
