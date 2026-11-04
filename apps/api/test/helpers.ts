import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

export async function makeApp() {
  return buildApp({ logger: process.env.TEST_LOG ? ({ level: 'error' } as any) : false, rateLimit: false });
}

/** A tiny cookie-jar client around fastify.inject. */
export function client(app: FastifyInstance, headers: Record<string, string> = {}) {
  // Keeps both the account cookie (kb_session) and the staff console cookie (kb_staff).
  const jar = new Map<string, string>();
  const call = async (method: string, url: string, body?: unknown, extra: Record<string, string> = {}) => {
    const res = await app.inject({
      method: method as any,
      url: `/v1${url}`,
      payload: body === undefined ? undefined : (body as any),
      headers: { ...headers, ...extra, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
    });
    const set = res.headers['set-cookie'];
    for (const c of set ? (Array.isArray(set) ? set : [set]) : []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)];
      if (!v || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k);
      else jar.set(k, v);
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
      return jar.has('kb_session') ? `kb_session=${jar.get('kb_session')}` : '';
    },
    jar,
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

export const STAFF_PASSWORD = 'correct horse battery staple';

/** Invite a staff member and complete set-up (password and authenticator) the way a real person would. */
export async function staffClient(app: FastifyInstance, role: import('../src/lib/staff.js').StaffRole, opts: { email?: string; country?: string | null; name?: string } = {}) {
  const { inviteStaff } = await import('../src/routes/staff.js');
  const { totpAt, currentStep } = await import('../src/lib/totp.js');
  const email = opts.email ?? `${role}-${Math.random().toString(36).slice(2, 8)}@staff.example`;
  const out = await inviteStaff({ email, displayName: opts.name ?? role, role, country: opts.country ?? null });
  const token = new URL(out.link).searchParams.get('token')!;
  const c = client(app);
  const acc = await c.post('/staff/invite/accept', { token, password: STAFF_PASSWORD });
  if (acc.status !== 200) throw new Error(JSON.stringify(acc.json));
  const secret = acc.json.enrol.secret.replace(/\s/g, '');
  const en = await c.post('/staff/auth/enrol', { challenge: acc.json.challenge, code: totpAt(secret, currentStep()) });
  if (en.status !== 200) throw new Error(JSON.stringify(en.json));
  return Object.assign(c, { email, secret, recoveryCodes: en.json.recoveryCodes as string[], staffId: en.json.staff.id as string });
}
