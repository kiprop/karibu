'use client';

/** Browser-side calls go to /api/*, which Next.js proxies to the Node API. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('kb_device');
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      localStorage.setItem('kb_device', id);
    }
    return id;
  } catch {
    return 'nodevice-' + Math.random().toString(36).slice(2, 12);
  }
}

export async function call<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: { ...(opts.form ? {} : { 'content-type': 'application/json' }), 'x-device-id': deviceId() },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

// ---- Guest favourites live on the device until the traveller signs in ----
const FAV_KEY = 'kb_favourites';
export function guestFavourites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]');
  } catch {
    return [];
  }
}
export function setGuestFavourites(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...new Set(ids)].slice(0, 200)));
    window.dispatchEvent(new Event('kb-favourites'));
  } catch {}
}
