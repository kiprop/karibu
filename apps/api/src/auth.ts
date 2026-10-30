import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from './config.js';
import { q } from './db/pool.js';
import { HttpError, randomToken, sha256 } from './lib/util.js';

export type Role = 'traveller' | 'vendor' | 'reviewer' | 'admin';
export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  role: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    deviceId: string | null;
  }
}

export const SESSION_COOKIE = 'kb_session';

export async function createSession(reply: FastifyReply, userId: string) {
  const token = randomToken();
  await q(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [
    userId,
    sha256(token),
    config.sessionDays,
  ]);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionDays * 86400,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('user', null);
  app.decorateRequest('deviceId', null);
  app.addHook('onRequest', async (req) => {
    const dev = req.headers['x-device-id'];
    req.deviceId = typeof dev === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(dev) ? dev : null;
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const { rows } = await q(
      `SELECT u.id, u.email, u.phone_e164 AS phone, u.display_name AS "displayName", u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.deleted_at IS NULL`,
      [sha256(token)],
    );
    req.user = rows[0] ?? null;
  });
});

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'Please sign in to do this', 'unauthenticated');
  return req.user;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): SessionUser {
  const u = requireUser(req);
  if (!roles.includes(u.role)) throw new HttpError(403, 'Your account cannot do this', 'forbidden');
  return u;
}
