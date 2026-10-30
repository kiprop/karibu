import 'server-only';
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Server-side call to the API, forwarding the visitor's session cookie. */
export async function api<T = any>(path: string, init: RequestInit & { revalidate?: number } = {}): Promise<T> {
  const jar = await cookies();
  const session = jar.get('kb_session')?.value;
  const res = await fetch(`${API_URL}/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(session ? { cookie: `kb_session=${session}` } : {}), ...(init.headers ?? {}) },
    // Signed-in responses are personal; public lists can be cached briefly.
    ...(session || init.method ? { cache: 'no-store' as const } : { next: { revalidate: init.revalidate ?? 60 } }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export async function getMe() {
  try {
    return await api<import('./types').Me>('/me', { cache: 'no-store' } as any);
  } catch {
    return { user: null };
  }
}
