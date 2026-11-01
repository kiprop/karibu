// Runtime proxy from the browser's /api/* to the Node API's /v1/*.
// Done here rather than with next.config rewrites because rewrites are fixed at build time,
// which breaks Docker and any deploy where API_URL is only known when the server starts.
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'host', 'content-length']);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = process.env.API_URL ?? 'http://localhost:4000';
  const url = `${base}/v1/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP.has(k)) headers.set(k, v);
  });
  const fwd = req.headers.get('x-forwarded-for');
  headers.set('x-forwarded-for', fwd ?? '127.0.0.1');

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      cache: 'no-store',
      // Required by Node's fetch when streaming a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    return Response.json({ error: 'Karibu is having trouble reaching its server. Please try again in a moment.' }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!HOP.has(k) && k !== 'set-cookie' && k !== 'content-encoding') out.set(k, v);
  });
  for (const c of upstream.headers.getSetCookie()) out.append('set-cookie', c);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
