/* EI Karibu offline helper.
 * Pages you open are kept so they work without signal (in a park, on a flight). The emergency card,
 * fair prices and Travel smart are saved on first visit. Personal and staff data are never cached. */
const VERSION = 'kb-v1';
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const DATA = `${VERSION}-data`;
const PRECACHE = ['/offline', '/safety/emergency', '/safety/prices', '/safety', '/manifest.webmanifest', '/brand/ei-logo-192.png'];
const NEVER = [/^\/api\/(me|auth|admin|staff|vendor|companion|ask|suggestions|demand|webhooks)/, /^\/admin/, /^\/vendor/, /^\/account/];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, max) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy)).then(() => trim(cacheName, max));
    }
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.match('/offline')) || Response.error();
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((re) => re.test(url.pathname))) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(STATIC).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, PAGES, 60));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(req, DATA, 120));
  }
});
