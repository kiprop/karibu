import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

export async function makeApp() {
  return buildApp({ logger: false, rateLimit: false });
}

/** A tiny cookie-jar client around fastify.inject. */
export function client(app: FastifyInstance, headers: Record<string, string> = {}) {
  let cookie = '';
  const call = async (method: string, url: string, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await app.inject({
      method: method as any,
      url: `/v1${url}`,
      payload: body === undefined ? undefined : (body as any),
      headers: { ...headers, ...extra, ...(cookie ? { cookie } : {}) },
    });
    const set = res.headers['set-cookie'];
    if (set) {
      const first = (Array.isArray(set) ? set : [set]).find((c) => c.startsWith('kb_session='));
      if (first) cookie = first.split(';')[0].endsWith('=') ? '' : first.split(';')[0];
    }
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, json, raw: res };
  };
  return {
    get: (u: string, h?: Record<string, string>) => call('GET', u, undefined, h),
    post: (u: string, b?: unknown, h?: Record<string, string>) => call('POST', u, b ?? {}, h),
    put: (u: string, b?: unknown, h?: Record<string, string>) => call('PUT', u, b ?? {}, h),
    patch: (u: string, b?: unknown) => call('PATCH', u, b ?? {}),
    del: (u: string) => call('DELETE', u),
    get cookie() {
      return cookie;
    },
  };
}

export async function signInEmail(c: ReturnType<typeof client>, email: string, extra: Record<string, unknown> = {}) {
  const start = await c.post('/auth/email/start', { email });
  if (start.status !== 200) throw new Error(JSON.stringify(start.json));
  const v = await c.post('/auth/email/verify', { token: start.json.devToken, ...extra });
  if (v.status !== 200) throw new Error(JSON.stringify(v.json));
  return v.json.user;
}

export async function signInPhone(c: ReturnType<typeof client>, phone: string) {
  const s = await c.post('/auth/phone/start', { phone });
  const v = await c.post('/auth/phone/verify', { phone, code: s.json.devCode });
  if (v.status !== 200) throw new Error(JSON.stringify(v.json));
  return v.json.user;
}
